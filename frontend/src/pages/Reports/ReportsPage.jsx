import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { reportApi, machineApi, shiftApi } from '../../api/services';
import { toDatetimeLocal } from '../../utils/time';
import { loadReportConfig } from '../../utils/reportConfig';
import ReportSummaryCards from './ReportSummaryCards';
import ReportTable from './ReportTable';
import { FileText, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_PLC_CYCLE_COLUMNS = [
  "id","created_at","machine_name","shot_hour","shot_minute","shot_second","ok_shot",
  "die_close_core_in_time","pouring_time","shot_fwd_time","curing_time","die_open_core_out_time",
  "ejector_time","extract_time","spray_time","v1_speed","v2_speed","v3_speed","v4_speed","metal_pressure",
  "furnace_metal_temp","cooling_water_mov","cooling_water_sta","accel_point","deaccel_point","intensification_time",
  "biscuit_thickness","jet_cooling_pressure","clamp_tonnage_he_low_pct","clamp_tonnage_he_low_mn","clamp_tonnage_op_up_pct",
  "clamp_tonnage_op_low_pct","clamp_tonnage_he_up_pct","vacuum_pressure","clamp_force_pct","clamp_tonnage","shot_acc_pressure",
  "intensification_acc_pressure","fixed_die_temp_f1","fixed_die_temp_f2","moving_die_temp_m1","moving_die_temp_m2","slide_temp_s1",
  "fix_1_flow","fix_2_flow","fix_3_flow","mov_1_flow","mov_2_flow","mov_3_flow","vacuum_pressure_mmhg",
  "average_die_clamp_tonnage_count","time_for_stroke","stroke","running_mode","emergency_stop","hyd_pump_motor_overload",
  "hyd_oil_level_low","hyd_oil_high_temp","servo_pump_overload","servo_pump_motor_high_temp","die_close_step","pouring_step",
  "shot_fwd_step","curing_step","die_open_step","ejector_step","extractor_step","spray_step","cycle_end","ng_shot","shot_status",
  "shot_year","shot_month","shot_day","shot_uid","machine_key","manual_mode","raw_readings_json","shot_number","recorded_at","cycle_time"
];

const normResult = (v) => {
  const s = String(v || "").toUpperCase().trim();
  if (["OK", "PASS", "COMPLETED", "ENDED_OK"].includes(s)) return "OK";
  if (["NG", "FAIL", "FAILED", "ENDED_NG", "INTERLOCKED"].includes(s)) return "NG";
  if (!s || s === "-" || s === "UNKNOWN") return "";
  return "IN_PROGRESS";
};
const formatPlcColumnLabel = (key) => {
  const raw = String(key || "").trim();
  if (!raw) return "PLC";
  const formatted = raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? (w.charAt(0).toUpperCase() + w.slice(1)) : w))
    .join(" ");
  return formatted.replace(/^Plc\s+/i, "");
};
const extractShotFromPartId = (partId) => {
  const s = String(partId || "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(10);
  return "";
};

const ReportsPage = () => {
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [machines, setMachines] = useState([]);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [data, setData] = useState({ rows: [], metrics: {}, availableShifts: [] });
  const [reportConfig, setReportConfig] = useState(() => loadReportConfig());
  
  const [filters, setFilters] = useState({
    dateFrom: toDatetimeLocal(new Date(new Date().setHours(0,0,0,0))),
    dateTo: toDatetimeLocal(new Date(new Date().setHours(23,59,59,999))),
    machineId: '',
    lineName: '',
    shiftCode: '',
    status: '',
    station: '',
    barcode: '',
    customerCode: '',
    operatorId: '',
    resultType: '',
    modelCode: '',
    operationNo: ''
  });
  const [quickRange, setQuickRange] = useState("today");

  const applyQuickRange = useCallback((key) => {
    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);
    if (key === "today") {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (key === "yesterday") {
      from.setDate(from.getDate() - 1);
      to.setDate(to.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (key === "last7") {
      from.setDate(from.getDate() - 7);
    } else if (key === "last15") {
      from.setDate(from.getDate() - 15);
    } else if (key === "last30") {
      from.setMonth(from.getMonth() - 1);
    }
    setFilters((prev) => ({
      ...prev,
      dateFrom: toDatetimeLocal(from),
      dateTo: toDatetimeLocal(to),
    }));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportApi.getData(filters);
      setData({ 
        rows: response.rows || [], 
        metrics: response.metrics || {},
        availableShifts: response.availableShifts || []
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to load production analytics");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    machineApi.list().then(setMachines).catch(console.error);
    shiftApi.list().then(setAvailableShifts).catch(() => []);
    fetchData();
    try { setReportConfig(loadReportConfig()); } catch {}
  }, []);

  const handleExport = async (type = "full") => {
    setExportLoading(true);
    const toastId = toast.loading(`Preparing ${type.toUpperCase()} report...`);
    try {
      let blob;

      // Pass filters and reportConfig as separate args — services.js builds the body correctly
      if (type === 'full')  blob = await reportApi.exportFull(filters);
      else if (type === 'ng')    blob = await reportApi.exportNG(filters);
      else if (type === 'parts') blob = await reportApi.exportParts(filters);
      else if (type === 'audit') blob = await reportApi.exportAudit(filters);

      if (!blob) throw new Error("Empty response from export engine");

      const url  = window.URL.createObjectURL(new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement('a');
      link.href  = url;
      const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      link.setAttribute('download', `${type.toUpperCase()}_REPORT_${ts}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded successfully", { id: toastId });
    } catch (e) {
      console.error("Export failed:", e);
      toast.error(e?.response?.data?.error || "Export failed — check console", { id: toastId });
    } finally {
      setExportLoading(false);
    }
  };

  const reportTable = useMemo(() => {
    const sourceRows = data.rows || [];
    const plcByShot = new Map();
    sourceRows.forEach((r) => {
      const merged = {
        ...(r.plcReading || {}),
        ...(r.plc_reading || {}),
        ...(r.plcReadings || {}),
        ...(r.plcCycleReadings || {}),
        ...(r.plc_cycle_readings || {}),
      };
      const shot = String(
        merged.shot_number || r.shot_number || r.shotNumber || extractShotFromPartId(r.partId || r.part_id || "")
      ).trim();
      if (shot && Object.keys(merged).length) plcByShot.set(shot, merged);
    });
    const machineStationPairs = (machines || [])
      .map((m) => {
        const machineName = String(m.machineName || m.machine_name || "").trim();
        const op = String(m.operationNo || m.operation_no || m.stationNo || m.station_no || "").trim();
        if (!machineName || !op) return null;
        return { key: `${machineName}__${op}`, machineName, op, label: `${machineName} + ${op}` };
      })
      .filter(Boolean);
    const machineStationMap = new Map(machineStationPairs.map((x) => [x.key, x]));
    const rowStationPairs = sourceRows
      .map((r) => {
        const machineName = String(r.machineName || "").trim();
        const op = String(r.operationNo || r.stationNo || "").trim();
        if (!machineName || !op) return null;
        return { key: `${machineName}__${op}`, machineName, op, label: `${machineName} + ${op}` };
      })
      .filter(Boolean);
    rowStationPairs.forEach((x) => {
      if (!machineStationMap.has(x.key)) machineStationMap.set(x.key, x);
    });
    const stationPairs = Array.from(machineStationMap.values()).sort((a, b) =>
      a.op.localeCompare(b.op, undefined, { numeric: true, sensitivity: "base" }) || a.machineName.localeCompare(b.machineName)
    );
    const livePlcKeys = [...new Set(sourceRows.flatMap((r) => {
      const legacy = r.plcReading && typeof r.plcReading === "object" ? Object.keys(r.plcReading) : [];
      const snake = r.plc_reading && typeof r.plc_reading === "object" ? Object.keys(r.plc_reading) : [];
      const plural = r.plcReadings && typeof r.plcReadings === "object" ? Object.keys(r.plcReadings) : [];
      const cycleCamel = r.plcCycleReadings && typeof r.plcCycleReadings === "object" ? Object.keys(r.plcCycleReadings) : [];
      const cycleSnake = r.plc_cycle_readings && typeof r.plc_cycle_readings === "object" ? Object.keys(r.plc_cycle_readings) : [];
      const flat = Object.keys(r || {}).filter((k) => /^plc[_A-Za-z0-9]*/.test(k) && k !== "plcReadings");
      return [...legacy, ...snake, ...plural, ...cycleCamel, ...cycleSnake, ...flat];
    }))];
    const plcSet = new Set([...DEFAULT_PLC_CYCLE_COLUMNS, ...livePlcKeys]);
    const preferredOrder = [
      ...DEFAULT_PLC_CYCLE_COLUMNS, "shot_number", "recorded_at", "part_id", "partid", "part_no", "part_number",
      "model_name", "model", "customer_qr", "customer_code", "process_result", "result", "status", "cycle_time", "ct",
    ];
    const rank = new Map(preferredOrder.map((k, i) => [k, i]));
    const plcKeys = Array.from(plcSet)
      .filter((k) => {
        const nk = String(k || "").toLowerCase().trim();
        return ![
          "part_name",
          "plc_ip",
          "plc_port",
          "plcreading",
          "id",
          "created_at",
          "status",
        ].includes(nk);
      })
      .sort((a, b) => {
        const ak = String(a || "").toLowerCase();
        const bk = String(b || "").toLowerCase();
        const ar = rank.has(ak) ? rank.get(ak) : 9999;
        const br = rank.has(bk) ? rank.get(bk) : 9999;
        if (ar !== br) return ar - br;
        return ak.localeCompare(bk);
      });
    const plcColumns = (() => {
      const used = new Map();
      return plcKeys.map((key) => {
        const base = formatPlcColumnLabel(key);
        const count = used.get(base) || 0;
        used.set(base, count + 1);
        return { key, label: count === 0 ? base : `${base} (${count + 1})` };
      });
    })();
    const grouped = new Map();
    sourceRows.forEach((row, idx) => {
      const key = String(row.partId || row.part_id || row.barcode || row.shot_uid || `row_${idx}`).trim();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    const dynamicColumns = [
      { key: "srNo", label: "#" },
      { key: "barcode", label: "Part Serial No." },
      { key: "createdAt", label: "Date & Time" },
      { key: "partName", label: "Part Name" },
      { key: "customerCode", label: "Customer QR Code" },
      ...stationPairs.map((s) => ({ key: `station_${s.key}`, label: s.label })),
      { key: "overallStatus", label: "Final" },
      ...plcColumns.map((c) => ({ key: `plc_${c.key}`, label: c.label })),
      ...(filters.machineId ? [{ key: "cycleStartTime", label: "Cycle Start" }, { key: "cycleTimeValue", label: "Cycle Time" }] : []),
      { key: "ngReason", label: "Reason / Remark" },
    ];

    const dynamicRows = Array.from(grouped.entries()).map(([partKey, entries], idx) => {
      const first = entries[0] || {};
      const stationResults = {};
      const stationCycleTimes = {};
      const plcData = {};
      entries.forEach((row) => {
        const stationOp = String(row.operationNo || row.stationNo || "").trim();
        const stationMachine = String(row.machineName || "").trim();
        const stationKey = stationMachine && stationOp ? `${stationMachine}__${stationOp}` : "";
        if (stationKey) {
          stationResults[stationKey] = String(row.industrialResult || row.statusLabel || "-").toUpperCase();
          stationCycleTimes[stationKey] = row.cycleTime || "-";
        }
        Object.assign(plcData, row.plcReading || {});
        Object.assign(plcData, row.plc_reading || {});
        Object.assign(plcData, row.plcReadings || {});
        Object.assign(plcData, row.plcCycleReadings || {});
        Object.assign(plcData, row.plc_cycle_readings || {});
      });
      if (!Object.keys(plcData).length) {
        const shot = String(first.shot_number || first.shotNumber || extractShotFromPartId(partKey) || "").trim();
        if (shot && plcByShot.has(shot)) Object.assign(plcData, plcByShot.get(shot));
      }
      const shaped = {
        srNo: idx + 1,
        barcode: partKey || "—",
        createdAt: first.createdAt ? new Date(first.createdAt).toLocaleString("en-IN") : "-",
        partName: plcData.part_name || first.partName || first.modelName || first.componentName || "-",
        customerCode: "-",
        overallStatus: (() => {
          const vals = stationPairs.map((s) => normResult(stationResults[s.key]));
          if (vals.some((v) => v === "NG")) return "NG";
          if (stationPairs.length > 0 && vals.every((v) => v === "OK")) return "PASSED";
          if (vals.some((v) => v === "IN_PROGRESS") || vals.some((v) => !v)) return "IN_PROGRESS";
          return "IN_PROGRESS";
        })(),
        ngReason: first.reason || first.interlock_reason || "-",
        cycleStartTime: first.createdAt ? new Date(first.createdAt).toLocaleString("en-IN") : "-",
        cycleTimeValue: stationPairs.length ? (stationCycleTimes[stationPairs[stationPairs.length - 1].key] || "-") : "-",
      };
      stationPairs.forEach((s) => {
        shaped[`station_${s.key}`] = normResult(stationResults[s.key]) || "-";
        shaped[`cycle_${s.key}`] = stationCycleTimes[s.key] || "-";
      });
      plcColumns.forEach(({ key }) => {
        shaped[`plc_${key}`] = plcData[key] ?? first[key] ?? "-";
      });
      return shaped;
    });

    return { columns: dynamicColumns, rows: dynamicRows };
  }, [data.rows, filters.machineId, machines]);
  const selectedFilterCount = useMemo(() => {
    const keys = ["machineId", "lineName", "shiftCode", "status", "barcode", "dateFrom", "dateTo"];
    return keys.reduce((acc, k) => acc + (filters[k] ? 1 : 0), 0);
  }, [filters]);
  const availableLines = useMemo(
    () => [...new Set((machines || []).map((m) => String(m.line_name || m.lineName || "").trim()).filter(Boolean))],
    [machines]
  );

  return (
    <div className="space-y-4 pb-16 rise-in">
      {/* Page Header */}
      <div className="db-header-card mb-6">
        <div className="db-header-gradient-bar" />
        <div className="db-header-inner">
          <div className="db-header-title-group">
            <div className="db-header-icon-box">
              <FileText size={22} />
            </div>
            <div>
              <h1 className="db-header-title text-text-main">Traceability Report</h1>
              <p className="db-header-subtitle">Production analytics and PLC cycle trace data</p>
            </div>
          </div>
          {Boolean(reportConfig?.showLogo && reportConfig?.logoUrl) && (
            <div className="bg-white/80 border border-border rounded-lg px-3 py-2">
              <img src={reportConfig.logoUrl} alt="Report logo" className="h-10 w-auto object-contain" />
            </div>
          )}
        </div>
      </div>

      <div className="bg-bg-card border border-border rounded-xl p-3 mb-2 flex items-center justify-between">
        <p className="text-[14px] font-bold text-text-muted uppercase tracking-wider">Report</p>
        <div className="flex items-center gap-2">
          <button
            disabled={loading}
            onClick={fetchData}
            className="inline-flex items-center gap-2 bg-bg-dark text-text-main px-3 py-2 rounded-lg text-xs font-bold border border-border hover:border-primary/40 transition-all disabled:opacity-60"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            disabled={exportLoading}
            onClick={() => handleExport("full")}
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
          >
            <Download size={14} /> {exportLoading ? "Downloading..." : "Download Report"}
          </button>
        </div>
      </div>
      <div className="bg-bg-card border border-border rounded-xl p-4 shadow-sm grid gap-3 md:grid-cols-2 lg:grid-cols-5" style={{ boxShadow: "0 2px 12px rgba(26,50,99,.08),0 1px 3px rgba(26,50,99,.05)" }}>
        <select
          value={quickRange}
          onChange={(e) => {
            const key = e.target.value;
            setQuickRange(key);
            applyQuickRange(key);
          }}
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 Days</option>
          <option value="last15">Last 15 Days</option>
          <option value="last30">Last 1 Month</option>
        </select>
        <input
          type="datetime-local"
          value={filters.dateFrom || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        />
        <input
          type="datetime-local"
          value={filters.dateTo || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        />
        <select
          value={filters.lineName}
          onChange={(e) => setFilters((prev) => ({ ...prev, lineName: e.target.value, machineId: "" }))}
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        >
          <option value="">All Lines</option>
          {availableLines.map((line) => <option key={line} value={line}>{line}</option>)}
        </select>
        <select
          value={filters.machineId}
          onChange={(e) => setFilters((prev) => ({ ...prev, machineId: e.target.value }))}
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        >
          <option value="">All Machines</option>
          {machines
            .filter((m) => !filters.lineName || String(m.line_name || m.lineName || "").trim() === filters.lineName)
            .map((m) => <option key={m.id} value={m.id}>{m.machine_name || m.machineName}</option>)}
        </select>
        <input
          value={filters.barcode || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, barcode: e.target.value }))}
          placeholder="Part ID"
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        />
        <select
          value={filters.status || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        >
          <option value="">All Status</option>
          <option value="OK">PASSED</option>
          <option value="NG">FAILED</option>
        </select>
        <select
          value={filters.shiftCode || ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, shiftCode: e.target.value }))}
          className="h-10 px-3 rounded-lg border border-border bg-bg-dark text-text-main text-xs min-w-0"
        >
          <option value="">All Shifts</option>
          {((data.availableShifts && data.availableShifts.length) ? data.availableShifts : availableShifts).map((shift) => (
            <option key={shift.shiftCode || shift.shift_code} value={shift.shiftCode || shift.shift_code}>
              {shift.shiftName || shift.shift_name || shift.shiftCode || shift.shift_code}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFilters({
            dateFrom: toDatetimeLocal(new Date(new Date().setHours(0, 0, 0, 0))),
            dateTo: toDatetimeLocal(new Date(new Date().setHours(23, 59, 59, 999))),
            machineId: '', lineName: '', shiftCode: '', status: '', station: '', barcode: '', customerCode: '',
            operatorId: '', resultType: '', modelCode: '', operationNo: ''
          })}
          className="h-10 px-3 rounded-lg border border-red-400/30 bg-red-500/10 text-red-400 text-xs font-bold"
        >
          Clear
        </button>
        <button
          disabled={loading}
          onClick={fetchData}
          className="h-10 px-3 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: "rgba(84,119,146,0.10)", borderColor: "rgba(84,119,146,0.30)", color: "rgb(84,119,146)" }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {loading ? "Loading..." : "Apply Filters"}
        </button>
      </div>

      <ReportSummaryCards metrics={data.metrics} />

      <ReportTable rows={reportTable.rows} columns={reportTable.columns} loading={loading} />
    </div>
  );
};

export default ReportsPage;
