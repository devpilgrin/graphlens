import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import type { ApiEdge, ApiNode } from "../types";
import { colorFor } from "../palette";

interface GNodeData {
  name: string;
  type: string;
  description: string;
  degree: number;
}
interface GLinkData {
  relation: string;
  description: string;
}
type GNode = NodeObject<GNodeData>;
type GLink = LinkObject<GNodeData, GLinkData>;

export interface GraphCanvasHandle {
  focusNode: (name: string) => boolean;
}

interface Props {
  nodes: ApiNode[];
  edges: ApiEdge[];
  typeColors: Map<string, string>;
  selected: string | null;
  onSelect: (name: string | null) => void;
}

const linkEnd = (v: GNode | string | number | undefined): string =>
  typeof v === "object" && v !== null ? String(v.id) : String(v ?? "");

const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(
  { nodes, edges, typeColors, selected, onSelect },
  ref,
) {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink>>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const known = new Set(nodes.map((n) => n.name));
    const degree = new Map<string, number>();
    const links: GLink[] = [];
    for (const e of edges) {
      if (!known.has(e.src) || !known.has(e.dst)) continue;
      degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
      degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
      links.push({
        source: e.src,
        target: e.dst,
        relation: e.relation,
        description: e.description,
      });
    }
    const gnodes: GNode[] = nodes.map((n) => ({
      id: n.name,
      name: n.name,
      type: n.type,
      description: n.description,
      degree: degree.get(n.name) ?? 0,
    }));
    return { nodes: gnodes, links };
  }, [nodes, edges]);

  const neighborhood = useMemo(() => {
    const focus = selected ?? hovered;
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const l of graphData.links) {
      const s = linkEnd(l.source);
      const t = linkEnd(l.target);
      if (s === focus) set.add(t);
      if (t === focus) set.add(s);
    }
    return set;
  }, [selected, hovered, graphData]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || graphData.nodes.length === 0) return;
    const timer = setTimeout(() => fg.zoomToFit(600, 60), 700);
    return () => clearTimeout(timer);
  }, [graphData]);

  useImperativeHandle(
    ref,
    () => ({
      focusNode(name: string) {
        const fg = fgRef.current;
        const node = graphData.nodes.find((n) => n.name === name);
        if (!fg || !node || node.x == null || node.y == null) return false;
        fg.centerAt(node.x, node.y, 700);
        fg.zoom(3.2, 700);
        onSelect(name);
        return true;
      },
    }),
    [graphData, onSelect],
  );

  const radiusOf = (n: GNode) => 3 + Math.sqrt(n.degree) * 1.7;

  const drawNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (node.x == null || node.y == null) return;
      const inFocus = !neighborhood || neighborhood.has(node.name);
      const color = colorFor(typeColors, node.type);
      const r = radiusOf(node);

      ctx.globalAlpha = inFocus ? 1 : 0.12;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      const focusNode = selected ?? hovered;
      if (node.name === focusNode) {
        ctx.lineWidth = 1.6 / scale;
        ctx.strokeStyle = "#f59e0b";
        ctx.stroke();
      }

      const showLabel = scale > 1.4 || (neighborhood?.has(node.name) ?? false);
      if (showLabel) {
        const fontSize = Math.max(11 / scale, 2.4);
        ctx.font = `${node.name === focusNode ? "600 " : ""}${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = inFocus ? "rgba(236,233,246,0.92)" : "rgba(236,233,246,0.25)";
        ctx.fillText(node.name, node.x, node.y + r + 2 / scale);
      }
      ctx.globalAlpha = 1;
    },
    [neighborhood, typeColors, selected, hovered],
  );

  const paintPointerArea = useCallback(
    (node: GNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.x == null || node.y == null) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radiusOf(node) + 4, 0, 2 * Math.PI);
      ctx.fill();
    },
    [],
  );

  const drawLinkLabel = useCallback(
    (link: GLink, ctx: CanvasRenderingContext2D, scale: number) => {
      const s = link.source as GNode;
      const t = link.target as GNode;
      if (typeof s !== "object" || typeof t !== "object") return;
      if (s.x == null || s.y == null || t.x == null || t.y == null) return;
      const touchesFocus =
        neighborhood &&
        neighborhood.has(linkEnd(link.source)) &&
        neighborhood.has(linkEnd(link.target));
      if (scale < 1.8 && !touchesFocus) return;
      if (neighborhood && !touchesFocus) return;

      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      const fontSize = Math.max(9 / scale, 1.8);
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = touchesFocus
        ? "rgba(245,158,11,0.9)"
        : "rgba(162,156,184,0.6)";
      ctx.fillText(link.relation, mx, my);
    },
    [neighborhood],
  );

  const linkColorFn = useCallback(
    (link: GLink) => {
      if (!neighborhood) return "rgba(167,139,250,0.22)";
      const on =
        neighborhood.has(linkEnd(link.source)) &&
        neighborhood.has(linkEnd(link.target));
      return on ? "rgba(245,158,11,0.55)" : "rgba(167,139,250,0.05)";
    },
    [neighborhood],
  );

  const nodeTooltip = useCallback((n: GNode) => {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div class="gl-tip"><b>${esc(n.name)}</b> <span>${esc(n.type)}</span>${
      n.description ? `<p>${esc(n.description)}</p>` : ""
    }</div>`;
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {size.w > 0 && (
        <ForceGraph2D<GNodeData, GLinkData>
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor="#0f0d1a"
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={paintPointerArea}
          nodeLabel={nodeTooltip}
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={drawLinkLabel}
          linkColor={linkColorFn}
          linkWidth={1}
          linkDirectionalParticles={0}
          onNodeHover={(n) => setHovered(n ? n.name : null)}
          onNodeClick={(n) => onSelect(n.name === selected ? null : n.name)}
          onBackgroundClick={() => onSelect(null)}
          cooldownTicks={120}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.35}
        />
      )}
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-panel shadow-lg shadow-black/30">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <circle cx="6" cy="6" r="2.6" stroke="#7c3aed" strokeWidth="1.6" />
                <circle cx="18" cy="8" r="2.6" stroke="#f59e0b" strokeWidth="1.6" />
                <circle cx="10" cy="18" r="2.6" stroke="#a29cb8" strokeWidth="1.6" />
                <path d="M8.2 7.2 15.6 8M7 8.4l2.2 7M16.4 10.2l-4.8 6" stroke="#4b4566" strokeWidth="1.3" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-dim">Граф пока пуст</p>
            <p className="text-xs leading-relaxed text-ink-mute">
              Запустите извлечение сущностей в панели справа — узлы и связи
              появятся здесь автоматически.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

export default GraphCanvas;
