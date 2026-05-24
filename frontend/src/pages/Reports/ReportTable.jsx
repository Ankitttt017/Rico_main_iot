import React from "react";
import { Activity } from "lucide-react";

const StatusChip = ({ status }) => {
  const normalized = String(status || "").trim().toUpperCase();
  const base = "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border";
  if (normalized === "OK") return <span className={`${base} bg-green-500/10 text-green-500 border-green-500/20`}>OK</span>;
  if (normalized === "NG") return <span className={`${base} bg-red-500/10 text-red-500 border-red-500/20`}>NG</span>;
  if (normalized === "BYPASS") return <span className={`${base} bg-amber-500/10 text-amber-500 border-amber-500/20`}>BYPASS</span>;
  if (normalized === "PENDING" || normalized === "UNKNOWN") return <span className={`${base} bg-blue-500/10 text-blue-500 border-blue-500/20`}>PENDING</span>;
  return <span className={`${base} bg-slate-500/10 text-slate-500 border-slate-500/20`}>{normalized || "-"}</span>;
};

const ReportTable = ({ rows = [], columns = [], loading }) => {
  if (loading) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Preparing Report Dataset...</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-20 flex flex-col items-center justify-center space-y-4 text-center">
        <div className="p-4 bg-bg-dark rounded-full">
          <Activity size={32} className="text-text-muted/30" />
        </div>
        <div>
          <p className="text-sm font-bold text-text-main">No report records found</p>
          <p className="text-xs text-text-muted mt-1">Update filters and try again</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-400" />
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-900/90 border-b border-border backdrop-blur">
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest whitespace-nowrap">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row, idx) => (
              <tr key={`${row.barcode || "row"}-${idx}`} className={`${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"} hover:bg-primary/5 transition-colors group`}>
                {columns.map((column) => {
                  const value = row[column.key];
                  const text = value === null || value === undefined || value === "" ? "-" : value;
                  if (column.key === "overallStatus") {
                    return (
                      <td key={column.key} className="px-4 py-3">
                        <StatusChip status={text} />
                      </td>
                    );
                  }
                  if (column.key === "ngReason") {
                    return (
                      <td key={column.key} className="px-4 py-3 text-[11px] text-red-500/80 italic max-w-[220px] truncate" title={String(text)}>
                        {text}
                      </td>
                    );
                  }
                  return (
                    <td key={column.key} className="px-4 py-3 text-[11px] text-text-main whitespace-nowrap">
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-bg-dark/20 border-t border-border flex items-center justify-between">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Displaying {rows.length} records</p>
      </div>
    </div>
  );
};

export default ReportTable;
