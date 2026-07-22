import type { ApiEdge, ApiNode } from "../types";

export interface ExportOptions {
  format: "png" | "svg";
  scope: "full" | "subgraph" | "selected";
  scale: number; // 1, 2, 4
  centerNode?: string; // для scope=subgraph
  depth?: number; // для scope=subgraph
  selectedNodes?: string[]; // для scope=selected
  transparentBackground?: boolean;
}

interface GraphData {
  nodes: ApiNode[];
  edges: ApiEdge[];
  typeColors: Map<string, string>;
}

// BFS для получения подграфа вокруг узла
function getSubgraph(
  nodes: ApiNode[],
  edges: ApiEdge[],
  center: string,
  depth: number,
): { nodes: ApiNode[]; edges: ApiEdge[] } {
  const nodeMap = new Map(nodes.map((n) => [n.name, n]));
  const visited = new Set<string>();
  const queue: Array<{ name: string; d: number }> = [{ name: center, d: 0 }];
  const included = new Set<string>([center]);

  while (queue.length > 0) {
    const { name, d } = queue.shift()!;
    if (d >= depth) continue;
    if (visited.has(name)) continue;
    visited.add(name);

    for (const e of edges) {
      if (e.src === name && nodeMap.has(e.dst) && !included.has(e.dst)) {
        included.add(e.dst);
        queue.push({ name: e.dst, d: d + 1 });
      }
      if (e.dst === name && nodeMap.has(e.src) && !included.has(e.src)) {
        included.add(e.src);
        queue.push({ name: e.src, d: d + 1 });
      }
    }
  }

  return {
    nodes: nodes.filter((n) => included.has(n.name)),
    edges: edges.filter((e) => included.has(e.src) && included.has(e.dst)),
  };
}

// Фильтрация по выделенным узлам
function getSelectedSubgraph(
  nodes: ApiNode[],
  edges: ApiEdge[],
  selected: string[],
): { nodes: ApiNode[]; edges: ApiEdge[] } {
  const set = new Set(selected);
  return {
    nodes: nodes.filter((n) => set.has(n.name)),
    edges: edges.filter((e) => set.has(e.src) && set.has(e.dst)),
  };
}

// Получение данных для экспорта
function getExportData(graph: GraphData, options: ExportOptions): GraphData {
  let nodes = graph.nodes;
  let edges = graph.edges;

  if (options.scope === "subgraph" && options.centerNode) {
    const sub = getSubgraph(nodes, edges, options.centerNode, options.depth ?? 2);
    nodes = sub.nodes;
    edges = sub.edges;
  } else if (options.scope === "selected" && options.selectedNodes) {
    const sub = getSelectedSubgraph(nodes, edges, options.selectedNodes);
    nodes = sub.nodes;
    edges = sub.edges;
  }

  return { nodes, edges, typeColors: graph.typeColors };
}

// Генерация SVG из данных графа
function generateSVG(data: GraphData, scale: number): string {
  const { nodes, edges, typeColors } = data;

  // Вычисляем степень каждого узла
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }

  // Простой лейаут: силовое расположение (упрощённое)
  const nodePositions = new Map<string, { x: number; y: number }>();
  const centerX = 400;
  const centerY = 300;
  const radius = 200;

  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const x = centerX + radius * Math.cos(angle) * (0.3 + 0.7 * Math.random());
    const y = centerY + radius * Math.sin(angle) * (0.3 + 0.7 * Math.random());
    nodePositions.set(node.name, { x, y });
  });

  const width = 800 * scale;
  const height = 600 * scale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
  svg += `  <defs>\n    <style>\n      .node-label { font-family: system-ui, sans-serif; font-size: ${10 * scale}px; fill: #1e293b; }\n      .edge-label { font-family: system-ui, sans-serif; font-size: ${8 * scale}px; fill: #64748b; }\n    </style>\n  </defs>\n`;

  // Фон
  svg += `  <rect width="100%" height="100%" fill="transparent"/>\n`;

  // Рёбра
  for (const edge of edges) {
    const src = nodePositions.get(edge.src);
    const dst = nodePositions.get(edge.dst);
    if (!src || !dst) continue;

    const color = "#94a3b8";
    svg += `  <line x1="${src.x * scale}" y1="${src.y * scale}" x2="${dst.x * scale}" y2="${dst.y * scale}" stroke="${color}" stroke-width="${1.5 * scale}" opacity="0.7"/>\n`;

    // Подпись ребра (тип связи)
    if (edge.relation) {
      const mx = ((src.x + dst.x) / 2) * scale;
      const my = ((src.y + dst.y) / 2) * scale;
      svg += `  <text x="${mx}" y="${my}" class="edge-label" text-anchor="middle">${edge.relation}</text>\n`;
    }
  }

  // Узлы
  for (const node of nodes) {
    const pos = nodePositions.get(node.name);
    if (!pos) continue;

    const color = typeColors.get(node.type) ?? "#7c3aed";
    const deg = degree.get(node.name) ?? 0;
    const r = Math.max(4, Math.min(12, deg)) * scale;

    svg += `  <circle cx="${pos.x * scale}" cy="${pos.y * scale}" r="${r}" fill="${color}" stroke="#fff" stroke-width="${1.5 * scale}"/>\n`;
    svg += `  <text x="${pos.x * scale}" y="${(pos.y + r + 12) * scale}" class="node-label" text-anchor="middle" font-weight="500">${node.name}</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}

// Генерация PNG из SVG
async function generatePNG(svgString: string, scale: number, transparent: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas not supported"));
      return;
    }

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      if (!transparent) {
        ctx.fillStyle = "#0f172a"; // dark background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create PNG"));
      }, "image/png");
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG"));
    };

    img.src = url;
  });
}

// Скачивание файла
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Основная функция экспорта
export async function exportGraph(graph: GraphData, options: ExportOptions): Promise<void> {
  const data = getExportData(graph, options);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const scopeSuffix =
    options.scope === "subgraph"
      ? `-subgraph-${options.centerNode ?? "node"}`
      : options.scope === "selected"
        ? "-selected"
        : "";

  if (options.format === "svg") {
    const svg = generateSVG(data, options.scale);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    downloadBlob(blob, `graphlens${scopeSuffix}-${timestamp}.svg`);
  } else {
    // PNG
    const svg = generateSVG(data, 1); // SVG в натуральном размере
    const png = await generatePNG(svg, options.scale, options.transparentBackground ?? false);
    downloadBlob(png, `graphlens${scopeSuffix}-${timestamp}.png`);
  }
}

// Утилита для получения центрального узла (наибольшая степень)
export function getCentralNode(nodes: ApiNode[], edges: ApiEdge[]): string | null {
  if (nodes.length === 0) return null;
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }
  let best = nodes[0].name;
  let bestDeg = -1;
  for (const n of nodes) {
    const d = degree.get(n.name) ?? 0;
    if (d > bestDeg) {
      bestDeg = d;
      best = n.name;
    }
  }
  return best;
}
