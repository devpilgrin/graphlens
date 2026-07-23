import { useState } from "react";
import type { ApiNode, ApiEdge } from "../types";
import { exportGraph, getCentralNode, type ExportOptions } from "../utils/export";

interface Props {
  nodes: ApiNode[];
  edges: ApiEdge[];
  typeColors: Map<string, string>;
  onClose: () => void;
}

export default function ExportModal({ nodes, edges, typeColors, onClose }: Props) {
  const [format, setFormat] = useState<"png" | "svg">("svg");
  const [scope, setScope] = useState<"full" | "subgraph" | "selected">("full");
  const [scale, setScale] = useState<number>(2);
  const [depth, setDepth] = useState<number>(2);
  const [centerNode, setCenterNode] = useState<string>(() => getCentralNode(nodes, edges) ?? "");
  const [transparentBg, setTransparentBg] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const options: ExportOptions = {
        format,
        scope,
        scale,
        depth: scope === "subgraph" ? depth : undefined,
        centerNode: scope === "subgraph" ? centerNode : undefined,
        transparentBackground: format === "png" ? transparentBg : undefined,
      };
      await exportGraph({ nodes, edges, typeColors }, options);
      onClose();
    } catch (e) {
      alert(`Ошибка экспорта: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/50">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Экспорт графа</h3>
          <button onClick={onClose} className="text-ink-mute transition hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Формат */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-ink-mute">Формат</p>
          <div className="flex gap-2">
            {(["svg", "png"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                  format === f
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line bg-panel-2 text-ink-dim hover:text-ink"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-mute">
            {format === "svg" ? "Векторный формат для масштабирования" : "Растровый формат с высоким разрешением"}
          </p>
        </div>

        {/* Область */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-ink-mute">Область экспорта</p>
          <div className="space-y-1.5">
            {([
              { value: "full", label: "Весь граф", desc: `${nodes.length} узлов, ${edges.length} связей` },
              { value: "subgraph", label: "Подграф вокруг узла", desc: "BFS от центрального узла" },
              { value: "selected", label: "Выделенные узлы", desc: "Только выбранные вами узлы" },
            ] as const).map((s) => (
              <button
                key={s.value}
                onClick={() => setScope(s.value)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                  scope === s.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line bg-panel-2 text-ink-dim hover:text-ink"
                }`}
              >
                <span>{s.label}</span>
                <span className="text-[11px] text-ink-mute">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Подграф настройки */}
        {scope === "subgraph" && (
          <div className="mb-4 space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-mute">Центральный узел</p>
              <select
                value={centerNode}
                onChange={(e) => setCenterNode(e.target.value)}
                className="w-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              >
                {nodes.slice(0, 50).map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name} ({n.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-mute">Глубина связей: {depth}</p>
              <input
                type="range"
                min="1"
                max="3"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[10px] text-ink-mute">
                <span>1 (соседи)</span>
                <span>2 (соседи соседей)</span>
                <span>3 (глубокий)</span>
              </div>
            </div>
          </div>
        )}

        {/* Масштаб */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-ink-mute">Масштаб</p>
          <div className="flex gap-2">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                  scale === s
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line bg-panel-2 text-ink-dim hover:text-ink"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-mute">
            {scale === 1 ? "Экранное разрешение" : scale === 2 ? "Для печати (300dpi)" : "Высокое разрешение"}
          </p>
        </div>

        {/* Прозрачный фон для PNG */}
        {format === "png" && (
          <label className="mb-4 flex items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={(e) => setTransparentBg(e.target.checked)}
              className="rounded border-line accent-accent"
            />
            Прозрачный фон (для вставки в презентации)
          </label>
        )}

        {/* Кнопки */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleExport}
            disabled={exporting || nodes.length === 0}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-soft disabled:opacity-50"
          >
            {exporting ? "Экспортирую..." : "Скачать"}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2.5 text-sm text-ink-dim transition hover:text-ink"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
