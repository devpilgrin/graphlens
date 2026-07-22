import { useMemo } from "react";
import type { ApiEdge, ApiNode } from "../types";
import { colorFor } from "../palette";

interface Props {
  node: ApiNode;
  edges: ApiEdge[];
  typeColors: Map<string, string>;
  onFocus: (name: string) => void;
  onClose: () => void;
}

export default function NodeInfo({ node, edges, typeColors, onFocus, onClose }: Props) {
  const related = useMemo(
    () =>
      edges
        .filter((e) => e.src === node.name || e.dst === node.name)
        .map((e) => ({
          other: e.src === node.name ? e.dst : e.src,
          relation: e.relation,
          out: e.src === node.name,
        })),
    [edges, node],
  );

  return (
    <section className="rounded-xl border border-line bg-panel-2 p-3 shadow-sm shadow-black/20">
      <div className="mb-2 flex items-start gap-2">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ background: colorFor(typeColors, node.type) }}
        />
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold leading-tight">{node.name}</h3>
          <span className="text-[11px] text-ink-mute">{node.type}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="ml-auto rounded-md px-1.5 text-ink-mute transition hover:text-ink"
        >
          ✕
        </button>
      </div>
      {node.description && (
        <p className="mb-2 text-xs leading-relaxed text-ink-dim">{node.description}</p>
      )}
      {related.length > 0 && (
        <>
          <p className="mb-1 text-[11px] text-ink-mute">Связи · {related.length}</p>
          <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
            {related.map((r, i) => (
              <li key={`${r.other}-${r.relation}-${i}`} className="text-xs">
                <button
                  onClick={() => onFocus(r.other)}
                  className="group flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-canvas"
                >
                  <span className="text-ink-mute">{r.out ? "→" : "←"}</span>
                  <span className="truncate group-hover:text-accent-soft">{r.other}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-amberacc/80">
                    {r.relation}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
