import React, { useCallback, useEffect, useMemo, useState } from "react";
import BrandLogo from "../components/common/BrandLogo";
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Gauge,
  LogOut,
  Monitor,
  Package,
  RefreshCw,
  Timer,
  User,
  X,
} from "lucide-react";
import {
  getLineMachines,
  getLines,
  getPlcHistoryExportUrl,
  getPlcLatestReadings,
  getPlcReadingHistory,
} from "../services/api";

const PLANTS = [
  { code: "1002", name: "Gurugram Plant", location: "Rico, Gurugram" },
  { code: "1008", name: "Bawal Plant", location: "Rico, Bawal" },
  { code: "PATHREDI", name: "Pathredi Plant", location: "Rico, Pathredi" },
  { code: "CHENNAI", name: "Chennai Plant", location: "Rico, Chennai" },
];

const DIVISION_OPTIONS = [
  { value: "", label: "All Divisions" },
  { value: "HPDC", label: "HPDC" },
  { value: "Machining", label: "Machining" },
];

const PLC_REGISTER_GROUPS = [
  {
    id: "production",
    label: "Production",
    color: "#22d3ee",
    keys: [
      { name: "recorded_at", label: "Recorded At" },
      { name: "machine_name", label: "Machine" },
      { name: "plc_ip", label: "PLC IP" },
      { name: "part_name", label: "Part Name" },
      { name: "shot_date", label: "Shot Date" },
      { name: "shot_time", label: "Shot Time" },
      { name: "shot_datetime", label: "Shot Date Time" },
      { name: "shot_year", label: "Shot Year" },
      { name: "shot_month", label: "Shot Month" },
      { name: "shot_day", label: "Shot Day" },
      { name: "shot_hour", label: "Shot Hour" },
      { name: "shot_minute", label: "Shot Minute" },
      { name: "shot_second", label: "Shot Second" },
      { name: "shot_number", label: "Shot Number" },
      { name: "ok_shot", label: "OK Shot" },
      { name: "cycle_time", label: "Cycle Time", unit: "sec" },
    ],
  },
  {
    id: "cycle_times",
    label: "Cycle Timings",
    color: "#f97316",
    keys: [
      { name: "die_close_core_in_time", label: "Die Close/Core In Time", unit: "sec" },
      { name: "pouring_time", label: "Pouring Time", unit: "sec" },
      { name: "shot_fwd_time", label: "Shot FWD Time", unit: "sec" },
      { name: "curing_time", label: "Curing Time", unit: "sec" },
      { name: "die_open_core_out_time", label: "Die Open/Core Out Time", unit: "sec" },
      { name: "ejector_time", label: "Ejector Time", unit: "sec" },
      { name: "extract_time", label: "Extractor Time", unit: "sec" },
      { name: "spray_time", label: "Spray Time", unit: "sec" },
    ],
  },
  {
    id: "shot",
    label: "Shot Setup",
    color: "#a78bfa",
    keys: [
      { name: "v1_speed", label: "V1 Speed", unit: "m/sec" },
      { name: "v2_speed", label: "V2 Speed", unit: "m/sec" },
      { name: "v3_speed", label: "V3 Speed", unit: "m/sec" },
      { name: "v4_speed", label: "V4 Speed", unit: "m/sec" },
      { name: "accel_point", label: "Accel. Point", unit: "mm" },
      { name: "deaccel_point", label: "Deaccel. Point", unit: "mm" },
      { name: "intensification_time", label: "Intensification Time", unit: "msec" },
      { name: "biscuit_thickness", label: "Biscuit Thickness", unit: "mm" },
    ],
  },
  {
    id: "pressure",
    label: "Pressure & Tonnage",
    color: "#34d399",
    keys: [
      { name: "metal_pressure", label: "Metal Pressure", unit: "MPa" },
      { name: "clamp_tonnage_he_low_pct", label: "Clamp Tonnage HE Low %", unit: "%" },
      { name: "clamp_tonnage_he_low_mn", label: "Clamp Tonnage HE Low MN", unit: "MN" },
      { name: "clamp_tonnage_op_up_pct", label: "Clamp Tonnage OP Up %", unit: "%" },
      { name: "clamp_tonnage_op_low_pct", label: "Clamp Tonnage OP Low %", unit: "%" },
      { name: "clamp_tonnage_he_up_pct", label: "Clamp Tonnage HE Up %", unit: "%" },
      { name: "clamp_force_pct", label: "Clamp Force", unit: "%" },
      { name: "clamp_tonnage", label: "Clamp Tonnage", unit: "T" },
      { name: "shot_acc_pressure", label: "Shot Acc. Pressure", unit: "MPa" },
      { name: "intensification_acc_pressure", label: "Intensification Acc. Pressure", unit: "MPa" },
      { name: "jet_cooling_pressure", label: "Jet Cooling Pressure", unit: "kgf/cm2" },
      { name: "vacuum_pressure", label: "Vacuum Pressure", unit: "mbar" },
    ],
  },
  {
    id: "temp",
    label: "Temperature & Cooling",
    color: "#f472b6",
    keys: [
      { name: "cooling_water_mov", label: "Cooling Water MOV", unit: "L/min" },
      { name: "cooling_water_sta", label: "Cooling Water STA", unit: "L/min" },
      { name: "furnace_metal_temp", label: "Furnace Metal Temp", unit: "°C" },
      { name: "fixed_die_temp_f1", label: "Fixed Die Temp F1", unit: "°C" },
      { name: "fixed_die_temp_f2", label: "Fixed Die Temp F2", unit: "°C" },
      { name: "moving_die_temp_m1", label: "Moving Die Temp M1", unit: "°C" },
      { name: "moving_die_temp_m2", label: "Moving Die Temp M2", unit: "°C" },
      { name: "slide_temp_s1", label: "Slide Temp S1", unit: "°C" },
    ],
  },
  {
    id: "machine_bits",
    label: "Machine Bits",
    color: "#60a5fa",
    keys: [
      { name: "running_mode", label: "Running Mode" },
      { name: "emergency_stop", label: "Emergency Stop" },
      { name: "hyd_pump_motor_overload", label: "Hyd. Pump Motor Overload" },
      { name: "hyd_oil_level_low", label: "Hyd. Oil Level Low" },
      { name: "hyd_oil_high_temp", label: "Hyd. Oil High Temp" },
      { name: "servo_pump_overload", label: "Servo Pump Overload" },
      { name: "servo_pump_motor_high_temp", label: "Servo Pump Motor High Temp" },
      { name: "die_close_step", label: "Die Close/Core In Step" },
      { name: "pouring_step", label: "Pouring Step" },
      { name: "shot_fwd_step", label: "Shot FWD Step" },
      { name: "curing_step", label: "Curing Step" },
      { name: "die_open_step", label: "Die Open Step" },
      { name: "ejector_step", label: "Ejector Step" },
      { name: "extractor_step", label: "Extractor Step" },
      { name: "spray_step", label: "Spray Step" },
      { name: "cycle_end", label: "Cycle End" },
    ],
  },
];

const PLC_TABLE_FIELD_NAMES = new Set(PLC_REGISTER_GROUPS.flatMap((group) => group.keys.map((item) => item.name)));

const getPlantByCode = (code) => PLANTS.find((plant) => plant.code === code) || PLANTS[0];

const SelectField = ({ label, value, onChange, children, theme = "light" }) => (
  <label className="block">
    <span className={`mb-1.5 block text-xs font-semibold ${theme === "dark" ? "text-zinc-300" : "text-slate-600"}`}>{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-[38px] w-full rounded border px-3 text-sm font-semibold outline-none transition ${
        theme === "dark"
          ? "border-[#303848] bg-black text-zinc-300 focus:border-[#626b7b]"
          : "border-[#c9d8ea] bg-[#f8fbff] text-slate-800 shadow-sm focus:border-[#1474b8] focus:ring-2 focus:ring-[#1474b8]/15"
      }`}
    >
      {children}
    </select>
  </label>
);

const formatValue = (value, suffix = "") => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number" && !Number.isInteger(value)) return `${value.toFixed(1)}${suffix}`;
  return `${value}${suffix}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const formatDateOnly = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatTimeOnly = (value) => {
  if (!value) return "-";
  const raw = String(value);
  const match = raw.match(/T(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/) ||
    raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (match) {
    return `${String(match[1]).padStart(2, "0")}:${String(match[2]).padStart(2, "0")}:${String(match[3] ?? 0).padStart(2, "0")}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const getReadingValue = (reading, name) => {
  if (!reading) return null;
  return reading[name] ?? null;
};

const getPlcTableRows = (reading) => {
  if (!reading) return [];
  const groupRows = PLC_REGISTER_GROUPS.flatMap((group) => (
    group.keys.map((field) => ({
      group: group.label,
      groupColor: group.color,
      name: field.name,
      label: field.label,
      unit: field.unit,
      value: field.name === "recorded_at"
        ? formatDateTime(getReadingValue(reading, field.name))
        : field.name === "shot_date"
          ? formatDateOnly(getReadingValue(reading, field.name))
          : field.name === "shot_time"
            ? formatTimeOnly(getReadingValue(reading, field.name))
            : field.name === "shot_datetime"
              ? formatDateTime(getReadingValue(reading, field.name))
        : formatValue(getReadingValue(reading, field.name)),
    }))
  ));

  const extraRows = Object.keys(reading)
    .filter((key) => !PLC_TABLE_FIELD_NAMES.has(key))
    .filter((key) => !["id", "created_at", "raw_readings_json", "rn", "is_online", "has_data", "error"].includes(key))
    .map((key) => ({
      group: "Additional DB Fields",
      groupColor: "#94a3b8",
      name: key,
      label: key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      unit: "",
      value: formatValue(reading[key]),
    }));

  return [...groupRows, ...extraRows];
};

const PlcMachineCard = ({ reading, machineInfo, lineInfo, theme = "light", currentUser, onOpenTable }) => {
  const isDark = theme === "dark";
  const online = Boolean(reading?.is_online);
  const machineName = reading?.machine_name || machineInfo?.name || "PLC Machine";
  const successTone = isDark ? "text-emerald-300" : "text-emerald-700";
  const dangerTone = isDark ? "text-rose-200" : "text-rose-600";
  const productionMetrics = [
    { label: "Cycle Time", value: reading?.cycle_time, unit: "s", icon: Timer, tone: successTone },
    { label: "Shot Date", value: formatDateOnly(reading?.shot_date), icon: ClipboardList, tone: successTone },
    { label: "Shot Time", value: formatTimeOnly(reading?.shot_time), icon: Timer, tone: successTone },
    { label: "Shot Number", value: reading?.shot_number, icon: Activity, tone: successTone },
    { label: "OK Shot", value: reading?.ok_shot, icon: Gauge, tone: successTone },
    { label: "Clamp Tonnage", value: reading?.clamp_tonnage, unit: "T", icon: Gauge, tone: dangerTone },
    { label: "Metal Temp", value: reading?.furnace_metal_temp, unit: "°C", icon: AlertTriangle, tone: dangerTone },
  ];
  const alertMetrics = [
    { label: "Metal Temp", value: reading?.furnace_metal_temp, unit: "°C" },
    { label: "Clamp Tonnage", value: reading?.clamp_tonnage, unit: "T" },
  ].filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  const timingMetrics = [
    { label: "Die Close/Core In", value: reading?.die_close_core_in_time, unit: "s" },
    { label: "Pouring", value: reading?.pouring_time, unit: "s" },
    { label: "Shot FWD", value: reading?.shot_fwd_time, unit: "s" },
    { label: "Curing", value: reading?.curing_time, unit: "s" },
    { label: "Die Open/Core Out", value: reading?.die_open_core_out_time, unit: "s" },
    { label: "Ejector", value: reading?.ejector_time, unit: "s" },
    { label: "Spray", value: reading?.spray_time, unit: "s" },
  ];

  return (
    <article className={`overflow-hidden rounded-xl border ${
      isDark
        ? "border-slate-800 bg-gradient-to-br from-[#111827] via-[#0f172a] to-[#020617] shadow-[0_18px_42px_rgba(0,0,0,0.42)]"
        : "border-[#bfd0e8] bg-gradient-to-br from-white via-[#f4f8fd] to-[#e9f1fb] shadow-[0_20px_44px_rgba(19,75,143,0.14)] ring-1 ring-white/80"
    }`}>
      <div className="p-4">
        <div className="grid items-start gap-5 xl:grid-cols-[1.25fr_auto]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Monitor className={`h-5 w-5 ${isDark ? "text-white" : "text-[#0b2f68]"}`} />
              <h2 className={`truncate text-lg font-black ${isDark ? "text-white" : "text-[#0b2f68]"}`}>{machineName}</h2>
            </div>
            <div className={`mt-2 flex items-center gap-2 text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Package className="h-4 w-4" />
              <span className="truncate">{reading?.part_name || "No part assigned"}</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-3 xl:justify-end">
            <span className={`inline-flex h-10 min-w-[118px] items-center justify-center rounded-md px-4 text-sm font-black ${
              online ? isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700" : isDark ? "bg-red-500/15 text-red-100" : "bg-rose-50 text-rose-600"
            }`}>
              {online ? "Complete" : "Offline"}
            </span>
            <button
              type="button"
              onClick={() => onOpenTable(reading)}
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#134b8f] px-4 text-sm font-black text-white transition hover:bg-[#0d3a70]"
              title="Open detailed report"
            >
              <ClipboardList className="h-5 w-5" />
              Details
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm font-bold md:grid-cols-2 xl:grid-cols-6">
          {productionMetrics.map(({ label, value, unit, icon: Icon, tone }) => (
            <div key={label} className={`flex min-w-0 items-center gap-2 ${tone}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{label}: {formatValue(value, unit || "")}</span>
            </div>
          ))}
        </div>

        {alertMetrics.length > 0 && (
          <div className={`mt-4 grid gap-3 rounded-lg border p-3 md:grid-cols-2 ${isDark ? "border-rose-500/20 bg-rose-500/10" : "border-rose-200 bg-rose-50"}`}>
            {alertMetrics.map(({ label, value, unit }) => (
              <div key={label} className={`flex items-center gap-2 text-sm font-black ${isDark ? "text-rose-100" : "text-rose-700"}`}>
                <AlertTriangle className="h-4 w-4" />
                {label}: {formatValue(value, unit || "")}
              </div>
            ))}
          </div>
        )}

        <div className={`mt-4 grid overflow-hidden rounded-lg border md:grid-cols-2 xl:grid-cols-7 ${isDark ? "border-slate-700 bg-slate-900/60" : "border-[#bfd0e8] bg-white/72"}`}>
          {timingMetrics.map(({ label, value, unit }) => (
            <div key={label} className={`min-w-0 border-b border-r px-4 py-3 last:border-r-0 ${isDark ? "border-slate-700" : "border-[#dce8f5]"}`}>
              <p className={`text-[11px] font-black uppercase tracking-wide ${isDark ? "text-slate-400" : "text-[#667092]"}`}>{label}</p>
              <p className={`mt-1 break-words text-base font-black ${isDark ? "text-white" : "text-[#0b2f68]"}`}>{formatValue(value, unit || "")}</p>
            </div>
          ))}
        </div>

        <details className={`mt-4 rounded-lg border ${isDark ? "border-slate-700 bg-slate-950/40" : "border-[#dce8f5] bg-white/60"}`}>
          <summary className={`cursor-pointer px-4 py-3 text-xs font-black uppercase tracking-[0.14em] ${isDark ? "text-slate-300" : "text-[#0b2f68]"}`}>
            Diagnostics
          </summary>
          <div className={`grid overflow-hidden border-t md:grid-cols-2 xl:grid-cols-5 ${isDark ? "border-slate-700" : "border-[#dce8f5]"}`}>
            {[
              ["Line", lineInfo?.line_name],
              ["Machine Code", machineInfo?.machine_code],
              ["Protocol", machineInfo?.protocol],
              ["Configured IP", machineInfo?.ip_address || reading?.plc_ip],
              ["Port", machineInfo?.port || reading?.plc_port],
            ].map(([label, value]) => (
              <div key={label} className={`min-w-0 border-b border-r px-4 py-3 last:border-r-0 ${isDark ? "border-slate-700" : "border-[#dce8f5]"}`}>
                <p className={`text-[11px] font-black uppercase tracking-wide ${isDark ? "text-slate-400" : "text-[#667092]"}`}>{label}</p>
                <p className={`mt-1 min-w-0 break-words text-sm font-black ${isDark ? "text-white" : "text-[#0b2f68]"}`}>{formatValue(value)}</p>
              </div>
            ))}
          </div>
        </details>

        <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs font-bold ${isDark ? "border-slate-700 text-slate-400" : "border-[#dce8f5] text-slate-500"}`}>
          <span>Last record: {formatDateTime(reading?.recorded_at)}</span>
        </div>
      </div>
    </article>
  );
};

const todayInput = () => new Date().toISOString().slice(0, 10);

const PlcTableModal = ({ reading, theme = "dark", onClose }) => {
  if (!reading) return null;
  const isDark = theme === "dark";
  const rows = getPlcTableRows(reading);
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadReportPreview = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await getPlcReadingHistory({
        ip: reading.plc_ip,
        from: fromDate,
        to: toDate,
        limit: 300,
      });
      setHistoryRows(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setHistoryRows([]);
      setHistoryError("Unable to load report preview.");
    } finally {
      setHistoryLoading(false);
    }
  }, [fromDate, reading.plc_ip, toDate]);

  useEffect(() => {
    loadReportPreview();
  }, [loadReportPreview]);

  const reportUrl = getPlcHistoryExportUrl({
    ip: reading.plc_ip,
    from: fromDate,
    to: toDate,
    limit: 5000,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-md">
      <section className={`flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border shadow-2xl ${
        isDark ? "border-zinc-800 bg-[#101010] text-white" : "border-slate-200 bg-white text-slate-950"
      }`}>
        <div className={`flex flex-wrap items-center justify-between gap-4 border-b p-4 ${isDark ? "border-zinc-800" : "border-slate-200"}`}>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-cyan-400">PLC Monitor Table</p>
            <h2 className="mt-1 text-xl font-black">{reading.machine_name || reading.plc_ip}</h2>
            <p className={`mt-1 font-mono text-xs font-bold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {reading.plc_ip || "-"}:{reading.plc_port || "-"} | Latest: {formatDateTime(reading.recorded_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-zinc-400">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className={`ml-2 h-10 rounded-md border px-3 text-sm font-bold outline-none ${isDark ? "border-zinc-800 bg-black text-white" : "border-slate-200 bg-white text-slate-800"}`}
              />
            </label>
            <label className="text-xs font-bold text-zinc-400">
              To
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className={`ml-2 h-10 rounded-md border px-3 text-sm font-bold outline-none ${isDark ? "border-zinc-800 bg-black text-white" : "border-slate-200 bg-white text-slate-800"}`}
              />
            </label>
            <button
              type="button"
              onClick={loadReportPreview}
              className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-black transition ${
                isDark ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Preview
            </button>
            <a
              href={reportUrl}
              className="flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-black text-black transition hover:bg-emerald-400"
            >
              <Download className="h-4 w-4" />
              Download Excel
            </a>
            <button
              type="button"
              onClick={onClose}
              className={`flex h-10 w-10 items-center justify-center rounded-md border transition ${
                isDark ? "border-zinc-800 text-zinc-300 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-auto border-r border-zinc-800">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className={`sticky top-0 z-10 border-b px-4 py-3 text-xs font-black uppercase tracking-wide ${
                  isDark ? "border-zinc-800 bg-[#101010] text-cyan-300" : "border-slate-200 bg-white text-slate-500"
                }`}>
                  Parameter
                </th>
                <th className={`sticky top-0 z-10 border-b px-4 py-3 text-xs font-black uppercase tracking-wide ${
                  isDark ? "border-zinc-800 bg-[#101010] text-cyan-300" : "border-slate-200 bg-white text-slate-500"
                }`}>
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const previous = rows[index - 1];
                const showGroup = !previous || previous.group !== row.group;
                return (
                  <React.Fragment key={`${row.group}-${row.name}`}>
                    {showGroup && (
                      <tr>
                        <td colSpan={2} className={`border-b px-4 py-3 text-xs font-black uppercase tracking-[0.18em] ${
                          isDark ? "border-zinc-800 bg-[#071016]" : "border-slate-200 bg-slate-50"
                        }`} style={{ color: row.groupColor }}>
                          {row.group}
                        </td>
                      </tr>
                    )}
                    <tr className={isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}>
                      <td className={`border-b px-4 py-3 font-semibold ${isDark ? "border-zinc-900 text-zinc-200" : "border-slate-100 text-slate-700"}`}>
                        {row.label}
                      </td>
                      <td className={`border-b px-4 py-3 font-black ${isDark ? "border-zinc-900 text-white" : "border-slate-100 text-slate-950"}`}>
                        {row.value}
                        {row.value !== "-" && row.unit ? <span className="ml-1 text-xs text-zinc-500">{row.unit}</span> : null}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>

          <div className="overflow-auto">
            <div className={`sticky top-0 z-10 border-b px-4 py-3 ${isDark ? "border-zinc-800 bg-[#101010]" : "border-slate-200 bg-white"}`}>
              <p className="text-xs font-black uppercase tracking-wide text-emerald-400">Historical Report Preview</p>
              <p className={`mt-1 text-xs font-bold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                {historyRows.length} records from selected date range
              </p>
            </div>
            {historyError && <div className="m-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200">{historyError}</div>}
            {historyLoading ? (
              <div className="flex h-52 items-center justify-center gap-2 text-sm font-bold text-zinc-400">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading report preview...
              </div>
            ) : (
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs">
                <thead>
                  <tr>
                    {["Recorded At", "Shot Date", "Shot Time", "Shot", "Part", "Cycle", "OK", "NG"].map((header) => (
                      <th key={header} className={`sticky top-[61px] border-b px-3 py-3 font-black uppercase tracking-wide ${
                        isDark ? "border-zinc-800 bg-[#101010] text-zinc-500" : "border-slate-200 bg-white text-slate-500"
                      }`}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={row.id || `${row.plc_ip}-${row.recorded_at}`} className={isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}>
                      <td className={`border-b px-3 py-3 font-bold ${isDark ? "border-zinc-900 text-zinc-200" : "border-slate-100 text-slate-700"}`}>{formatDateTime(row.recorded_at)}</td>
                      <td className={`border-b px-3 py-3 font-bold ${isDark ? "border-zinc-900 text-zinc-200" : "border-slate-100 text-slate-700"}`}>{formatDateOnly(row.shot_date)}</td>
                      <td className={`border-b px-3 py-3 font-bold ${isDark ? "border-zinc-900 text-zinc-200" : "border-slate-100 text-slate-700"}`}>{formatTimeOnly(row.shot_time)}</td>
                      <td className={`border-b px-3 py-3 font-black ${isDark ? "border-zinc-900 text-white" : "border-slate-100 text-slate-950"}`}>{formatValue(row.shot_number)}</td>
                      <td className={`border-b px-3 py-3 font-bold ${isDark ? "border-zinc-900 text-zinc-200" : "border-slate-100 text-slate-700"}`}>{formatValue(row.part_name)}</td>
                      <td className={`border-b px-3 py-3 font-black text-emerald-400 ${isDark ? "border-zinc-900" : "border-slate-100"}`}>{formatValue(row.cycle_time, "s")}</td>
                      <td className={`border-b px-3 py-3 font-bold ${isDark ? "border-zinc-900 text-zinc-200" : "border-slate-100 text-slate-700"}`}>{formatValue(row.ok_shot)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

const OperatorWorkstationPage = ({ onLogout, currentUser }) => {
  const theme = "dark";
  const [selectedPlant, setSelectedPlant] = useState(PLANTS[0]);
  const [divisionFilter, setDivisionFilter] = useState("HPDC");
  const [selectedLine, setSelectedLine] = useState("");
  const [selectedCell, setSelectedCell] = useState("");
  const [lines, setLines] = useState([]);
  const [machinesByLine, setMachinesByLine] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [plcReadings, setPlcReadings] = useState([]);
  const [plcLoading, setPlcLoading] = useState(true);
  const [plcError, setPlcError] = useState("");
  const [tableReading, setTableReading] = useState(null);

  const loadWorkstation = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getLines({
        plant: selectedPlant.code,
        division: divisionFilter || undefined,
      });
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setLines(rows);
      setSelectedLine((current) => {
        if (rows.some((line) => String(line.line_id) === String(current))) return current;
        return rows[0]?.line_id ? String(rows[0].line_id) : "";
      });

      const machineEntries = await Promise.all(rows.map(async (line) => {
        try {
          const machineResponse = await getLineMachines(line.line_id);
          return [line.line_id, Array.isArray(machineResponse.data?.data) ? machineResponse.data.data : []];
        } catch {
          return [line.line_id, []];
        }
      }));
      setMachinesByLine(Object.fromEntries(machineEntries));
    } catch {
      setLines([]);
      setMachinesByLine({});
      setError("Unable to load operator workstation data.");
    } finally {
      setLoading(false);
    }
  }, [divisionFilter, selectedPlant.code]);

  useEffect(() => {
    loadWorkstation();
  }, [loadWorkstation]);

  const loadPlcReadings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setPlcLoading(true);
    setPlcError("");
    try {
      const response = await getPlcLatestReadings();
      setPlcReadings(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setPlcError("Unable to load live PLC readings.");
    } finally {
      if (!silent) setPlcLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const run = async (options) => {
      if (!active) return;
      await loadPlcReadings(options);
    };

    run();
    const interval = window.setInterval(() => run({ silent: true }), 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadPlcReadings]);

  const openPlcTable = useCallback((reading) => {
    setTableReading(reading);
  }, []);

  const selectedLineData = useMemo(
    () => lines.find((line) => String(line.line_id) === String(selectedLine)) || lines[0],
    [lines, selectedLine]
  );

  const workstationRows = useMemo(() => {
    const visibleLines = selectedLineData ? [selectedLineData] : lines;
    const rows = visibleLines.flatMap((line) => {
      const machines = machinesByLine[line.line_id] || [];
      if (!machines.length) return [{ line, machine: null }];
      return machines.map((machine) => ({ line, machine }));
    });
    return rows.slice(0, 12);
  }, [lines, machinesByLine, selectedLineData]);

  const selectedMachineIps = useMemo(() => {
    return new Set(
      workstationRows
        .map((item) => item.machine?.ip_address)
        .filter(Boolean)
        .map((ip) => String(ip).trim())
    );
  }, [workstationRows]);

  const visiblePlcReadings = useMemo(() => {
    if (!selectedMachineIps.size) return plcReadings.length === 1 ? plcReadings : [];
    const matchedReadings = plcReadings.filter((reading) => selectedMachineIps.has(String(reading.plc_ip || "").trim()));
    if (matchedReadings.length) return matchedReadings;
    return plcReadings.length === 1 ? plcReadings : [];
  }, [plcReadings, selectedMachineIps]);

  const getWorkstationRowForReading = useCallback((reading) => {
    const readingIp = String(reading?.plc_ip || "").trim();
    return workstationRows.find((item) => String(item.machine?.ip_address || "").trim() === readingIp) || workstationRows[0] || {};
  }, [workstationRows]);

  const isDark = theme === "dark";

  return (
    <main className={`min-h-screen transition-colors ${
      isDark
        ? "bg-black text-white"
        : "bg-[radial-gradient(circle_at_16%_0%,rgba(159,208,245,0.34),transparent_28rem),radial-gradient(circle_at_88%_10%,rgba(0,124,186,0.12),transparent_24rem),linear-gradient(180deg,#f8fbff_0%,#eef4fb_54%,#e7eff8_100%)] text-slate-950"
    }`}>
      <header className={`sticky top-0 z-20 border-b px-7 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.18)] ${
        isDark ? "border-white/5 bg-black/95" : "border-[#c8d8ff] bg-[#f8fbff]/95"
      }`}>
        <div className="flex items-center justify-between gap-4">
          <div className={`flex h-[56px] w-[156px] items-center justify-center rounded-lg border px-5 ${
            isDark ? "border-white/10 bg-gradient-to-br from-zinc-950 to-zinc-900 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" : "border-[#c9d8ea] bg-white shadow-[0_8px_22px_rgba(19,75,143,0.10)]"
          }`}>
            <div className="scale-[0.76]">
              <BrandLogo wordmark className="justify-center" />
            </div>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                className={`flex items-center gap-3 rounded-lg px-2 py-1 transition ${isDark ? "hover:bg-white/5" : "hover:bg-slate-100"}`}
              >
                <div className="text-right">
                  <p className={`text-sm font-extrabold ${isDark ? "text-zinc-100" : "text-slate-900"}`}>{currentUser?.name || "Operator"}</p>
                  <p className="text-xs font-bold text-[#e0a300]">{currentUser?.role || "Operator"}</p>
                </div>
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                  <User className="h-7 w-7" />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </div>
              </button>
              {userMenuOpen && (
                <div className={`absolute right-0 top-full mt-2 w-44 rounded-lg border p-2 shadow-2xl ${
                  isDark ? "border-zinc-800 bg-[#121212]" : "border-slate-200 bg-white"
                }`}>
                  <button
                    type="button"
                    onClick={onLogout}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition ${
                      isDark ? "text-zinc-100 hover:bg-red-500/15 hover:text-red-200" : "text-slate-700 hover:bg-red-50 hover:text-red-600"
                    }`}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="px-7 pb-8 pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className={`text-xs font-black uppercase tracking-[0.18em] ${isDark ? "text-cyan-300" : "text-[#1474b8]"}`}>Digital Workstation</p>
              <h1 className={`mt-1 text-2xl font-bold ${isDark ? "text-zinc-200" : "text-slate-950"}`}>Live Production</h1>
            </div>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-sm font-bold ${isDark ? "border-zinc-800 bg-white/5 text-zinc-300" : "border-[#c9d8ea] bg-white/80 text-slate-600"}`}>
            {selectedPlant.name} | {divisionFilter || "All Divisions"} | {selectedLineData?.line_name || "Select Line"}
          </div>
        </div>

        <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-[280px_280px_280px_280px_280px]">
          <SelectField theme={theme} label="Select Plant" value={selectedPlant.code} onChange={(value) => {
            setSelectedPlant(getPlantByCode(value));
            setSelectedLine("");
          }}>
            {PLANTS.map((plant) => <option key={plant.code} value={plant.code}>{plant.name}</option>)}
          </SelectField>
          <SelectField theme={theme} label="Select Division" value={divisionFilter} onChange={(value) => {
            setDivisionFilter(value);
            setSelectedLine("");
          }}>
            {DIVISION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectField>
          <SelectField theme={theme} label="Select Line" value={selectedLine} onChange={setSelectedLine}>
            {!lines.length && <option value="">No lines available</option>}
            {lines.map((line) => <option key={line.line_id} value={line.line_id}>{line.line_name}</option>)}
          </SelectField>
          <SelectField theme={theme} label="Select Cells" value={selectedCell} onChange={setSelectedCell}>
            <option value="">All Cells</option>
            <option value="cell-1">Cell 1</option>
            <option value="cell-2">Cell 2</option>
          </SelectField>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
            {error}
          </div>
        )}

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-xs font-black uppercase tracking-[0.12em] ${isDark ? "text-cyan-400" : "text-[#1474b8]"}`}>Live Production</p>
              <h2 className={`mt-1 text-xl font-black ${isDark ? "text-white" : "text-slate-950"}`}>
                Latest Cycle Data
              </h2>
            </div>
            <button
              type="button"
              onClick={() => loadPlcReadings()}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-black transition ${
                isDark ? "border-zinc-800 bg-white/5 text-zinc-200 hover:bg-white/10" : "border-[#c8d8ff] bg-[#f8fbff] text-slate-700 shadow-sm hover:bg-[#edf4ff]"
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {plcError && (
            <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
              {plcError}
            </div>
          )}

          {plcLoading ? (
            <div className={`flex min-h-[260px] items-center justify-center gap-2 rounded-md border ${
              isDark ? "border-zinc-900 bg-[#101010] text-zinc-400" : "border-blue-200 bg-[#f7fbff] text-slate-500"
            }`}>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading live PLC cards...
            </div>
          ) : visiblePlcReadings.length ? (
            <div className="grid gap-5">
              {visiblePlcReadings.map((reading) => (
                (() => {
                  const row = getWorkstationRowForReading(reading);
                  return (
                    <PlcMachineCard
                      key={reading.plc_ip}
                      reading={reading}
                      machineInfo={row.machine}
                      lineInfo={row.line}
                      theme={theme}
                      currentUser={currentUser}
                      onOpenTable={openPlcTable}
                    />
                  );
                })()
              ))}
            </div>
          ) : (
            <div className={`flex min-h-[180px] items-center justify-center rounded-md border px-4 text-center text-sm font-bold ${
              isDark ? "border-zinc-900 bg-[#101010] text-zinc-400" : "border-blue-200 bg-[#f7fbff] text-slate-500"
            }`}>
              No latest PLC data found for the selected line machine.
            </div>
          )}
        </section>
      </section>

      {tableReading && (
        <PlcTableModal
          reading={tableReading}
          theme={theme}
          onClose={() => setTableReading(null)}
        />
      )}
    </main>
  );
};

export default OperatorWorkstationPage;
