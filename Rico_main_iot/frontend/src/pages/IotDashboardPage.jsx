import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/common/AppLayout";
import HourlyProductionChart from "../components/dashboard/HourlyProductionChart";
import { Cpu, Activity, Clock } from "lucide-react";
import { getMachines, getPlcLatestReadings, getStats } from "../services/api";
import { sortMachinesBySeries } from "../modules/plc-monitor/constants";

const fmt = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("en-IN") : (value ?? "-");
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

  const snapshotRows = useMemo(
    () => sortMachinesBySeries(latest.length ? latest : machines).slice(0, 8),
    [latest, machines]
  );

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="w-full min-w-0 space-y-4 sm:space-y-5">
        <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className={`min-w-0 rounded-2xl border-l-4 ${card.tone} border-y border-r bg-white p-4 shadow-sm sm:p-5`}>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">{card.label}</p>
              <p className="mt-4 text-3xl font-extrabold text-slate-950">{loading ? "-" : fmt(card.value)}</p>
              <p className="mt-2 text-sm font-medium text-slate-500">{card.helper}</p>
            </div>
          ))}
        </section>

        {/* Industrial Hourly Production & Quality Trend Chart */}
        <section className="w-full min-w-0">
          <HourlyProductionChart machines={latest.length ? latest : machines} />
        </section>

        {/* Live Machine KPI Cards Grid */}
        <section className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-950">Live Machine Telemetry</h3>
                <p className="text-xs font-medium text-slate-500">Real-time PLC connection, cycle time and status per machine</p>
              </div>
            </div>
            <Link to="/plc-monitor" className="text-xs font-bold text-[#0b73bd] hover:text-[#095c99] hover:underline flex items-center gap-1">
              Open Full Monitor →
            </Link>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {snapshotRows.map((row, index) => {
              const online = row.is_online || row.has_data || String(row.status || "").toUpperCase() === "RUNNING";
              const cycleTime = row.cycle_time || row.cycle_time_sec;
              const shotNo = row.shot_number || row.Counter || row.shot_no;
              return (
                <div
                  key={`${row.machine_key || row.machine_name || index}-${index}`}
                  className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-slate-50/40 p-3.5 shadow-sm hover:border-[#0b73bd]/60 hover:bg-white hover:shadow-md transition-all group"
                >
                  <div>
                    {/* Header: Machine name & Online status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-black text-slate-900 group-hover:text-[#0b73bd] transition-colors" title={row.machine_name || row.name || "Machine"}>
                          {row.machine_name || row.name || row.machine || "Machine"}
                        </h4>
                        <p className="font-mono text-[11px] font-semibold text-slate-400">
                          {row.plc_ip || row.ip_address || "No IP"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide border ${
                          online
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                          }`}
                        />
                        {online ? "ONLINE" : "WAITING"}
                      </span>
                    </div>

                    {/* KPI metrics in each card */}
                    <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-slate-200/60 pt-3">
                      <div className="rounded-lg bg-white border border-slate-100 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> Cycle
                        </span>
                        <p className="mt-0.5 text-base font-black text-slate-800">
                          {cycleTime ? `${cycleTime}s` : "-"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Activity className="h-2.5 w-2.5" /> Shots
                        </span>
                        <p className="mt-0.5 text-base font-black text-slate-800">
                          {shotNo != null ? fmt(shotNo) : "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Footer link to monitor */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Port: {row.plc_port || 5002}
                    </span>
                    <Link
                      to="/plc-monitor"
                      className="font-bold text-[#0b73bd] hover:underline"
                    >
                      Monitor →
                    </Link>
                  </div>
                </div>
              );
            })}
            {snapshotRows.length === 0 && (
              <div className="col-span-full py-8 text-center text-sm font-semibold text-slate-400">
                No active machine data available
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

export default IotDashboardPage;
