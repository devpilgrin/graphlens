import { useState } from "react";
import { api } from "../api";
import type { SearchResponse } from "../types";
import { colorFor } from "../palette";

interface Props {
  collection: string;
  typeColors: Map<string, string>;
  onFocusEntity: (name: string) => void;
}

function truncate(s: string, n = 220) {
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

export default function SearchPanel({ collection, typeColors, onFocusEntity }: Props) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<SearchResponse | null>(null);

  const run = async () => {
    const q = question.trim();
    if (!q || !collection || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResp(await api.search(collection, q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResp(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-mute">
        Графовый поиск
      </h2>
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Задайте вопрос по коллекции…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm placeholder:text-ink-mute focus:border-accent focus:outline-none"
        />
        <button
          onClick={run}
          disabled={loading || !question.trim() || !collection}
          className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Ищу…" : "Найти"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          Ошибка поиска: {error}
        </p>
      )}

      {resp && (
        <>
          {resp.entities.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] text-ink-mute">Найденные сущности</p>
              <div className="flex flex-wrap gap-1.5">
                {resp.entities.map((ent) => (
                  <button
                    key={ent.name}
                    onClick={() => onFocusEntity(ent.name)}
                    title={ent.description}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-panel-2 py-1 pl-2 pr-2.5 text-xs transition hover:border-accent"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: colorFor(typeColors, ent.type) }}
                    />
                    {ent.name}
                    <span className="text-ink-mute">{ent.score.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {resp.results.length === 0 && (
              <p className="text-xs text-ink-mute">Ничего не найдено.</p>
            )}
            {resp.results.map((r) => (
              <article
                key={String(r.qdrant_id)}
                className="rounded-xl border border-line bg-panel-2 p-3 shadow-sm shadow-black/20"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-accent-soft">
                    {r.score.toFixed(3)}
                  </span>
                  {r.via_graph && (
                    <span className="flex items-center gap-1 rounded-md bg-emerald-950/70 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <circle cx="5" cy="6" r="2.5" fill="currentColor" />
                        <circle cx="19" cy="6" r="2.5" fill="currentColor" />
                        <circle cx="12" cy="18" r="2.5" fill="currentColor" />
                        <path d="M7 7l4 9M17 7l-4 9M7 6h10" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                      через граф
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-ink-mute">
                    вектор {r.vector_score.toFixed(3)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-ink-dim">{truncate(r.text)}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
