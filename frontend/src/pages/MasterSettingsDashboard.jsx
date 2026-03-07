import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Factory,
  FileText,
  Gauge,
  LayoutPanelTop,
  PieChart as PieIcon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { dashboardApi, machineApi, roleAccessApi, stationSettingsApi } from "../api/services";
import GlobalPopup from "../components/GlobalPopup";
import { formatMachineLabel, getMachineStage } from "../utils/machineFields";
import {
  DEFAULT_STATION_FEATURES,
  getStationFeatureSettings,
  mergeStationFeatureSettings,
  normalizeStationKey,
  saveStationFeatureSettings,
} from "../utils/stationSettings";
import {
  ACCESS_LEVEL_OPTIONS,
  MODULE_ACCESS_META,
  formatAccessLevel,
  getRoleAccessSettings,
  normalizeRoleAccessSettings,
  saveRoleAccessSettings,
} from "../utils/roleAccess";

const EMPTY_SUMMARY = {
  machines: { total: 0, active: 0, inactive: 0 },
  parts: { inProgress: 0, completed: 0, ng: 0, interlocked: 0, rework: 0 },
  quality: { ok: 0, ng: 0 },
  shiftProduction: {},
  availableShifts: [],
};

const EMPTY_REPORT = {
  machineWise: [],
  interlockHistory: [],
  shiftProduction: {},
  machineCards: [],
  stationCards: [],
};

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
const DASHBOARD_REALTIME_COOLDOWN_MS = 1200;
const CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7", "#f97316", "#06b6d4"];

const TABS = [
  { id: "master", label: "Master Dashboard", icon: LayoutPanelTop },
  { id: "stations", label: "Station Controls", icon: Settings2 },
  { id: "reports", label: "Report Dashboard", icon: FileText },
];

function getTodayRange() {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  return {
    dateFrom: from.toISOString(),
    dateTo: now.toISOString(),
  };
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function normalizePlcPartCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

const MasterSettingsDashboard = ({ forcedTab = null }) => {
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);
  const isAdmin = String(user.role || "").trim().toLowerCase() === "admin";

  const normalizedForcedTab = useMemo(
    () => (TABS.some((entry) => entry.id === forcedTab) ? forcedTab : null),
    [forcedTab]
  );
  const [activeTab, setActiveTab] = useState(normalizedForcedTab || "master");
  const [machines, setMachines] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [report, setReport] = useState(EMPTY_REPORT);
  const [stationSettings, setStationSettings] = useState(() => getStationFeatureSettings());
  const [roleAccessSettings, setRoleAccessSettings] = useState(() => getRoleAccessSettings());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [popup, setPopup] = useState(null);
  const realtimeTimerRef = useRef(null);
  const lastRealtimeRefreshRef = useRef(0);

  const stationRows = useMemo(() => {
    const grouped = new Map();

    for (const machine of machines) {
      const stationNo = normalizeStationKey(getMachineStage(machine));
      if (!stationNo) {
        continue;
      }

      if (!grouped.has(stationNo)) {
        grouped.set(stationNo, {
          stationNo,
          lineNames: new Set(),
          sequenceNo: Number(machine.sequenceNo || 9999),
          machines: [],
        });
      }

      const row = grouped.get(stationNo);
      row.lineNames.add(String(machine.lineName || "-").trim() || "-");
      row.machines.push({
        id: machine.id,
        machineName: machine.machineName || `Machine ${machine.id}`,
        sequenceNo: Number(machine.sequenceNo || 9999),
        operationNo: getMachineStage(machine),
      });
      row.sequenceNo = Math.min(row.sequenceNo, Number(machine.sequenceNo || 9999));
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        lineNames: Array.from(row.lineNames).sort((a, b) => a.localeCompare(b)),
        machines: [...row.machines].sort((a, b) => {
          if (a.sequenceNo === b.sequenceNo) {
            return a.machineName.localeCompare(b.machineName);
          }
          return a.sequenceNo - b.sequenceNo;
        }),
      }))
      .sort((a, b) => {
        if (a.sequenceNo === b.sequenceNo) {
          return a.stationNo.localeCompare(b.stationNo);
        }
        return a.sequenceNo - b.sequenceNo;
      });
  }, [machines]);

  const stationKeys = useMemo(() => stationRows.map((entry) => entry.stationNo), [stationRows]);

  const normalizedSettings = useMemo(
    () => mergeStationFeatureSettings(stationKeys, stationSettings),
    [stationKeys, stationSettings]
  );
  const normalizedRoleAccess = useMemo(
    () => normalizeRoleAccessSettings(roleAccessSettings),
    [roleAccessSettings]
  );

  const machineById = useMemo(
    () =>
      machines.reduce((acc, machine) => {
        acc[machine.id] = machine;
        return acc;
      }, {}),
    [machines]
  );

  const machineNameById = useMemo(
    () =>
      machines.reduce((acc, machine) => {
        acc[machine.id] = formatMachineLabel(machine);
        return acc;
      }, {}),
    [machines]
  );

  const loadData = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const query = getTodayRange();
        const [machineRows, summaryRows, reportRows, remoteSettings, remoteRoleAccess] = await Promise.all([
          machineApi.list(),
          dashboardApi.summary(query),
          dashboardApi.report(query),
          stationSettingsApi.list().catch(() => null),
          roleAccessApi.list().catch(() => null),
        ]);

        setMachines(machineRows || []);
        setSummary(summaryRows || EMPTY_SUMMARY);
        setReport(reportRows || EMPTY_REPORT);
        setStationSettings((prev) => {
          const localFallback = Object.keys(prev).length > 0 ? prev : getStationFeatureSettings();
          const sourceSettings =
            remoteSettings && Object.keys(remoteSettings).length > 0 ? remoteSettings : localFallback;
          const merged = mergeStationFeatureSettings(
            (machineRows || []).map((machine) => getMachineStage(machine)),
            sourceSettings
          );
          saveStationFeatureSettings(merged);
          return merged;
        });
        setRoleAccessSettings((prev) => {
          const localFallback = Object.keys(prev).length > 0 ? prev : getRoleAccessSettings();
          const sourceSettings =
            remoteRoleAccess && Object.keys(remoteRoleAccess).length > 0 ? remoteRoleAccess : localFallback;
          const normalized = normalizeRoleAccessSettings(sourceSettings);
          saveRoleAccessSettings(normalized);
          return normalized;
        });
      } catch (error) {
        setPopup({
          type: "ERROR",
          title: "Load Failed",
          message: error.response?.data?.error || "Unable to load master dashboard data",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (normalizedForcedTab) {
      setActiveTab(normalizedForcedTab);
    }
  }, [normalizedForcedTab]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const scheduleRealtimeRefresh = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastRealtimeRefreshRef.current;
    const delay = Math.max(0, DASHBOARD_REALTIME_COOLDOWN_MS - elapsed);

    if (realtimeTimerRef.current) {
      return;
    }

    realtimeTimerRef.current = setTimeout(() => {
      realtimeTimerRef.current = null;
      lastRealtimeRefreshRef.current = Date.now();
      loadData(false);
    }, delay);
  }, [loadData]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      reconnectionDelay: 200,
      reconnectionDelayMax: 1200,
    });

    socket.on("dashboard_refresh", () => {
      scheduleRealtimeRefresh();
    });

    socket.on("operator_popup", () => {
      scheduleRealtimeRefresh();
    });

    return () => {
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
      socket.disconnect();
    };
  }, [scheduleRealtimeRefresh]);

  const saveCurrentSettings = async () => {
    try {
      await Promise.all([
        stationSettingsApi.save(normalizedSettings),
        isAdmin ? roleAccessApi.save(normalizedRoleAccess) : Promise.resolve(null),
      ]);
      saveStationFeatureSettings(normalizedSettings);
      saveRoleAccessSettings(normalizedRoleAccess);
      setPopup({
        type: "SUCCESS",
        title: "Configuration Saved",
        message: isAdmin
          ? "Master settings, station controls, and role access have been saved."
          : "Master settings and station controls have been saved.",
      });
    } catch (error) {
      setPopup({
        type: "ERROR",
        title: "Save Failed",
        message: error.response?.data?.error || "Unable to save settings to server",
      });
    }
  };

  const updateStationToggle = (stationNo, key, value) => {
    const stationKey = normalizeStationKey(stationNo);
    if (!stationKey) {
      return;
    }
    setStationSettings((prev) => {
      const base = { ...prev };
      if (key === "finalPacking" && value) {
        for (const existingKey of Object.keys(base)) {
          base[existingKey] = {
            ...DEFAULT_STATION_FEATURES,
            ...(base[existingKey] || {}),
            finalPacking: false,
          };
        }
      }
      const updated = {
        ...base,
        [stationKey]: {
          ...DEFAULT_STATION_FEATURES,
          ...(base[stationKey] || {}),
          [key]: value,
        },
      };
      saveStationFeatureSettings(updated);
      return updated;
    });
  };

  const updateStationPartCount = (stationNo, rawValue) => {
    const stationKey = normalizeStationKey(stationNo);
    if (!stationKey) {
      return;
    }
    const plcPartCount = normalizePlcPartCount(rawValue);
    setStationSettings((prev) => {
      const updated = {
        ...prev,
        [stationKey]: {
          ...DEFAULT_STATION_FEATURES,
          ...(prev[stationKey] || {}),
          plcPartCount,
        },
      };
      saveStationFeatureSettings(updated);
      return updated;
    });
  };

  const applyPreset = (preset) => {
    const next = stationKeys.reduce((acc, stationNo) => {
      if (preset === "strict") {
        acc[stationNo] = {
          qr: true,
          operation: true,
          rejectionBin: true,
          plcConfirmation: true,
          manualResult: false,
          plcPartCount: 1,
          finalPacking: false,
        };
      } else if (preset === "speed") {
        acc[stationNo] = {
          qr: true,
          operation: true,
          rejectionBin: false,
          plcConfirmation: false,
          manualResult: false,
          plcPartCount: 1,
          finalPacking: false,
        };
      } else {
        acc[stationNo] = {
          qr: true,
          operation: true,
          rejectionBin: true,
          plcConfirmation: true,
          manualResult: false,
          plcPartCount: 1,
          finalPacking: false,
        };
      }
      return acc;
    }, {});
    setStationSettings(next);
    saveStationFeatureSettings(next);
  };

  const updateRoleAccess = (moduleKey, roleKey, accessLevel) => {
    setRoleAccessSettings((prev) => {
      const normalized = normalizeRoleAccessSettings(prev);
      const next = {
        ...normalized,
        [moduleKey]: {
          ...(normalized[moduleKey] || {}),
          [roleKey]: accessLevel,
        },
      };
      saveRoleAccessSettings(next);
      return next;
    });
  };

  const resetSettings = () => {
    const defaults = stationKeys.reduce((acc, stationNo) => {
      acc[stationNo] = { ...DEFAULT_STATION_FEATURES };
      return acc;
    }, {});
    setStationSettings(defaults);
    saveStationFeatureSettings(defaults);
    setPopup({
      type: "SUCCESS",
      title: "Defaults Restored",
      message: "Station controls reset to standard defaults.",
    });
  };

  const incidents = report.interlockHistory || [];

  const stationSignalRows = useMemo(() => {
    const grouped = {};
    for (const row of report.machineWise || []) {
      const machineId = Number(row.machine_id || 0);
      const machine = machineById[machineId];
      const stationNo = normalizeStationKey(getMachineStage(machine) || `M-${machineId}`);
      if (!grouped[stationNo]) {
        grouped[stationNo] = {
          stationNo,
          ok: 0,
          ng: 0,
          machineIds: new Set(),
        };
      }
      grouped[stationNo].ok += Number(row.ok || 0);
      grouped[stationNo].ng += Number(row.ng || 0);
      grouped[stationNo].machineIds.add(machineId);
    }

    return Object.values(grouped)
      .map((row) => ({
        stationNo: row.stationNo,
        ok: row.ok,
        ng: row.ng,
        machineCount: row.machineIds.size,
        status: row.ng > 0 ? "FAIL" : row.ok > 0 ? "PASS" : "WAIT",
      }))
      .sort((a, b) => {
        const priority = { FAIL: 0, PASS: 1, WAIT: 2 };
        if (priority[a.status] !== priority[b.status]) {
          return priority[a.status] - priority[b.status];
        }
        return a.stationNo.localeCompare(b.stationNo);
      });
  }, [report.machineWise, machineById]);

  const machineCards = useMemo(
    () => (Array.isArray(report.machineCards) ? report.machineCards : []),
    [report.machineCards]
  );
  const stationCards = useMemo(
    () => (Array.isArray(report.stationCards) ? report.stationCards : []),
    [report.stationCards]
  );

  const machineReportRows = useMemo(
    () =>
      machineCards.map((row) => {
        const machineId = Number(row.machineId || 0);
        const machineName = row.machineName || machineNameById[machineId] || `Machine ${machineId}`;
        const stationNo = row.stationNo || getMachineStage(machineById[machineId]) || "-";
        const targetQty = Number(row.targetQty || 0);
        const producedQty = Number(row.processedCount || 0);
        const okQty = Number(row.okCount || 0);
        const ngQty = Number(row.ngCount || 0);
        const downtimeEvents = Number(row.downtimeEvents || 0);
        const achievementPct = targetQty > 0 ? Number(((producedQty / targetQty) * 100).toFixed(2)) : 0;
        const targetGap = targetQty > 0 ? Math.max(targetQty - producedQty, 0) : 0;
        return {
          machineId,
          machineName,
          stationNo,
          lineName: row.lineName || "-",
          targetQty,
          producedQty,
          okQty,
          ngQty,
          downtimeEvents,
          accuracy: Number(row.accuracy || 0),
          downtimeRate: Number(row.downtimeRate || 0),
          achievementPct,
          targetGap,
        };
      }),
    [machineCards, machineById, machineNameById]
  );

  const productionPieData = useMemo(
    () =>
      machineReportRows
        .filter((row) => row.producedQty > 0)
        .map((row) => ({
          name: `${row.stationNo} - ${row.machineName}`,
          value: row.producedQty,
        })),
    [machineReportRows]
  );

  const downtimePieData = useMemo(
    () =>
      machineReportRows
        .filter((row) => row.downtimeEvents > 0)
        .map((row) => ({
          name: `${row.stationNo} - ${row.machineName}`,
          value: row.downtimeEvents,
        })),
    [machineReportRows]
  );

  const targetVsActualData = useMemo(
    () =>
      machineReportRows
        .map((row) => ({
          machine: `${row.stationNo}`,
          machineName: row.machineName,
          target: row.targetQty,
          produced: row.producedQty,
          downtimeRate: row.downtimeRate,
          accuracy: row.accuracy,
        }))
        .slice(0, 16),
    [machineReportRows]
  );

  const reportKpi = useMemo(() => {
    const targetTotal = machineReportRows.reduce((sum, row) => sum + row.targetQty, 0);
    const producedTotal = machineReportRows.reduce((sum, row) => sum + row.producedQty, 0);
    const downtimeTotal = machineReportRows.reduce((sum, row) => sum + row.downtimeEvents, 0);
    const achievedPct = targetTotal > 0 ? Number(((producedTotal / targetTotal) * 100).toFixed(2)) : 0;
    const avgAccuracy =
      machineReportRows.length > 0
        ? Number(
            (
              machineReportRows.reduce((sum, row) => sum + Number(row.accuracy || 0), 0) /
              machineReportRows.length
            ).toFixed(2)
          )
        : 0;
    return {
      targetTotal,
      producedTotal,
      downtimeTotal,
      achievedPct,
      avgAccuracy,
    };
  }, [machineReportRows]);

  const topMachines = machineReportRows
    .slice()
    .sort((a, b) => b.producedQty - a.producedQty || b.downtimeEvents - a.downtimeEvents)
    .slice(0, 12);

  const lineReadiness = useMemo(() => {
    const total = Number(summary.machines.total || 0);
    const active = Number(summary.machines.active || 0);
    if (total === 0) {
      return 0;
    }
    return Math.round((active / total) * 100);
  }, [summary.machines.active, summary.machines.total]);

  const renderTabButton = (tab) => {
    const Icon = tab.icon;
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          active
            ? "bg-primary text-bg-dark shadow-[0_10px_30px_-12px_rgba(25,179,199,0.8)]"
            : "bg-bg-card border border-border text-text-muted hover:border-primary hover:text-text-main"
        }`}
      >
        <Icon size={16} />
        {tab.label}
      </button>
    );
  };

  const headerText = useMemo(() => {
    if (activeTab === "stations") {
      return {
        title: "Station Controls",
        subtitle: "Configure station rules, PLC confirmation, manual OK/NG, and packing station behavior.",
      };
    }
    if (activeTab === "reports") {
      return {
        title: "Report Dashboard",
        subtitle: "Track quality, incidents, and machine ranking with reporting-focused controls.",
      };
    }
    return {
      title: "Master Dashboard",
      subtitle: "Manage line readiness, role access, and command-center level controls.",
    };
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <GlobalPopup popup={popup} onClose={() => setPopup(null)} />

      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Settings Command Center</p>
            <h1 className="mt-1 text-2xl font-bold text-text-main">{headerText.title}</h1>
            <p className="text-sm text-text-muted mt-1">{headerText.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-3 py-2 text-sm text-text-main hover:border-primary disabled:opacity-60"
              disabled={loading || refreshing}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={resetSettings}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-3 py-2 text-sm text-text-main hover:border-warning"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={saveCurrentSettings}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-bg-dark hover:brightness-110"
            >
              <Save size={14} />
              Save
            </button>
          </div>
        </div>

        {!normalizedForcedTab && <div className="mt-5 flex flex-wrap gap-2">{TABS.map(renderTabButton)}</div>}
      </div>

      {loading ? (
        <div className="industrial-card p-8 text-sm text-text-muted">Loading master dashboard...</div>
      ) : null}

      {!loading && activeTab === "master" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="industrial-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase text-text-muted">Line Readiness</p>
                <Gauge size={16} className="text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold text-text-main">{lineReadiness}%</p>
              <div className="mt-3 h-2 rounded-full bg-bg-dark border border-border">
                <div className="h-full rounded-full bg-primary" style={{ width: `${lineReadiness}%` }} />
              </div>
            </div>

            <div className="industrial-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase text-emerald-300">PASS Parts</p>
                <ShieldCheck size={16} className="text-emerald-300" />
              </div>
              <p className="mt-2 text-3xl font-bold text-emerald-200">{summary.quality.ok || 0}</p>
            </div>

            <div className="industrial-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase text-rose-300">FAIL / NG</p>
                <AlertTriangle size={16} className="text-rose-300" />
              </div>
              <p className="mt-2 text-3xl font-bold text-rose-200">{summary.quality.ng || 0}</p>
            </div>

            <div className="industrial-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase text-text-muted">Interlocks</p>
                <Factory size={16} className="text-warning" />
              </div>
              <p className="mt-2 text-3xl font-bold text-warning">{summary.parts.interlocked || 0}</p>
            </div>
          </div>

          <div className="industrial-card p-5">
            <h2 className="font-bold text-text-main mb-3">Station Pass / Fail Board</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {stationSignalRows.map((row) => {
                const isPass = row.status === "PASS";
                const isFail = row.status === "FAIL";
                const tone = isPass
                  ? "border-emerald-500/75 bg-emerald-500/14"
                  : isFail
                  ? "border-rose-500/75 bg-rose-500/14"
                  : "border-slate-500/60 bg-slate-500/10";
                const badgeTone = isPass
                  ? "bg-emerald-500 text-white"
                  : isFail
                  ? "bg-rose-500 text-white"
                  : "bg-slate-500 text-white";

                return (
                  <div key={row.stationNo} className={`rounded-xl border p-3 ${tone}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-base font-bold text-white">{row.stationNo}</p>
                      <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${badgeTone}`}>{row.status}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-emerald-300 font-semibold">OK: {row.ok}</span>
                      <span className="text-rose-300 font-semibold">NG: {row.ng}</span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">{row.machineCount} machine(s)</p>
                  </div>
                );
              })}
              {stationSignalRows.length === 0 && (
                <p className="text-sm text-text-muted">No station signal data available.</p>
              )}
            </div>
          </div>

          <div className="industrial-card p-5">
            <h2 className="font-bold text-text-main mb-3">Role Access Matrix</h2>
            <p className="text-sm text-text-muted mb-3">
              Admin can configure module visibility by role. Sidebar and route visibility follow this matrix after save.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-bg-dark/70 text-text-muted text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Module</th>
                    <th className="px-4 py-3 text-left">Admin</th>
                    <th className="px-4 py-3 text-left">Engineer</th>
                    <th className="px-4 py-3 text-left">Supervisor</th>
                    <th className="px-4 py-3 text-left">Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULE_ACCESS_META.map((row) => (
                    <tr key={row.key} className="border-t border-border/60">
                      <td className="px-4 py-3 font-semibold text-text-main">{row.label}</td>
                      {["admin", "engineer", "supervisor", "operator"].map((roleKey) => {
                        const level = normalizedRoleAccess[row.key]?.[roleKey] || "HIDDEN";
                        return (
                          <td key={`${row.key}-${roleKey}`} className="px-4 py-3 text-text-main">
                            {isAdmin ? (
                              <select
                                value={level}
                                onChange={(event) => updateRoleAccess(row.key, roleKey, event.target.value)}
                                className="w-full rounded-lg border border-border bg-bg-dark px-2 py-1.5 text-xs text-text-main focus:border-primary focus:outline-none"
                              >
                                {ACCESS_LEVEL_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              formatAccessLevel(level)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isAdmin && (
              <p className="mt-3 text-xs text-text-muted">
                Role access edit is restricted to Admin users. You currently have view-only access.
              </p>
            )}
          </div>

          <div className="industrial-card p-5">
            <h2 className="font-bold text-text-main mb-3">Recent Rejection Alerts</h2>
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {incidents.slice(0, 10).map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{row.part_id || row.partId || "Unknown part"}</p>
                    <p className="text-xs text-rose-200">{row.interlock_reason || "No reason"}</p>
                  </div>
                  <p className="text-xs text-text-muted whitespace-nowrap">{formatDateTime(row.createdAt)}</p>
                </div>
              ))}
              {incidents.length === 0 && <p className="text-sm text-text-muted">No rejection alerts in this window.</p>}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === "stations" && (
        <div className="space-y-6">
          <div className="industrial-card p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-bold text-text-main">Station Requirement Matrix</h2>
                <p className="text-sm text-text-muted mt-1">
                  Configure per-station checks: QR validation, operation rule, rejection flow, PLC confirmation, manual OK/NG mode, PLC part count, and final packing station.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => applyPreset("strict")}
                  className="rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-semibold text-text-main hover:border-primary"
                >
                  Strict Quality
                </button>
                <button
                  onClick={() => applyPreset("speed")}
                  className="rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-semibold text-text-main hover:border-primary"
                >
                  Speed Focus
                </button>
                <button
                  onClick={() => applyPreset("balanced")}
                  className="rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-semibold text-text-main hover:border-primary"
                >
                  Balanced
                </button>
              </div>
            </div>
          </div>

          <div className="industrial-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1460px] text-sm">
                <thead className="bg-bg-dark/70 text-text-muted text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Station</th>
                    <th className="px-4 py-3 text-left">Line</th>
                    <th className="px-4 py-3 text-left">Machines</th>
                    <th className="px-4 py-3 text-center">QR Validation</th>
                    <th className="px-4 py-3 text-center">Operation Rule</th>
                    <th className="px-4 py-3 text-center">Rejection Bin</th>
                    <th className="px-4 py-3 text-center">PLC Confirmation</th>
                    <th className="px-4 py-3 text-center">Manual OK/NG</th>
                    <th className="px-4 py-3 text-center">PLC Part Count</th>
                    <th className="px-4 py-3 text-center">Final Packing</th>
                  </tr>
                </thead>
                <tbody>
                  {stationRows.map((row) => {
                    const config = normalizedSettings[row.stationNo] || DEFAULT_STATION_FEATURES;
                    return (
                      <tr key={row.stationNo} className="border-t border-border/60 hover:bg-bg-dark/50">
                        <td className="px-4 py-3 font-semibold text-text-main">{row.stationNo}</td>
                        <td className="px-4 py-3 text-text-muted">{row.lineNames.join(", ") || "-"}</td>
                        <td className="px-4 py-3 text-text-main">
                          <div className="flex items-start gap-2">
                            <span className="rounded-md bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                              {row.machines.length}
                            </span>
                            <span className="text-xs text-text-muted">
                              {row.machines
                                .map((machine) => `${machine.machineName} (Seq ${machine.sequenceNo})`)
                                .join(", ")}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={config.qr}
                            onChange={(event) => updateStationToggle(row.stationNo, "qr", event.target.checked)}
                            className="h-4 w-4 accent-[var(--app-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={config.operation}
                            onChange={(event) => updateStationToggle(row.stationNo, "operation", event.target.checked)}
                            className="h-4 w-4 accent-[var(--app-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={config.rejectionBin}
                            onChange={(event) => updateStationToggle(row.stationNo, "rejectionBin", event.target.checked)}
                            className="h-4 w-4 accent-[var(--app-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={config.plcConfirmation}
                            onChange={(event) => updateStationToggle(row.stationNo, "plcConfirmation", event.target.checked)}
                            className="h-4 w-4 accent-[var(--app-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={config.manualResult === true}
                            onChange={(event) => updateStationToggle(row.stationNo, "manualResult", event.target.checked)}
                            className="h-4 w-4 accent-[var(--app-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={normalizePlcPartCount(config.plcPartCount)}
                            disabled={!config.plcConfirmation}
                            onChange={(event) => updateStationPartCount(row.stationNo, event.target.value)}
                            className="mx-auto w-20 rounded-lg border border-border bg-bg-dark px-2 py-1 text-center text-xs text-text-main focus:border-primary focus:outline-none disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={config.finalPacking === true}
                            onChange={(event) => updateStationToggle(row.stationNo, "finalPacking", event.target.checked)}
                            className="h-4 w-4 accent-[var(--app-primary)]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {!loading && activeTab === "reports" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="industrial-card p-4">
              <p className="text-xs uppercase text-text-muted">Total Target</p>
              <p className="mt-2 text-2xl font-bold text-text-main">{reportKpi.targetTotal}</p>
              <p className="text-[11px] text-text-muted mt-1">Across all mapped machines</p>
            </div>
            <div className="industrial-card p-4">
              <p className="text-xs uppercase text-text-muted">Total Production</p>
              <p className="mt-2 text-2xl font-bold text-primary">{reportKpi.producedTotal}</p>
              <p className="text-[11px] text-text-muted mt-1">OK + NG processed count</p>
            </div>
            <div className="industrial-card p-4">
              <p className="text-xs uppercase text-text-muted">Target Achievement</p>
              <p className="mt-2 text-2xl font-bold text-accent">{reportKpi.achievedPct}%</p>
              <p className="text-[11px] text-text-muted mt-1">Produced vs planned target</p>
            </div>
            <div className="industrial-card p-4">
              <p className="text-xs uppercase text-text-muted">Average Accuracy</p>
              <p className="mt-2 text-2xl font-bold text-emerald-300">{reportKpi.avgAccuracy}%</p>
              <p className="text-[11px] text-text-muted mt-1">Machine average pass ratio</p>
            </div>
            <div className="industrial-card p-4">
              <p className="text-xs uppercase text-text-muted">Downtime Events</p>
              <p className="mt-2 text-2xl font-bold text-warning">{reportKpi.downtimeTotal}</p>
              <p className="text-[11px] text-text-muted mt-1">PLC Comm + Interlock events</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="industrial-card p-5">
              <h2 className="font-bold text-text-main mb-3 flex items-center gap-2">
                <PieIcon size={16} className="text-primary" />
                Machine-wise Production Share
              </h2>
              {productionPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={productionPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={2}
                    >
                      {productionPieData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-muted">No production data available for pie chart.</p>
              )}
            </div>

            <div className="industrial-card p-5">
              <h2 className="font-bold text-text-main mb-3 flex items-center gap-2">
                <PieIcon size={16} className="text-warning" />
                Machine-wise Downtime Share
              </h2>
              {downtimePieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={downtimePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={2}
                    >
                      {downtimePieData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-muted">No downtime events found in current report window.</p>
              )}
            </div>
          </div>

          <div className="industrial-card p-5">
            <h2 className="font-bold text-text-main mb-3 flex items-center gap-2">
              <BarChart3 size={16} className="text-primary" />
              Target vs Production vs Downtime
            </h2>
            {targetVsActualData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={targetVsActualData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="machine" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="target" name="Target" fill="#334155" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="produced" name="Produced" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="downtimeRate" name="Downtime %" stroke="#f59e0b" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-muted">No machine chart data available.</p>
            )}
          </div>

          <div className="industrial-card p-5">
            <h2 className="font-bold text-text-main mb-3 flex items-center gap-2">
              <Target size={16} className="text-primary" />
              All Machine Report Map
            </h2>
            <div className="space-y-2">
              {topMachines.length === 0 && <p className="text-sm text-text-muted">No machine records found.</p>}
              {topMachines.map((row) => (
                <div
                  key={row.machineId}
                  className="rounded-lg border border-border bg-bg-dark/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-main truncate">
                        {row.stationNo} | {row.machineName}
                      </p>
                      <p className="text-xs text-text-muted">{row.lineName}</p>
                    </div>
                    <div className="flex gap-2 text-xs font-semibold">
                      <span className="rounded-md bg-primary/20 px-2 py-1 text-primary">Target {row.targetQty}</span>
                      <span className="rounded-md bg-accent/20 px-2 py-1 text-accent">Prod {row.producedQty}</span>
                      <span className="rounded-md bg-warning/20 px-2 py-1 text-warning">Down {row.downtimeEvents}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-md border border-border bg-bg-card/70 px-2 py-1">
                      <p className="text-text-muted">Achievement</p>
                      <p className="font-semibold text-primary">{row.achievementPct}%</p>
                    </div>
                    <div className="rounded-md border border-border bg-bg-card/70 px-2 py-1">
                      <p className="text-text-muted">Accuracy</p>
                      <p className="font-semibold text-emerald-300">{row.accuracy}%</p>
                    </div>
                    <div className="rounded-md border border-border bg-bg-card/70 px-2 py-1">
                      <p className="text-text-muted">Downtime %</p>
                      <p className="font-semibold text-warning">{row.downtimeRate}%</p>
                    </div>
                    <div className="rounded-md border border-border bg-bg-card/70 px-2 py-1">
                      <p className="text-text-muted">Target Gap</p>
                      <p className="font-semibold text-danger">{row.targetGap}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="industrial-card p-5">
            <h2 className="font-bold text-text-main mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              Station Summary Cards
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {stationCards.map((row) => (
                <div key={row.stationNo} className="rounded-lg border border-border bg-bg-dark/70 p-3">
                  <p className="text-sm font-bold text-text-main">{row.stationNo}</p>
                  <p className="text-[11px] text-text-muted mt-1">{(row.lineNames || []).join(", ") || "-"}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <span className="rounded-md bg-primary/20 px-2 py-1 text-primary">Target {row.targetQty || 0}</span>
                    <span className="rounded-md bg-accent/20 px-2 py-1 text-accent">Prod {row.processedCount || 0}</span>
                    <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-emerald-300">Acc {row.accuracy || 0}%</span>
                    <span className="rounded-md bg-warning/20 px-2 py-1 text-warning">Down {row.downtimeRate || 0}%</span>
                  </div>
                </div>
              ))}
              {stationCards.length === 0 && <p className="text-sm text-text-muted">No station report rows available.</p>}
            </div>
          </div>

          <div className="industrial-card p-5">
            <h2 className="font-bold text-text-main mb-3">Recent Interlock and Downtime Signals</h2>
            <div className="space-y-2 max-h-[340px] overflow-y-auto">
              {incidents.length === 0 && <p className="text-sm text-text-muted">No interlock incidents in this window.</p>}
              {incidents.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-bg-dark/70 p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-text-main">{row.part_id || row.partId || "Unknown part"}</p>
                    <p className="text-xs text-text-muted">{row.interlock_reason || "No reason"} </p>
                  </div>
                  <p className="text-xs text-text-muted">{formatDateTime(row.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterSettingsDashboard;
