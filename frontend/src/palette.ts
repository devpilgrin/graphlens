// 12-слотовая категориальная палитра для тёмной поверхности #0f0d1a.
// Прогнана через валидатор dataviz: диапазон светлоты OKLCH 0.48–0.67,
// хрома >= 0.1, контраст всех слотов >= 3:1 к поверхности. При 12 сериях
// полное разделение пар недостижимо, поэтому идентичность типа всегда
// дублируется подписью узла, легендой и tooltip — цвет не единственный канал.
export const TYPE_PALETTE = [
  "#0d9488",
  "#a16207",
  "#2563eb",
  "#4d7c0f",
  "#7c3aed",
  "#9085e9",
  "#dc2626",
  "#0284c7",
  "#d97706",
  "#d55181",
  "#c026d3",
  "#16a34a",
];

// Нейтральный серый для типов сверх 12 слотов (спека фиксирует 12 типов).
const EXTRA_TYPE_COLOR = "#6b7280";

export function buildTypeColors(types: string[]): Map<string, string> {
  const uniq = [...new Set(types)].sort((a, b) => a.localeCompare(b));
  const map = new Map<string, string>();
  uniq.forEach((t, i) => {
    map.set(t, i < TYPE_PALETTE.length ? TYPE_PALETTE[i] : EXTRA_TYPE_COLOR);
  });
  return map;
}

export function colorFor(map: Map<string, string>, type: string): string {
  return map.get(type) ?? EXTRA_TYPE_COLOR;
}
