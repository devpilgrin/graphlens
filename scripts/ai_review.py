#!/usr/bin/env python3
"""AI Code Review для PR: diff -> LLM -> review на GitHub.

Запускается из GitHub Actions (workflow ai-review.yml).
Env: GITHUB_TOKEN, PR_NUMBER, REPO, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error

MAX_DIFF_CHARS = 60_000  # лимит контекста для LLM

GITHUB_API = "https://api.github.com"
TOKEN = os.environ["GITHUB_TOKEN"]
REPO = os.environ["REPO"]
PR_NUMBER = int(os.environ["PR_NUMBER"])
LLM_API_KEY = os.environ["LLM_API_KEY"]
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.kimi.com/coding/v1").rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "k3")

PROMPT = """Ты - строгий senior code reviewer. Проведи ревью diff'а pull request.

Проверь систематически:
- КОРРЕКТНОСТЬ: делает ли код заявленное, edge cases, обработка ошибок
- БЕЗОПАСНОСТЬ: секреты в коде, инъекции, невалидированный ввод
- КАЧЕСТВО: именование, дублирование, сложность, мёртвый код
- ПРОИЗВОДИТЕЛЬНОСТЬ: N+1, лишние аллокации, блокировки в async
- ТЕСТЫ И ДОКИ: покрыты ли изменения тестами

Формат ответа СТРОГО как JSON (без markdown-ограждений):
{
  "verdict": "APPROVE" | "COMMENT" | "REQUEST_CHANGES",
  "summary": "2-4 предложения: что делает PR и общая оценка",
  "critical": [{"path": "file.py", "line": 42, "comment": "описание проблемы"}],
  "warnings": [{"path": "file.py", "line": 10, "comment": "..."}],
  "suggestions": [{"path": "file.py", "line": 5, "comment": "..."}],
  "good": ["что сделано хорошо"]
}

Правила:
- verdict=REQUEST_CHANGES если есть хотя бы один critical
- verdict=APPROVE если нет critical и warnings
- line - номер строки в НОВОЙ версии файла (из diff)
- Если не уверен в номере строки - ставь line: 1
- Пиши комментарии по-русски, кратко и по делу
- Не выдумывай проблемы: лучше меньше, но точнее

DIFF PR:
"""


def gh_request(method: str, path: str, data: dict | None = None) -> dict | list:
    req = urllib.request.Request(
        f"{GITHUB_API}{path}",
        method=method,
        headers={
            "Authorization": f"token {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        data=json.dumps(data).encode() if data is not None else None,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}


def fetch_pr() -> tuple[dict, str]:
    pr_raw = gh_request("GET", f"/repos/{REPO}/pulls/{PR_NUMBER}")
    pr: dict = pr_raw if isinstance(pr_raw, dict) else {}
    # diff в текстовом виде
    req = urllib.request.Request(
        f"{GITHUB_API}/repos/{REPO}/pulls/{PR_NUMBER}",
        headers={
            "Authorization": f"token {TOKEN}",
            "Accept": "application/vnd.github.diff",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        diff = resp.read().decode("utf-8", errors="replace")
    return pr, diff


def call_llm(diff: str) -> dict:
    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n\n[... diff truncated ...]"
    body = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": "Ты code reviewer. Отвечай только валидным JSON."},
            {"role": "user", "content": PROMPT + diff},
        ],
    }
    # temperature опционален: некоторые модели (k3) принимают только 1
    temp = os.environ.get("LLM_TEMPERATURE")
    if temp is not None:
        body["temperature"] = float(temp)
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/chat/completions",
        method="POST",
        headers={
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json",
        },
        data=json.dumps(body).encode(),
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read().decode())
    text = result["choices"][0]["message"]["content"].strip()
    # Убираем возможные markdown-ограждения
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    return json.loads(text)


def format_body(review: dict, pr: dict) -> str:
    icons = {"APPROVE": "✅", "COMMENT": "💬", "REQUEST_CHANGES": "🔴"}
    verdict = review.get("verdict", "COMMENT")
    lines = [
        "## AI Code Review",
        "",
        f"**Вердикт: {icons.get(verdict, '💬')} {verdict}**",
        "",
        review.get("summary", ""),
        "",
    ]
    if review.get("critical"):
        lines.append("### 🔴 Critical")
        for c in review["critical"]:
            lines.append(f"- **{c.get('path', '?')}:{c.get('line', '?')}** — {c.get('comment', '')}")
        lines.append("")
    if review.get("warnings"):
        lines.append("### ⚠️ Warnings")
        for c in review["warnings"]:
            lines.append(f"- **{c.get('path', '?')}:{c.get('line', '?')}** — {c.get('comment', '')}")
        lines.append("")
    if review.get("suggestions"):
        lines.append("### 💡 Suggestions")
        for c in review["suggestions"]:
            lines.append(f"- **{c.get('path', '?')}:{c.get('line', '?')}** — {c.get('comment', '')}")
        lines.append("")
    if review.get("good"):
        lines.append("### ✅ Looks Good")
        for g in review["good"]:
            lines.append(f"- {g}")
        lines.append("")
    lines.append("---")
    lines.append(f"*AI review by `{LLM_MODEL}` for PR «{pr.get('title', '')}»*")
    return "\n".join(lines)


def post_review(pr: dict, review: dict) -> None:
    head_sha = pr["head"]["sha"]
    verdict = review.get("verdict", "COMMENT")
    if verdict not in ("APPROVE", "COMMENT", "REQUEST_CHANGES"):
        verdict = "COMMENT"

    # Inline-комментарии только для critical/warnings с валидными path/line
    inline = []
    files_raw = gh_request("GET", f"/repos/{REPO}/pulls/{PR_NUMBER}/files")
    files_list = files_raw if isinstance(files_raw, list) else []
    valid_paths = {f["filename"] for f in files_list if isinstance(f, dict)}
    for group in ("critical", "warnings"):
        for c in review.get(group, []):
            path, line = c.get("path"), c.get("line")
            if path in valid_paths and isinstance(line, int) and line > 0:
                inline.append({"path": path, "line": line, "body": c.get("comment", "")})
    inline = inline[:10]  # лимит GitHub на батч

    payload = {
        "commit_id": head_sha,
        "event": verdict,
        "body": format_body(review, pr),
    }
    if inline:
        payload["comments"] = inline
    try:
        gh_request("POST", f"/repos/{REPO}/pulls/{PR_NUMBER}/reviews", payload)
        print(f"Review posted: {verdict}, inline comments: {len(inline)}")
    except urllib.error.HTTPError as e:
        # Фолбэк: обычный комментарий без inline
        print(f"Review failed ({e.code}), fallback to comment", file=sys.stderr)
        gh_request(
            "POST",
            f"/repos/{REPO}/issues/{PR_NUMBER}/comments",
            {"body": format_body(review, pr)},
        )
        print("Posted as plain comment")


def main() -> None:
    pr, diff = fetch_pr()
    if not diff.strip():
        print("Empty diff, skipping")
        return
    print(f"PR #{PR_NUMBER}: {pr.get('title')} | diff: {len(diff)} chars")
    review = call_llm(diff)
    post_review(pr, review)


if __name__ == "__main__":
    main()
