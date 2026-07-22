"""Извлечение сущностей и связей из текста через LLM.

Портировано из graph_builder.py (Graph-Chat): фиксированные типы сущностей
и отношений делают граф предсказуемым для обхода, LLM ВЫБИРАЕТ отношение
из списка, а не выдумывает новые.
"""

from __future__ import annotations

import json
import logging
import re

from openai import OpenAI

from .config import settings

log = logging.getLogger("graphlens.extractor")

NODE_TYPES = [
    "Организация", "Показатель", "Период", "Сегмент",
    "Метрика", "Риск", "Цель", "Персона", "Документ",
    "Продукт", "Проект", "Термин",
]

RELATION_TYPES = [
    "имеет_значение",    # показатель → значение (ед.изм., год — в properties)
    "за_период",         # показатель/значение → период
    "относится_к",       # сущность → категория/сегмент
    "входит_в",          # часть → целое
    "сравнивается_с",    # показатель → показатель (сравнение)
    "прогноз_на",        # прогнозное значение → период
    "изменение_к",       # текущий показатель → предыдущий (динамика)
    "управляет",         # персона/орг → организация/проект
    "принадлежит",       # дочерняя организация → материнская
    "расположен_в",      # объект → место
    "возглавляет",       # персона → организация
    "зависит_от",        # показатель → фактор
    "влияет_на",         # фактор → показатель
    "составляет",        # часть → сумма
    "превышает",         # A > B (сравнение величин)
    "синоним",           # вариант названия → каноническое название
]

_SYSTEM = (
    "Ты — система извлечения знаний для построения графа из документов. "
    "Извлекай сущности и связи между ними. "
    "Отвечай ТОЛЬКО валидным JSON без пояснений и без рассуждений. "
    "Не используй markdown-форматирование, не оборачивай JSON в ```."
)

_USER_TMPL = (
    "Извлеки из текста сущности и связи для графа знаний.\n\n"
    "Типы сущностей (поле type): {types}.\n"
    "Типы связей (поле relation, ВЫБИРАЙ ТОЛЬКО ИЗ ЭТОГО СПИСКА): {relations}.\n\n"
    "Правила:\n"
    "- name — 1-3 слова, каноническая форма: «Выручка», «EBITDA», «2025 год», «АО Ромашка».\n"
    "- НЕ создавай узлы для чисел и значений (14 820, 15%, 100 млн ₽). "
    "Значения передавай в поле description связи.\n"
    "- Год/период — отдельный узел с типом «Период».\n"
    "- Если сущность не подходит ни под один тип — не создавай её.\n"
    "- Не выдумывай факты, бери только из текста.\n"
    "- Для синонимов (разные названия одной сущности) — связь синоним "
    "от варианта к каноническому названию.\n\n"
    'Формат строго: {{"nodes":[{{"name":"...","type":"...","description":"..."}}],'
    '"edges":[{{"source":"...","target":"...","relation":"...","description":"..."}}]}}\n\n'
    "Текст:\n{text}"
)


class Extractor:
    def __init__(self) -> None:
        self.client = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
        self.model = settings.llm_model

    def _chat(self, messages: list[dict], max_tokens: int) -> str:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.1,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""

    def extract(self, text: str) -> dict:
        """Извлекает сущности и связи из одного чанка."""
        trimmed = text[: settings.extract_max_chars]
        if len(text) > settings.extract_max_chars:
            log.warning("чанк обрезан до %s символов (было %s)", settings.extract_max_chars, len(text))
        messages = [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": _USER_TMPL.format(
                types=", ".join(NODE_TYPES),
                relations=", ".join(RELATION_TYPES),
                text=trimmed,
            )},
        ]
        try:
            raw = self._chat(messages, max_tokens=settings.llm_num_predict)
        except Exception:
            log.exception("LLM chat failed")
            return {"nodes": [], "edges": []}
        if not raw.strip():
            log.warning("LLM вернул пустой ответ")
            return {"nodes": [], "edges": []}
        data = None
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            data = _salvage_json(raw)
        if not isinstance(data, dict) or (not data.get("nodes") and not data.get("edges")):
            return {"nodes": [], "edges": []}
        return {"nodes": data.get("nodes") or [], "edges": data.get("edges") or []}

    def extract_batch(self, texts: list[str]) -> list[dict]:
        """Несколько чанков одним LLM-запросом; при ошибке - индивидуально."""
        if not texts:
            return []
        if len(texts) == 1:
            return [self.extract(texts[0])]
        blocks = [f"--- Фрагмент {i} ---\n{t[:4000]}" for i, t in enumerate(texts)]
        batch_prompt = (
            "Извлеки сущности и связи для графа знаний из следующих фрагментов.\n\n"
            f"Типы сущностей (поле type): {', '.join(NODE_TYPES)}.\n"
            f"Типы связей (поле relation, ВЫБИРАЙ ТОЛЬКО ИЗ СПИСКА): {', '.join(RELATION_TYPES)}.\n\n"
            "Правила:\n"
            "- name — 1-3 слова, каноническая форма.\n"
            "- НЕ создавай узлы для чисел и значений — передавай их в description связи.\n"
            "- Если сущность не подходит ни под один тип — не создавай её.\n"
            "- Не выдумывай факты.\n\n"
            'Формат ответа — строгий JSON: {"results": ['
            '{"chunk": 0, "nodes": [...], "edges": [...]}, ...]}\n\n'
            + "\n\n".join(blocks)
        )
        messages = [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": batch_prompt},
        ]
        try:
            raw = self._chat(messages, max_tokens=settings.llm_num_predict * len(texts))
            data = json.loads(raw)
            results = data.get("results") if isinstance(data, dict) else []
            if isinstance(results, list) and len(results) == len(texts):
                return [
                    {"nodes": r.get("nodes") or [], "edges": r.get("edges") or []}
                    if isinstance(r, dict) else {"nodes": [], "edges": []}
                    for r in results
                ]
        except Exception:
            log.warning("батч-извлечение не удалось, откат на индивидуальные вызовы")
        return [self.extract(t) for t in texts]


def _salvage_json(raw: str) -> dict:
    """Извлекает JSON из произвольного текста, включая обрезанный."""
    if not raw:
        return {}
    # 1. Убираем <think>...</think>.
    parts = re.split(r"</think>", raw)
    for part in reversed(parts):
        part = part.strip()
        if part and ("{" in part):
            raw = part
            break
    # 2. Markdown-блоки.
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.S)
    if m:
        try:
            return json.loads(m.group(1))
        except (json.JSONDecodeError, TypeError):
            pass
    # 3. Самый большой JSON-объект.
    best: dict = {}
    best_len = 0
    for m in re.finditer(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", raw):
        try:
            obj = json.loads(m.group(0))
            if isinstance(obj, dict):
                n = len(obj.get("nodes") or []) + len(obj.get("edges") or [])
                if n > best_len:
                    best, best_len = obj, n
        except (json.JSONDecodeError, TypeError):
            continue
    if best:
        return best
    # 4. Первый { ... }
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except (json.JSONDecodeError, TypeError):
            pass
    # 5. Обрезанный JSON: закрываем скобки.
    if start != -1:
        truncated = raw[start:]
        for suffix in ("}", "]}", "}]}", "}]}]}", '"}]}'):
            try:
                return json.loads(truncated + suffix)
            except (json.JSONDecodeError, TypeError):
                continue
        for pattern in (r",\s*\{[^}]*$", r',\s*"[^"]*$', r",\s*\w[^,}]*$"):
            cleaned = re.sub(pattern, "", truncated)
            for suffix in ("}]}", "]}", "}"):
                try:
                    return json.loads(cleaned + suffix)
                except (json.JSONDecodeError, TypeError):
                    continue
    return {}
