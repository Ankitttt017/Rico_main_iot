import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/common/AppLayout";
import { getMachines, getPlcLatestReadings, getStats } from "../services/api";

const fmt = (value) => Number(value || 0).toLocaleString("en-IN");

const statusTone = {
  online: "bg-emerald-50 text-emerald-700 border-emerald-100",
  warning: "bg-amber-50 text-amber-700 border-amber-100",
  offline: "bg-rose-50 text-rose-700 border-rose-100",
};

const IotDashboardPage = ({ onLogout, currentUser }) => {
  const [stats, setStats] = useState({});
  const [machines, setMachines] = useState([]);
  const [latest, setLatest] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [statsRes, machineRes, latestRes] = await Promise.all([
          getStats(),
          getMachines({ limit: 8 }),
          getPlcLatestReadings(),
        ]);
        if (!active) return;
        setStats(statsRes.data?.data || {});
        setMachines(machineRes.data?.data || []);
        setLatest(latestRes.data?.data || []);
      } catch {
        if (!active) return;
        setStats({});
        setMachines([]);
        setLatest([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const liveSummary = useMemo(() => {
    const rows = Array.isArray(latest) ? latest : [];
    const online = rows.filter((row) => row.is_online || row.status === "RUNNING" || row.has_data).length;
    const ng = rows.filter((row) => String(row.result || row.status || "").toUpperCase() === "NG").length;
    return { total: rows.length, online, ng, idle: Math.max(rows.length - online, 0) };
  }, [latest]);

  const cards = [
    { label: "Machines", value: stats.total_machines, helper: "Configured assets", tone: "border-sky-200" },
    { label: "Lines / Cells", value: stats.total_lines, helper: "Production structure", tone: "border-indigo-200" },
    { label: "Parts", value: stats.total_parts, helper: "Registered part masters", tone: "border-emerald-200" },
    { label: "Live PLCs", value: liveSummary.online, helper: `${liveSummary.total} latest signals`, tone: "border-teal-200" },
    { label: "NG Signals", value: liveSummary.ng, helper: "Latest cycle status", tone: "border-rose-200" },
  ];

  const quickActions = [
    { label: "Open Workstation", to: "/operator-workstation", permission: "workstation:view" },
    { label: "Monitor PLC", to: "/plc-monitor", permission: "plc:view" },
    { label: "Add / Setup Machine", to: "/machines", permission: "master:manage" },
    { label: "Manage Parts", to: "/parts", permission: "master:manage" },
  ].filter((action) => {
    const permissions = currentUser?.permissions || [];
    return permissions.includes(action.permission) || permissions.includes(action.permission.replace(":view", ":manage")) || permissions.includes("roles:manage");
  });

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#123f75] text-white shadow-lg shadow-slate-300">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V5m5 14V9m5 10V7m5 12V3M4 19h17" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0b73bd]">IoT Command Center</p>
                <h2 className="text-2xl font-extrabold text-slate-950">Dashboard Overview</h2>
                <p className="text-sm font-medium text-slate-500">Production health, PLC status and master setup readiness.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <Link key={action.to} to={action.to} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-[#0b73bd] hover:text-[#0b73bd]">
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className={`rounded-2xl border-l-4 ${card.tone} border-y border-r bg-white p-5 shadow-sm`}>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">{card.label}</p>
              <p className="mt-4 text-3xl font-extrabold text-slate-950">{loading ? "-" : fmt(card.value)}</p>
              <p className="mt-2 text-sm font-medium text-slate-500">{card.helper}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-950">Live Machine Snapshot</h3>
              <Link to="/plc-monitor" className="text-sm font-bold text-[#0b73bd]">View monitor</Link>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Machine</th>
                    <th className="px-4 py-3">PLC IP</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Cycle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(latest.length ? latest.slice(0, 8) : machines.slice(0, 8)).map((row, index) => {
                    const online = row.is_online || row.has_data || String(row.status || "").toUpperCase() === "RUNNING";
                    const tone = online ? statusTone.online : statusTone.offline;
                    return (
                      <tr key={`${row.machine_key || row.machine_name || index}-${index}`} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-900">{row.machine_name || row.name || row.machine || "Machine"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.plc_ip || row.ip_address || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-1 text-xs font-bold ${tone}`}>{online ? "ONLINE" : "WAITING"}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{row.cycle_time || row.cycle_time_sec || "-"}</td>
                      </tr>
                    );
                  })}
                  {!latest.length && !machines.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No machine data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-950">Setup Health</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">Follow this sequence for clean industrial master data.</p>
            <div className="mt-5 space-y-3">
              {[
                ["Plant", stats.total_lines || stats.total_machines ? "Ready" : "Setup"],
                ["Line / Cell", stats.total_lines ? "Ready" : "Pending"],
                ["Machine & PLC", stats.total_machines ? "Ready" : "Pending"],
                ["Parts & Operations", stats.total_parts ? "Ready" : "Pending"],
              ].map(([label, status]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <span className="font-bold text-slate-800">{label}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${status === "Ready" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

export default IotDashboardPage;
