import React from "react";
import { getLineProtocolLabels } from "../utils/lineUtils";

const LineCard = ({ line, onEdit, onDelete }) => {
  const protocols = getLineProtocolLabels(line);
  return (
    <article className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-slate-200/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-slate-950">{line.line_name}</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-400">{line.line_code}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${line.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {line.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-lg font-extrabold leading-none text-slate-950">{line.total_machines ?? 0}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Machines</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="truncate text-sm font-extrabold text-slate-800">{line.division || "Division"}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Division</p>
        </div>
      </div>

      <div className="mt-3 min-h-[34px]">
        {protocols.length ? (
          <div className="flex flex-wrap gap-1.5">
            {protocols.map((protocol) => (
              <span key={protocol} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold text-blue-700">
                {protocol}
              </span>
            ))}
          </div>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500">No protocol</span>
        )}
      </div>

      <div className="mt-auto flex gap-2 border-t border-slate-100 pt-3">
        <button onClick={() => onEdit(line)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-100">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          Edit Setup
        </button>
        <button onClick={() => onDelete(line)} className="flex items-center justify-center rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </article>
  );
};

export default LineCard;
