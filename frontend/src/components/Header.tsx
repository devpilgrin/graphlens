import type { GraphStats, QdrantCollection } from "../types";

interface Props {
  collections: QdrantCollection[];
  collection: string;
  onCollectionChange: (name: string) => void;
  stats: GraphStats | null;
  healthy: boolean | null;
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-lg bg-panel-2 px-3 py-1.5">
      <span className="text-sm font-semibold tabular-nums">{value.toLocaleString("ru-RU")}</span>
      <span className="text-[11px] text-ink-mute">{label}</span>
    </div>
  );
}

export default function Header({
  collections,
  collection,
  onCollectionChange,
  stats,
  healthy,
}: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4 shadow-sm shadow-black/20">
      <div className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="10" cy="10" r="6.5" stroke="#7c3aed" strokeWidth="2" />
          <path d="M15 15l5 5" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="8" cy="9" r="1.3" fill="#a78bfa" />
          <circle cx="12.5" cy="11.5" r="1.3" fill="#a78bfa" />
          <path d="M9 9.6l2.6 1.4" stroke="#a78bfa" strokeWidth="1" />
        </svg>
        <span className="text-[17px] font-semibold tracking-tight">
          Graph<span className="text-accent-soft">Lens</span>
        </span>
        {healthy !== null && (
          <span
            title={healthy ? "Бэкенд доступен" : "Бэкенд недоступен"}
            className={`ml-1 inline-block h-2 w-2 rounded-full ${healthy ? "bg-emerald-500" : "bg-red-500"}`}
          />
        )}
      </div>

      <label className="flex items-center gap-2">
        <span className="text-xs text-ink-mute">Коллекция</span>
        <select
          value={collection}
          onChange={(e) => onCollectionChange(e.target.value)}
          className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        >
          {collections.length === 0 && <option value="">нет коллекций</option>}
          {collections.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} · {c.points.toLocaleString("ru-RU")} точек
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        {stats ? (
          <>
            <StatChip label="сущностей" value={stats.entities} />
            <StatChip label="связей" value={stats.relations} />
            <StatChip label="чанков" value={stats.chunks} />
          </>
        ) : (
          <span className="text-xs text-ink-mute">статистика графа недоступна</span>
        )}
      </div>
    </header>
  );
}
