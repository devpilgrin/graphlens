import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ExtractStatus } from "../types";

interface Props {
  collection: string;
  hasText: boolean;
  onFinished: () => void;
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-canvas px-2 py-1.5 text-center">
      <div className={`text-sm font-semibold tabular-nums ${tone ?? ""}`}>
        {value.toLocaleString("ru-RU")}
      </div>
      <div className="text-[10px] text-ink-mute">{label}</div>
    </div>
  );
}

export default function ExtractPanel({ collection, hasText, onFinished }: Props) {
  const [status, setStatus] = useState<ExtractStatus | null>(null);
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const wasRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const poll = useCallback(async () => {
    try {
      const s = await api.extractStatus();
      setStatus(s);
      if (wasRunning.current && !s.running) onFinishedRef.current();
      wasRunning.current = s.running;
      return s.running;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const loop = async () => {
      const running = await poll();
      if (cancelled) return;
      if (running && !timer) {
        timer = setInterval(async () => {
          const still = await poll();
          if (!still && timer) {
            clearInterval(timer);
            timer = null;
          }
        }, 2000);
      }
    };
    loop();
    const restart = setInterval(loop, 5000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      clearInterval(restart);
    };
  }, [poll]);

  const start = async () => {
    if (!collection || starting) return;
    setStarting(true);
    setError(null);
    try {
      const lim = parseInt(limit, 10);
      await api.extractStart(collection, Number.isFinite(lim) ? lim : undefined);
      wasRunning.current = true;
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    try {
      await api.extractCancel();
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const running = status?.running ?? false;
  const pct =
    status && status.total > 0
      ? Math.min(100, Math.round((status.processed / status.total) * 100))
      : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-mute">
        Извлечение графа
      </h2>

      {!running ? (
        <div className="flex flex-col gap-2">
          {!hasText && (
            <p className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
              В метаданных коллекции нет текста - извлечение невозможно.
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
              placeholder="limit (все)"
              inputMode="numeric"
              className="w-24 rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm placeholder:text-ink-mute focus:border-accent focus:outline-none"
            />
            <button
              onClick={start}
              disabled={!collection || !hasText || starting}
              className="flex-1 rounded-xl bg-amberacc px-4 py-2 text-sm font-semibold text-black shadow-md shadow-amberacc/20 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {starting ? "Запуск…" : "Построить граф"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-medium text-amberacc">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amberacc" />
              Извлечение идёт…
            </span>
            <span className="tabular-nums text-ink-dim">
              {status?.processed ?? 0}
              {status && status.total > 0 ? ` / ${status.total}` : ""}
              {pct !== null ? ` · ${pct}%` : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-accent to-amberacc transition-all duration-500 ${pct === null ? "w-1/3 animate-pulse" : ""}`}
              style={pct !== null ? { width: `${pct}%` } : undefined}
            />
          </div>
          <button
            onClick={cancel}
            className="self-end rounded-lg border border-line px-3 py-1 text-xs text-ink-dim transition hover:border-red-700 hover:text-red-400"
          >
            Отменить
          </button>
        </div>
      )}

      {status && (status.processed > 0 || status.nodes > 0) && (
        <div className="grid grid-cols-4 gap-1.5">
          <Counter label="обработано" value={status.processed} />
          <Counter label="узлов" value={status.nodes} tone="text-accent-soft" />
          <Counter label="рёбер" value={status.edges} tone="text-accent-soft" />
          <Counter
            label="ошибок"
            value={status.errors}
            tone={status.errors > 0 ? "text-red-400" : ""}
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
