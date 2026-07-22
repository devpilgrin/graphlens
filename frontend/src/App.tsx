import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { ApiGraph, CollectionProbe, GraphStats, QdrantCollection } from "./types";
import { buildTypeColors, colorFor } from "./palette";
import Header from "./components/Header";
import GraphCanvas, { type GraphCanvasHandle } from "./components/GraphCanvas";
import SearchPanel from "./components/SearchPanel";
import ExtractPanel from "./components/ExtractPanel";
import NodeInfo from "./components/NodeInfo";

export default function App() {
  const [collections, setCollections] = useState<QdrantCollection[]>([]);
  const [collection, setCollection] = useState("");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [graph, setGraph] = useState<ApiGraph>({ nodes: [], edges: [] });
  const [graphError, setGraphError] = useState<string | null>(null);
  const [probe, setProbe] = useState<CollectionProbe | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const canvasRef = useRef<GraphCanvasHandle>(null);

  useEffect(() => {
    api.health().then(() => setHealthy(true)).catch(() => setHealthy(false));
    api
      .collections()
      .then(({ collections: list }) => {
        setCollections(list);
        if (list.length > 0) {
          const fromUrl = new URLSearchParams(window.location.search).get("collection");
          const preferred =
            list.find((c) => c.name === fromUrl) ??
            list.find((c) => c.name === "kb_chunks") ??
            list[0];
          setCollection(preferred.name);
        }
      })
      .catch(() => setCollections([]));
  }, []);

  const reload = useCallback(async (col: string) => {
    api.graphStats().then(setStats).catch(() => setStats(null));
    if (!col) return;
    try {
      setGraph(await api.graph(col));
      setGraphError(null);
    } catch (e) {
      setGraph({ nodes: [], edges: [] });
      setGraphError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    setSelected(null);
    setProbe(null);
    if (collection) {
      api.probe(collection).then(setProbe).catch(() => setProbe(null));
    }
    reload(collection);
  }, [collection, reload]);

  // Когда граф загружается — все типы активны по умолчанию
  useEffect(() => {
    if (typeCounts.length > 0 && activeTypes.size === 0) {
      setActiveTypes(new Set(typeCounts.map(([t]) => t)));
    }
  }, [graph.nodes]);

  const toggleType = useCallback((type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const resetTypes = useCallback(() => {
    setActiveTypes(new Set(graph.nodes.map((n) => n.type)));
  }, [graph.nodes]);

  const typeColors = useMemo(
    () => buildTypeColors(graph.nodes.map((n) => n.type)),
    [graph.nodes],
  );

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of graph.nodes) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [graph.nodes]);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.name === selected) ?? null,
    [graph.nodes, selected],
  );

  const focusEntity = useCallback((name: string) => {
    const found = canvasRef.current?.focusNode(name) ?? false;
    if (!found) setSelected(null);
  }, []);

  const clearGraph = async () => {
    if (!collection || clearing) return;
    setClearing(true);
    try {
      await api.clearGraph(collection);
      setSelected(null);
      await reload(collection);
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        collections={collections}
        collection={collection}
        onCollectionChange={setCollection}
        stats={stats}
        healthy={healthy}
      />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <GraphCanvas
            ref={canvasRef}
            nodes={graph.nodes}
            edges={graph.edges}
            typeColors={typeColors}
            selected={selected}
            onSelect={setSelected}
            activeTypes={activeTypes}
          />

          {graphError && (
            <div className="absolute left-4 top-4 rounded-lg border border-red-900/60 bg-red-950/70 px-3 py-2 text-xs text-red-300 backdrop-blur">
              Не удалось загрузить граф: {graphError}
            </div>
          )}

          {probe && !probe.has_text && (
            <div className="absolute left-1/2 top-4 w-[520px] max-w-[90%] -translate-x-1/2 rounded-xl border border-amber-800/60 bg-amber-950/80 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur">
              <p className="text-sm font-semibold text-amber-300">
                В коллекции «{probe.collection}» нет текста в метаданных
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
                В payload только поля: {probe.fields.join(", ")}. Построение графа
                невозможно - GraphLens работает только с данными из Qdrant.
                Выберите коллекцию, где метаданные содержат текст чанков.
              </p>
            </div>
          )}

          {typeCounts.length > 0 && (
            <div className="absolute bottom-4 left-4 max-w-[360px] rounded-xl border border-line bg-panel/85 p-2.5 shadow-lg shadow-black/30 backdrop-blur">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
                  Фильтр по типам
                </p>
                {activeTypes.size !== typeCounts.length && (
                  <button
                    onClick={resetTypes}
                    className="text-[10px] text-violet-400 transition hover:text-violet-300"
                  >
                    Сбросить
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                {typeCounts.map(([type, count]) => {
                  const active = activeTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      className={`rounded-full px-2 py-1 text-[11px] transition-all ${
                        active
                          ? "bg-violet-900/50 text-ink shadow-sm"
                          : "opacity-35 grayscale"
                      }`}
                    >
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ background: colorFor(typeColors, type) }}
                      />
                      {type}
                      <span className="ml-1 text-ink-mute">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        <aside className="flex w-[380px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line bg-panel p-4">
          <SearchPanel
            collection={collection}
            typeColors={typeColors}
            onFocusEntity={focusEntity}
          />

          {selectedNode && (
            <NodeInfo
              node={selectedNode}
              edges={graph.edges}
              typeColors={typeColors}
              onFocus={focusEntity}
              onClose={() => setSelected(null)}
            />
          )}

          <ExtractPanel
            collection={collection}
            hasText={probe?.has_text ?? true}
            onFinished={() => reload(collection)}
          />

          <div className="mt-auto border-t border-line pt-3">
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={!collection}
                className="w-full rounded-xl border border-line px-4 py-2 text-sm text-ink-dim transition hover:border-red-800 hover:text-red-400 disabled:opacity-40"
              >
                Очистить граф
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl border border-red-900/60 bg-red-950/30 p-3">
                <p className="text-xs text-red-300">
                  Удалить весь граф коллекции «{collection}»? Это действие необратимо.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={clearGraph}
                    disabled={clearing}
                    className="flex-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                  >
                    {clearing ? "Удаляю…" : "Да, удалить"}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim transition hover:text-ink"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
