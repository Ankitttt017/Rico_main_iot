import React from "react";

const statCards = [
  { key: "total", label: "Total", color: "text-slate-950", bg: "bg-white", accent: "bg-slate-400" },
  { key: "running", label: "Running", color: "text-emerald-700", bg: "bg-emerald-50", accent: "bg-emerald-500" },
  { key: "stopped", label: "Stopped", color: "text-red-700", bg: "bg-red-50", accent: "bg-red-500" },
  { key: "idle", label: "Idle", color: "text-amber-700", bg: "bg-amber-50", accent: "bg-amber-500" },
];

const MachineStats = ({ stats }) => (
  <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {statCards.map((card) => (
      <div key={card.key} className={`${card.bg} app-panel rounded-2xl border border-slate-100 px-5 py-4`}>
        <div className="flex items-center justify-between">
          <span className={`text-3xl font-extrabold ${card.color}`}>{stats[card.key]}</span>
          <span className={`h-10 w-1.5 rounded-full ${card.accent}`} />
        </div>
        <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</span>
      </div>
    ))}
  </div>
);

export default MachineStats;
