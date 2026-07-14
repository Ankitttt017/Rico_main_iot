import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import AppLayout from "../../../components/common/AppLayout";
import { getPlcLatestReadings } from "../../../services/api";
import { SOCKET_URL } from "../../../services/endpoints";
import { DEFAULT_MACHINES, MACHINE_NAMES, PLC_LATEST_POLL_MS, REGISTER_GROUPS, getMachineKey, mergeMachineList, sortMachinesBySeries } from "../constants";
import PlcMonitorStyles from "../components/PlcMonitorStyles";
import PlcReportModal from "../components/PlcReportModal";
import { MetricTile, STATUS_CFG, ValueCard } from "../components/PlcWidgets";
import {
  buildShotDateFromRow,
  buildShotDateTimeFromRow,
  buildShotTimeFromRow,
  formatDateOnly,
  getDisplayLabel,
  getMachineKindFromRow,
  getNumericShotNumber,
  getReadingValue,
  getReadingShotNumber,
  getRowTimestamp,
  isHiddenDbField,
  rowToReadings,
} from "../utils/plcFormatters";

function hasReadableValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "" && String(value).trim() !== "-";
}

function firstReadableValue(...values) {
  return values.find((value) => hasReadableValue(value)) || "";
}

function isLikelyScanData(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^[A-Z]\d$/i.test(text)) return false;
  return text.length >= 4;
}

function isScanField(name = "") {
  return ["part_qr_code", "scan_data", "part_name", "part_scan_data", "Part Scan Data", "SCAN DATA", "Scan Data"].includes(String(name));
}

function toValidDate(value) {
  if (!value) return null;
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
    ? value.replace(" ", "T")
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasReadingData(readings = {}) {
  return Object.values(readings).some((item) => hasReadableValue(item?.value));
}

const CYCLE_RUNNING_STALE_MS = Math.max(PLC_LATEST_POLL_MS * 2, 10000);

function normalizeRegisterName(item = {}) {
  if (typeof item === "string") return item.trim();
  return String(item.name || item.parameter || item.parameter_name || item.register || item.label || "").trim();
}

function normalizeMonitorFieldName(name = "") {
  return String(name || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeRegisterLabel(item = {}) {
  const name = normalizeRegisterName(item);
  if (!item || typeof item !== "object") return getDisplayLabel(name);
  return item.label || item.display_name || item.displayName || item.title || getDisplayLabel(name);
}

function normalizeRegisterUnit(item = {}) {
  if (!item || typeof item !== "object") return "";
  return String(item.unit || item.units || "").trim();
}

function normalizeRegisterGroup(item = {}) {
  if (!item || typeof item !== "object") return "";
  return String(item.group || item.category || item.section || item.tab || "").trim();
}

function getMachineRegisterConfig(machine = {}) {
  if (Array.isArray(machine.registerConfig)) return machine.registerConfig;
  if (Array.isArray(machine.register_config)) return machine.register_config;
  return [];
}

function mergeMachineContext(machine = {}, config = {}) {
  const registerConfig = getMachineRegisterConfig(machine).length
    ? getMachineRegisterConfig(machine)
    : getMachineRegisterConfig(config);
  return {
    ...config,
    ...machine,
    registerConfig,
    register_config: registerConfig,
  };
}

function inferMachineKind(machine = {}, readings = {}) {
  const explicitKind = machine.kind || machine.machine_type || machine.machineType;
  if (explicitKind) return explicitKind;
  const machineText = [
    machine.name,
    machine.machine_name,
    machine.machine_key,
    machine.key,
    machine.ip,
  ].join(" ").toLowerCase();
  const registerText = Array.isArray(machine.registerConfig)
    ? machine.registerConfig.map((item) => String(item?.name || item?.parameter || "").toLowerCase()).join(" ")
    : "";
  if (
    machineText.includes("gauge") ||
    machineText.includes("guage") ||
    registerText.includes("part scan") ||
    registerText.includes("gauge status") ||
    readings.part_scan_data ||
    readings["Part Scan Data"] ||
    readings.gauge_status ||
    readings["Gauge Status"] ||
    readings["Gauge  Status"]
  ) {
    return "gauge";
  }
  if (machineText.includes("leak") || readings.part_qr_code || readings.body_leak_value) return "leaktest";
  return explicitKind || "ube";
}

function machineAccentColor(machineKind = "machine", index = 0) {
  if (machineKind === "gauge") return "#10b981";
  if (machineKind === "leaktest") return "#14b8a6";
  return ["#22d3ee", "#f97316", "#a78bfa", "#34d399", "#f472b6", "#60a5fa"][index % 6];
}

function buildConfiguredGroups(machineKind, machine = {}, readings = {}) {
  const configured = getMachineRegisterConfig(machine)
    .filter((item) => !item || typeof item !== "object" || (item.enabled !== false && item.show_on_monitor !== false))
    .map((item) => ({
      name: normalizeRegisterName(item),
      label: normalizeRegisterLabel(item),
      unit: normalizeRegisterUnit(item),
      group: normalizeRegisterGroup(item),
    }))
    .filter((item) => item.name && !isHiddenDbField(item.name));

  const source = configured.length
    ? configured
    : Object.keys(readings)
      .filter((name) => name && !isHiddenDbField(name))
      .filter((name) => hasReadableValue(getReadingValue(readings, name)))
      .map((name) => ({
        name,
        label: getDisplayLabel(name),
        unit: readings[name]?.unit || "",
        group: "",
      }));

  if (!source.length) return [];

  const byGroup = new Map();
  source.forEach((item) => {
    const label = item.group || "Configured Parameters";
    if (!byGroup.has(label)) byGroup.set(label, []);
    byGroup.get(label).push(item);
  });

  return Array.from(byGroup.entries()).map(([label, keys], index) => ({
    id: `${machineKind || "machine"}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "configured"}`,
    label,
    kind: machineKind || "machine",
    icon: machineKind === "gauge" ? "GA" : machineKind === "leaktest" ? "LT" : `P${index + 1}`,
    color: machineAccentColor(machineKind, index),
    keys,
  }));
}

function PLCDashboard() {
  const [searchParams] = useSearchParams();
  const [theme] = useState("light");
  const [plcConnected, setPlcConnected] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [cycleStatus, setCycleStatus] = useState("idle");
  const [lastTimestamp, setLastTimestamp] = useState(null);
  const [partName, setPartName] = useState("");
  const [shotTime, setShotTime] = useState("");
  const [readings, setReadings] = useState({});
  const [cycleHistory, setCycleHistory] = useState([]);
  const [cycleCount, setCycleCount] = useState(0);
  const [sparklines, setSparklines] = useState({});
  const [activeGroup, setActiveGroup] = useState(null);
  const [machines, setMachines] = useState(DEFAULT_MACHINES);
  const [machineStatuses, setMachineStatuses] = useState({});
  const [monitoringRunning, setMonitoringRunning] = useState(true);
  const [plcConfig, setPlcConfig] = useState({});
  const [draftConfig, setDraftConfig] = useState({ ip: "", port: "" });
  const [configMessage, setConfigMessage] = useState("");
  const [readingsByIp, setReadingsByIp] = useState({});
  const [historyByIp, setHistoryByIp] = useState({});
  const [sparkByIp, setSparkByIp] = useState({});
  const [metaByIp, setMetaByIp] = useState({});
  const socketRef = useRef(null);
  const machinesRef = useRef(DEFAULT_MACHINES);
  const selectedKeyRef = useRef(plcConfig.key || plcConfig.ip);
  const selectedSnapshotRef = useRef({ shotNumber: null, observedAtMs: 0, source: "" });
  const disconnectTimerRef = useRef(null);
  const lastSocketDataAtRef = useRef(0);
  const lastSelectedDataAtRef = useRef(0);
  const lastDbRenderSignatureRef = useRef("");
  const readingsHasDataRef = useRef(false);

  useEffect(() => {
    readingsHasDataRef.current = hasReadingData(readings);
  }, [readings]);

  useEffect(() => {
    const timer = setInterval(() => {
      const hasFreshSelectedData =
        lastSelectedDataAtRef.current > 0 &&
        Date.now() - lastSelectedDataAtRef.current <= CYCLE_RUNNING_STALE_MS;
      if (!hasFreshSelectedData) {
        setCycleStatus(prev => prev === "complete" ? prev : "idle");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  const rememberSelectedSnapshot = useCallback((readingsSnapshot = {}, { observedAt, source } = {}) => {
    const shotNumber = getReadingShotNumber(readingsSnapshot);
    if (shotNumber === null) return;
    const observedAtMs = observedAt ? new Date(observedAt).getTime() : Date.now();
    selectedSnapshotRef.current = {
      shotNumber,
      observedAtMs: Number.isNaN(observedAtMs) ? Date.now() : observedAtMs,
      source: source || selectedSnapshotRef.current.source,
    };
  }, []);

  const isOlderDbSnapshotForSelectedMachine = useCallback((row = {}) => {
    const dbShotNumber = getNumericShotNumber(row.shot_number);
    const current = selectedSnapshotRef.current;
    if (dbShotNumber === null || current.shotNumber === null) return false;
    if (dbShotNumber >= current.shotNumber) return false;

    const liveAgeMs = Date.now() - (current.observedAtMs || 0);
    return current.source === "live" && liveAgeMs < Math.max(PLC_LATEST_POLL_MS * 3, 10000);
  }, []);

  useEffect(() => {
    selectedKeyRef.current = plcConfig.key || plcConfig.ip;
  }, [plcConfig.ip, plcConfig.key]);

  const pushSpark = useCallback((name, value) => {
    setSparklines(prev => {
      const arr = [...(prev[name] || []), value].slice(-20);
      return { ...prev, [name]: arr };
    });
  }, []);

  const applyReadings = useCallback((newReadings, timestamp, cycleTime) => {
    setReadings(newReadings);
    setLastTimestamp(toValidDate(timestamp));
    setCycleCount(c => c + 1);
    setCycleHistory(prev => [
      { id: Date.now(), timestamp: toValidDate(timestamp), cycleTime },
      ...prev,
    ].slice(0, 100));

    Object.entries(newReadings).forEach(([k, v]) => {
      if (v?.value !== undefined && v.value !== null) pushSpark(k, v.value);
    });
  }, [pushSpark]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const syncLatestDbSnapshot = async () => {
      if (
        readingsHasDataRef.current &&
        Date.now() - lastSocketDataAtRef.current < Math.max(PLC_LATEST_POLL_MS * 2, 3000)
      ) {
        return;
      }
      if (inFlight) return;
      inFlight = true;

      try {
        const response = await getPlcLatestReadings();
        if (cancelled) return;

        const rows = Array.isArray(response.data?.data)
          ? response.data.data.filter((item) => item.has_data)
          : [];
        if (!rows.length) return;

        const nextReadingsByKey = {};
        const nextMetaByKey = {};
        const nextHistoryByKey = {};
        const nextStatusByKey = {};
        const selectedAtPoll = selectedKeyRef.current || plcConfig.key || plcConfig.ip;

        rows.forEach((item) => {
          const key = item.machine_key || item.plc_ip;
          const machine = machines.find((entry) => getMachineKey(entry) === key || entry.ip === item.plc_ip);
          const itemKind = machine?.kind || getMachineKindFromRow(item);
          const itemTimestamp = getRowTimestamp(item);
          const itemReadings = rowToReadings(item, itemKind);
          const itemHistory = {
            id: `db-${item.id || itemTimestamp}`,
            timestamp: toValidDate(itemTimestamp),
            cycleTime: item.cycle_time ?? null,
          };

          nextReadingsByKey[key] = itemReadings;
          if (item.plc_ip) nextReadingsByKey[item.plc_ip] = itemReadings;
          nextMetaByKey[key] = {
            timestamp: itemTimestamp,
            cycleTime: item.cycle_time ?? null,
            partName: firstReadableValue(item.part_name, item.part_qr_code, item.scan_data),
            shotTime: buildShotTimeFromRow(item),
          };
          if (item.plc_ip) nextMetaByKey[item.plc_ip] = nextMetaByKey[key];
          nextHistoryByKey[key] = [itemHistory];
          if (item.plc_ip) nextHistoryByKey[item.plc_ip] = [itemHistory];
          nextStatusByKey[key] = {
            ...(machine || {}),
            key,
            machine_key: key,
            ip: item.plc_ip || machine?.ip,
            port: Number(item.plc_port || machine?.port || 5002),
            name: item.machine_name || machine?.name,
            kind: itemKind,
            connected: Boolean(item.is_online),
            hasRecentData: true,
            lastCycleAt: itemTimestamp,
            lastShotNumber: item.shot_number ?? null,
            partName: firstReadableValue(item.part_name, item.part_qr_code, item.scan_data),
            cycleTime: item.cycle_time ?? null,
          };
          if (item.plc_ip) nextStatusByKey[item.plc_ip] = nextStatusByKey[key];
        });

        setReadingsByIp(prev => ({ ...prev, ...nextReadingsByKey }));
        setMetaByIp(prev => ({ ...prev, ...nextMetaByKey }));
        setHistoryByIp(prev => ({ ...prev, ...nextHistoryByKey }));
        setMachineStatuses(prev => ({ ...prev, ...nextStatusByKey }));

        const selectedRow = rows.find((item) =>
          (item.machine_key || item.plc_ip) === selectedAtPoll ||
          item.plc_ip === selectedAtPoll
        );
        if (!selectedRow) return;

        const rowKey = selectedRow.machine_key || selectedRow.plc_ip;
        const rowMachine = machines.find((machine) => getMachineKey(machine) === rowKey || machine.ip === selectedRow.plc_ip);
        const nextReadings = rowToReadings(selectedRow, rowMachine?.kind || getMachineKindFromRow(selectedRow));
        const timestamp = getRowTimestamp(selectedRow);
        const cycleTime = selectedRow.cycle_time ?? null;
        const historyItem = { id: `db-${selectedRow.id || timestamp}`, timestamp: toValidDate(timestamp), cycleTime };

        if (isOlderDbSnapshotForSelectedMachine(selectedRow)) return;

        const selectedSignature = [
          rowKey,
          selectedRow.id || "",
          timestamp || "",
          selectedRow.shot_number ?? "",
          selectedRow.cycle_time ?? "",
          selectedRow.part_name || selectedRow.part_qr_code || selectedRow.scan_data || "",
        ].join("|");
        if (lastDbRenderSignatureRef.current === selectedSignature) return;
        lastDbRenderSignatureRef.current = selectedSignature;

        setReadings(nextReadings);
        rememberSelectedSnapshot(nextReadings, { observedAt: timestamp, source: "db" });
        setLastTimestamp(toValidDate(timestamp));
        setConfigMessage("");
        setPartName(prev => firstReadableValue(selectedRow.part_name, selectedRow.part_qr_code, selectedRow.scan_data, prev));
        setShotTime(buildShotTimeFromRow(selectedRow));
        setCycleHistory(prev => {
          if (prev[0]?.id === historyItem.id) return prev;
          return [historyItem, ...prev].slice(0, 100);
        });
        setCycleCount(prev => Math.max(prev, 1));

        Object.entries(nextReadings).forEach(([name, item]) => {
          if (item?.value !== undefined && item.value !== null) pushSpark(name, item.value);
        });
      } catch {
        // Keep the dashboard on the last good live/DB snapshot; the next poll/socket event will refresh it.
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(syncLatestDbSnapshot, PLC_LATEST_POLL_MS);
    syncLatestDbSnapshot();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOlderDbSnapshotForSelectedMachine, machines, plcConfig.ip, plcConfig.key, pushSpark, rememberSelectedSnapshot]);

  const loadMachineSnapshot = useCallback((machineOrKey) => {
    const lookupKeys = typeof machineOrKey === "object"
      ? [getMachineKey(machineOrKey), machineOrKey.ip].filter(Boolean)
      : [machineOrKey].filter(Boolean);
    const snapshotKey = lookupKeys.find((key) => readingsByIp[key]) || lookupKeys[0];
    const nextReadings = snapshotKey ? readingsByIp[snapshotKey] || {} : {};
    const nextMeta = snapshotKey ? metaByIp[snapshotKey] || {} : {};
    const nextHistory = snapshotKey ? historyByIp[snapshotKey] || [] : [];
    const nextSparks = snapshotKey ? sparkByIp[snapshotKey] || {} : {};
    const hasSnapshot = hasReadingData(nextReadings) || Boolean(nextMeta.timestamp) || nextHistory.length || Object.keys(nextSparks).length;
    if (!hasSnapshot) return;

    setReadings(prev => prev === nextReadings ? prev : nextReadings);
    setCycleHistory(prev => prev === nextHistory ? prev : nextHistory);
    setCycleCount(prev => prev === nextHistory.length ? prev : nextHistory.length);
    setSparklines(prev => prev === nextSparks ? prev : nextSparks);
    const nextTimestamp = nextMeta.timestamp ? toValidDate(nextMeta.timestamp) : null;
    setLastTimestamp(prev => String(prev || "") === String(nextTimestamp || "") ? prev : nextTimestamp);
    const nextPartName = firstReadableValue(
      nextMeta.partName,
      nextReadings.part_name?.value,
      nextReadings.part_qr_code?.value,
      nextReadings.scan_data?.value
    );
    setPartName(prev => prev === nextPartName ? prev : nextPartName);
    setShotTime(prev => prev === (nextMeta.shotTime || "") ? prev : (nextMeta.shotTime || ""));
    lastSelectedDataAtRef.current = 0;
    setCycleStatus("idle");
  }, [historyByIp, metaByIp, readingsByIp, sparkByIp]);

  useEffect(() => {
    if (!plcConfig.key && !plcConfig.ip) return;
    if (hasReadingData(readings)) return;
    loadMachineSnapshot(plcConfig.key || plcConfig.ip);
  }, [loadMachineSnapshot, plcConfig.ip, plcConfig.key, readings]);

  const normalizeConfig = useCallback((config = {}) => {
    const key = config.key || config.machine_key || config.ip;
    const localMachine = machinesRef.current.find((machine) => getMachineKey(machine) === key || machine.ip === config.ip);
    const context = mergeMachineContext(localMachine || {}, config);
    const machineKey = localMachine ? getMachineKey(localMachine) : key;
    return {
      key: machineKey,
      ip: context.ip || config.ip,
      port: Number(context.port || config.port || 5002),
      kind: inferMachineKind(context),
      registerConfig: getMachineRegisterConfig(context),
    };
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      setSocketConnected(prev => prev || true);
    });

    socket.on("disconnect", () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        setSocketConnected(false);
        setPlcConnected(false);
      }, 1800);
    });

    socket.on("plc_status", ({ connected }) => {
      setPlcConnected(prev => prev === connected ? prev : connected);
    });

    socket.on("plc_config", (config) => {
      const nextConfig = normalizeConfig(config);
      if (nextConfig.key && selectedKeyRef.current && nextConfig.key !== selectedKeyRef.current) {
        return;
      }

      setPlcConfig(prev =>
        prev.key === nextConfig.key && prev.ip === nextConfig.ip && Number(prev.port || 0) === Number(nextConfig.port || 0) && prev.kind === nextConfig.kind
          ? prev
          : nextConfig
      );
      setDraftConfig(prev => prev.ip === nextConfig.ip && prev.port === String(nextConfig.port) ? prev : { ip: nextConfig.ip, port: String(nextConfig.port) });
    });

    socket.on("machines", (list = []) => {
      const nextMachines = list.length ? mergeMachineList(list) : DEFAULT_MACHINES;
      setMachines(prev => {
        const prevSignature = prev.map((machine) => `${getMachineKey(machine)}:${machine.ip}:${machine.name}:${machine.kind}`).join("|");
        const nextSignature = nextMachines.map((machine) => `${getMachineKey(machine)}:${machine.ip}:${machine.name}:${machine.kind}`).join("|");
        return prevSignature === nextSignature ? prev : nextMachines;
      });
      if (!selectedKeyRef.current && nextMachines[0]) {
        const first = nextMachines[0];
        const nextConfig = {
          key: getMachineKey(first),
          ip: first.ip,
          port: Number(first.port || 5002),
          kind: inferMachineKind(first),
          registerConfig: getMachineRegisterConfig(first),
        };
        selectedKeyRef.current = nextConfig.key;
        setPlcConfig(prev =>
          prev.key === nextConfig.key && prev.ip === nextConfig.ip && Number(prev.port || 0) === Number(nextConfig.port || 0) && prev.kind === nextConfig.kind
            ? prev
            : nextConfig
        );
        setDraftConfig(prev => prev.ip === nextConfig.ip && prev.port === String(nextConfig.port) ? prev : { ip: nextConfig.ip, port: String(nextConfig.port) });
      }
    });

    socket.on("monitoring_status", ({ running }) => {
      setMonitoringRunning(Boolean(running));
    });

    socket.on("machines_status", (list = []) => {
      setMachineStatuses(prev => {
        const next = { ...prev };
        list.forEach((item) => {
          const key = getMachineKey(item);
          next[key] = { ...(prev[key] || {}), ...item };
          if (item.ip) next[item.ip] = { ...(prev[item.ip] || {}), ...item };
        });
        return next;
      });
    });

    socket.on("plc_data", ({ timestamp, observedAt, liveOnly = false, cycleTime, readings: r = {}, config, machineType, partName: nextPartName, shotTime: nextShotTime }) => {
      lastSocketDataAtRef.current = Date.now();
      const key = config?.key || config?.ip || selectedKeyRef.current;
      const ip = config?.ip || key;
      const port = Number(config?.port || 5002);
      const eventTimestamp = r?.cycle_end_time?.value || r?.shot_datetime?.value || timestamp || null;
      const observedTimestamp = observedAt || new Date().toISOString();
      const eventPartName = firstReadableValue(r?.part_name?.value, r?.part_qr_code?.value, r?.scan_data?.value, nextPartName);

      const packetHasData = hasReadingData(r);
      setReadingsByIp(prev => packetHasData ? { ...prev, [key]: r, [ip]: r } : prev);
      setMetaByIp(prev => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          timestamp: liveOnly ? prev[key]?.timestamp || eventTimestamp : eventTimestamp,
          observedAt: observedTimestamp,
          cycleTime,
          partName: eventPartName || prev[key]?.partName || "",
          shotTime: nextShotTime,
        },
        [ip]: {
          ...(prev[ip] || {}),
          timestamp: liveOnly ? prev[ip]?.timestamp || eventTimestamp : eventTimestamp,
          observedAt: observedTimestamp,
          cycleTime,
          partName: eventPartName || prev[ip]?.partName || "",
          shotTime: nextShotTime,
        },
      }));
      if (!liveOnly) {
        setSparkByIp(prev => {
          const next = { ...(prev[key] || {}) };
          Object.entries(r).forEach(([name, item]) => {
            if (item?.value !== undefined && item.value !== null) {
              next[name] = [...(next[name] || []), item.value].slice(-20);
            }
          });
          return { ...prev, [key]: next, [ip]: next };
        });
      }

      if (selectedKeyRef.current !== key && selectedKeyRef.current !== ip) return;

      setPlcConfig(prev => {
        const context = mergeMachineContext(
          machinesRef.current.find((machine) => getMachineKey(machine) === key || machine.ip === ip) || {},
          { ...prev, ...config, key, ip, port, kind: config?.kind || machineType }
        );
        const nextConfig = {
          key,
          ip,
          port,
          kind: inferMachineKind(context, r),
          registerConfig: getMachineRegisterConfig(context),
        };
        return prev.key === nextConfig.key &&
          prev.ip === nextConfig.ip &&
          Number(prev.port || 0) === Number(nextConfig.port || 0) &&
          prev.kind === nextConfig.kind &&
          getMachineRegisterConfig(prev).length === nextConfig.registerConfig.length
          ? prev
          : nextConfig;
      });
      setDraftConfig(prev => prev.ip === ip && prev.port === String(port) ? prev : { ip, port: String(port) });
      if (packetHasData) {
        lastSelectedDataAtRef.current = Date.now();
        setReadings(r);
        setCycleStatus("running");
        rememberSelectedSnapshot(r, { observedAt: observedTimestamp, source: "live" });
      }
      setLastTimestamp(toValidDate(eventTimestamp) || toValidDate(observedTimestamp));
      setConfigMessage("");
      setPartName(prev => eventPartName || prev);
      setShotTime(nextShotTime || buildShotTimeFromRow(Object.fromEntries(Object.entries(r).map(([name, item]) => [name, item?.value ?? null]))) || "");
      if (!liveOnly) {
        Object.entries(r).forEach(([name, item]) => {
          if (item?.value !== undefined && item.value !== null) pushSpark(name, item.value);
        });
      }
    });

    socket.on("cycle_complete", ({ timestamp, cycleTime, readings: r, config, machineType, partName: nextPartName, shotTime: nextShotTime }) => {
      lastSocketDataAtRef.current = Date.now();
      const key = config?.key || config?.ip || selectedKeyRef.current;
      const ip = config?.ip || key;
      const port = Number(config?.port || 5002);
      const eventTimestamp = r?.cycle_end_time?.value || r?.shot_datetime?.value || timestamp || null;
      const eventPartName = firstReadableValue(r?.part_name?.value, r?.part_qr_code?.value, r?.scan_data?.value, nextPartName);
      const historyItem = { id: `${key}-${eventTimestamp}`, timestamp: toValidDate(eventTimestamp), cycleTime };

      const packetHasData = hasReadingData(r);
      setReadingsByIp(prev => packetHasData ? { ...prev, [key]: r, [ip]: r } : prev);
      setMetaByIp(prev => ({
        ...prev,
        [key]: { timestamp: eventTimestamp, cycleTime, partName: eventPartName || prev[key]?.partName || "", shotTime: nextShotTime },
        [ip]: { timestamp: eventTimestamp, cycleTime, partName: eventPartName || prev[ip]?.partName || "", shotTime: nextShotTime },
      }));
      setHistoryByIp(prev => ({
        ...prev,
        [key]: [historyItem, ...(prev[key] || [])].slice(0, 100),
        [ip]: [historyItem, ...(prev[ip] || [])].slice(0, 100),
      }));
      setSparkByIp(prev => {
        const next = { ...(prev[key] || {}) };
        Object.entries(r).forEach(([k, v]) => {
          if (v?.value !== undefined && v.value !== null) {
            next[k] = [...(next[k] || []), v.value].slice(-20);
          }
        });
        return { ...prev, [key]: next, [ip]: next };
      });

      if (selectedKeyRef.current !== key && selectedKeyRef.current !== ip) return;

      selectedKeyRef.current = key;
      setPlcConfig(prev => {
        const context = mergeMachineContext(
          machinesRef.current.find((machine) => getMachineKey(machine) === key || machine.ip === ip) || {},
          { ...prev, ...config, key, ip, port, kind: config?.kind || machineType }
        );
        const nextConfig = {
          key,
          ip,
          port,
          kind: inferMachineKind(context, r),
          registerConfig: getMachineRegisterConfig(context),
        };
        return prev.key === nextConfig.key &&
          prev.ip === nextConfig.ip &&
          Number(prev.port || 0) === Number(nextConfig.port || 0) &&
          prev.kind === nextConfig.kind &&
          getMachineRegisterConfig(prev).length === nextConfig.registerConfig.length
          ? prev
          : nextConfig;
      });
      setDraftConfig(prev => prev.ip === ip && prev.port === String(port) ? prev : { ip, port: String(port) });
      setCycleStatus("complete");
      if (packetHasData) {
        lastSelectedDataAtRef.current = Date.now();
        setReadings(r);
        rememberSelectedSnapshot(r, { observedAt: eventTimestamp, source: "live" });
      }
      setLastTimestamp(toValidDate(eventTimestamp));
      setConfigMessage("");
      setPartName(prev => eventPartName || prev);
      setShotTime(nextShotTime || buildShotTimeFromRow(Object.fromEntries(Object.entries(r).map(([name, item]) => [name, item?.value ?? null]))) || "");
      setCycleHistory(prev => [historyItem, ...prev].slice(0, 100));
      setCycleCount(c => c + 1);
      Object.entries(r).forEach(([k, v]) => {
        if (v?.value !== undefined && v.value !== null) pushSpark(k, v.value);
      });
      setConfigMessage(`${machines.find((machine) => getMachineKey(machine) === key)?.name || MACHINE_NAMES[ip] || ip} live data received.`);
      setTimeout(() => {
        const hasFreshSelectedData =
          lastSelectedDataAtRef.current > 0 &&
          Date.now() - lastSelectedDataAtRef.current <= CYCLE_RUNNING_STALE_MS;
        setCycleStatus(hasFreshSelectedData ? "running" : "idle");
      }, 3000);
    });

    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      socket.disconnect();
    };
  }, [normalizeConfig, pushSpark, rememberSelectedSnapshot]);

  const st = STATUS_CFG[cycleStatus] || STATUS_CFG.idle;
  const currentReadingRow = Object.fromEntries(Object.entries(readings).map(([name, item]) => [name, item?.value ?? null]));
  const shotDate = readings.shot_date?.value || buildShotDateFromRow(currentReadingRow);
  const plcShotTime = readings.shot_time?.value || buildShotTimeFromRow(currentReadingRow) || shotTime;
  const selectedMachineKey = plcConfig.key || plcConfig.ip;
  const selectedMachine = machines.find((machine) => getMachineKey(machine) === selectedMachineKey || machine.ip === plcConfig.ip);
  const selectedMachineContext = mergeMachineContext(selectedMachine || {}, plcConfig);
  const machineName = selectedMachineContext.name || MACHINE_NAMES[plcConfig.ip] || "Unknown Machine";
  const selectedMachineKind = inferMachineKind(selectedMachineContext, readings);
  const isLeakTestMachine = selectedMachineKind === "leaktest";
  const isUbeMachine = selectedMachineKind === "ube";
  const selectedMachineStatus = machineStatuses[selectedMachineKey] || machineStatuses[plcConfig.ip] || {};
  const selectedMachineOnline = Boolean(selectedMachineStatus.connected);
  const selectedPlcConnected = Boolean(selectedMachineStatus.connected || selectedMachineStatus.hasRecentData || readings.plc_ip?.value);
  const displayPartName = firstReadableValue(
    getReadingValue(readings, "part_scan_data"),
    getReadingValue(readings, "Part Scan Data"),
    readings.part_name?.value,
    readings.part_qr_code?.value,
    readings.scan_data?.value,
    metaByIp[selectedMachineKey]?.partName,
    metaByIp[plcConfig.ip]?.partName,
    selectedMachineStatus.partName,
    partName
  );
  const displayScanData = firstReadableValue(
    ...[
      getReadingValue(readings, "part_scan_data"),
      getReadingValue(readings, "Part Scan Data"),
      readings.part_qr_code?.value,
      readings.scan_data?.value,
      readings.part_name?.value,
      metaByIp[selectedMachineKey]?.partName,
      metaByIp[plcConfig.ip]?.partName,
      selectedMachineStatus.partName,
      partName,
    ].filter(isLikelyScanData)
  );
  const compactCardHiddenFields = new Set([
    "machine_name",
    "plc_ip",
    "shot_datetime",
    "shot_year",
    "shot_month",
    "shot_day",
    "shot_hour",
    "shot_minute",
    "shot_second",
    "cycle_start",
    "cycle_complete",
    "Cycle Start",
    "Cycle Complete",
  ]);
  const leakTestCardHiddenFields = new Set([
    "cycle_start",
    "cycle_end",
    "cycle_complete",
    "cycle_start_time",
    "cycle_end_time",
  ]);
  const isHiddenCardField = (name) => {
    if (compactCardHiddenFields.has(name)) return true;
    return isLeakTestMachine && leakTestCardHiddenFields.has(normalizeMonitorFieldName(name));
  };
  const configuredGroups = buildConfiguredGroups(selectedMachineKind, selectedMachineContext, readings);
  const legacyUbeGroups = REGISTER_GROUPS
    .filter((group) => group.kind === "ube")
    .filter((group) => {
      if (group.id !== "machine_bits") return true;
      return group.keys.some(({ name }) => {
        const value = getReadingValue(readings, name);
        if (!hasReadableValue(value)) return false;
        if (name === "cycle_end" && Number(value) === 0) return false;
        return true;
      });
    });
  const availableGroups = isUbeMachine ? legacyUbeGroups : configuredGroups;
  const validActiveGroup = availableGroups.some((group) => group.id === activeGroup) ? activeGroup : null;
  const baseDisplayGroups = validActiveGroup
    ? availableGroups.filter(g => g.id === validActiveGroup)
    : availableGroups;
  const displayGroups = baseDisplayGroups
    .map((group) => (
      group.id === "machine_bits"
        ? {
            ...group,
            keys: group.keys.filter(({ name }) => {
              const value = getReadingValue(readings, name);
              if (!hasReadableValue(value)) return false;
              if (name === "cycle_end" && Number(value) === 0) return false;
              return true;
            }),
          }
        : group
    ))
    .filter((group) => group.keys.length > 0);
  const cardGroups = displayGroups
    .map((group) => ({
      ...group,
      keys: group.keys.filter(({ name }) => !isHiddenCardField(name)),
    }))
    .filter((group) => group.keys.length > 0);
  const configuredOverviewItems = (availableGroups[0]?.keys || [])
    .filter(({ name }) => !isHiddenCardField(name))
    .slice(0, 5)
    .map(({ name, label, unit }) => ({
      name,
      label,
      unit,
      value: isLeakTestMachine && isScanField(name)
        ? displayScanData || "-"
        : name === "shot_time"
          ? plcShotTime
          : getReadingValue(readings, name),
    }));
  const ubeOverviewItems = [
    { name: "part_name", label: "Part Name", value: displayPartName || "-", tone: "cyan" },
    { name: "shot_number", label: "Shot Number", value: getReadingValue(readings, "shot_number"), tone: "cyan" },
    { name: "cycle_time", label: "Cycle Time", value: getReadingValue(readings, "cycle_time"), unit: "sec", tone: "green" },
    { name: "shot_fwd_time", label: "Shot Forward Time", value: getReadingValue(readings, "shot_fwd_time"), unit: "sec", tone: "slate" },
    { name: "shot_date", label: "Shot Date", value: shotDate ? formatDateOnly(shotDate) : null, tone: "slate" },
    { name: "shot_time", label: "Shot Time", value: plcShotTime || null, tone: "slate" },
  ];
  const overviewItems = isUbeMachine ? ubeOverviewItems : configuredOverviewItems;
  const reportReading = {
    ...currentReadingRow,
    machine_name: readings.machine_name?.value || machineName,
    machine_key: readings.machine_key?.value || selectedMachineKey,
    kind: selectedMachineKind,
    plc_ip: readings.plc_ip?.value || readings.ip?.value || plcConfig.ip,
    plc_port: readings.plc_port?.value || plcConfig.port,
    part_name: displayPartName,
    shot_date: readings.shot_date?.value || shotDate,
    shot_time: readings.shot_time?.value || plcShotTime,
    shot_datetime: readings.shot_datetime?.value || buildShotDateTimeFromRow(currentReadingRow) || null,
    cycle_end_time: isLeakTestMachine ? readings.cycle_end_time?.value || lastTimestamp?.toISOString() : null,
    recorded_at: readings.shot_datetime?.value || buildShotDateTimeFromRow(currentReadingRow) || null,
  };

  const resetDashboardData = () => {
    lastSocketDataAtRef.current = 0;
    lastSelectedDataAtRef.current = 0;
    readingsHasDataRef.current = false;
    setCycleStatus("idle");
    setLastTimestamp(null);
    setPartName("");
    setShotTime("");
    setReadings({});
    setCycleHistory([]);
    setCycleCount(0);
    setSparklines({});
  };

  const selectMachine = (key) => {
    const machine = machines.find(item => getMachineKey(item) === key)
      || { key, ip: key, port: 5002 };
    const config = {
      key: getMachineKey(machine),
      ip: machine.ip,
      port: Number(machine.port || draftConfig.port || 5002),
      kind: inferMachineKind(machine),
      registerConfig: getMachineRegisterConfig(machine),
    };
    selectedKeyRef.current = config.key;
    setPlcConfig(config);
    setDraftConfig({ ip: config.ip, port: String(config.port) });
    resetDashboardData();
    setConfigMessage(`${machine.name || MACHINE_NAMES[config.ip] || "Machine"} selected.`);
    loadMachineSnapshot(machine);
    socketRef.current?.emit("update_plc_config", config);
  };

  const machineSearch = (searchParams.get("search") || "").trim().toLowerCase();
  const visibleMachines = useMemo(() => (
    sortMachinesBySeries(machineSearch
      ? machines.filter((machine) => {
        const key = getMachineKey(machine);
        const label = machine.name || MACHINE_NAMES[machine.ip] || machine.ip;
        return [key, label, machine.ip, machine.kind]
          .some((value) => String(value || "").toLowerCase().includes(machineSearch));
      })
      : machines)
  ), [machineSearch, machines]);

  useEffect(() => {
    if (!machineSearch || !visibleMachines.length) return;
    const firstMatch = visibleMachines[0];
    const firstKey = getMachineKey(firstMatch);
    if (firstKey && firstKey !== selectedKeyRef.current) selectMachine(firstKey);
  }, [machineSearch, visibleMachines]);

  return (
    <>
      <PlcMonitorStyles />

      <div className={`dash theme-${theme}`}>
        <div className="shell">
          <header className="header">
            <div>
              <div className="plant-tag">Production Monitor</div>
              <div className="header-title">
                <span className={`status-dot ${socketConnected ? "" : "off"}`} />
                {machineName} Live Production
              </div>
              <div className="header-sub">
                Real-time machine parameters and latest cycle status
              </div>
            </div>

            <div className="header-controls">
              <div className="plc-form">
                <label className="field">
                  <span>Machine</span>
                  <select value={selectedMachineKey || ""} onChange={(e) => selectMachine(e.target.value)}>
                    {!visibleMachines.length && <option value="">No machines configured</option>}
                    {visibleMachines.map(machine => {
                      const key = getMachineKey(machine);
                      const label = machine.name || MACHINE_NAMES[machine.ip] || machine.ip;
                      return (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <div className="config-line">
                Last update: {lastTimestamp ? lastTimestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "Waiting for cycle"}
                {selectedMachineStatus.error && <span>{selectedMachineStatus.error}</span>}
                {configMessage && <span>{configMessage}</span>}
              </div>
            </div>
          </header>

          <section className="overview">
            <div className={`process-state ${st.cls}`}>
              <div className="state-top">
                <div className="state-label">Machine State</div>
                <span className="status-chip">{st.label}</span>
              </div>
              <div className="state-value">
                {selectedMachineOnline ? "ONLINE" : socketConnected ? "SERVER READY" : "OFFLINE"}
              </div>
              <div className="state-sub">
                {machineName} | {monitoringRunning ? "RUNNING" : "STOPPED"}
              </div>
            </div>

            {overviewItems.map(({ name, label, unit, value, tone }, index) => (
              <MetricTile
                key={name}
                label={label || getDisplayLabel(name)}
                value={value}
                unit={unit}
                tone={tone || (index === 0 ? "cyan" : index === 1 ? "green" : "slate")}
              />
            ))}
          </section>

          <section className="dashboard-content">
            <div className="content-main">
              <div className="view-bar">
                <div className="group-tabs">
                  <button
                    className={`tab ${validActiveGroup === null ? "active" : ""}`}
                    style={validActiveGroup === null ? { borderColor: "#e5edf7" } : {}}
                    onClick={() => setActiveGroup(null)}
                  >
                    ALL
                  </button>
                  {availableGroups.map(g => (
                    <button
                      key={g.id}
                      className={`tab ${validActiveGroup === g.id ? "active" : ""}`}
                      style={validActiveGroup === g.id ? { borderColor: g.color, color: g.color } : {}}
                      onClick={() => setActiveGroup(prev => prev === g.id ? null : g.id)}
                    >
                      {g.icon} / {g.label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {Object.keys(readings).length === 0 && (
                <div className="no-data">
                  <div className="no-data-title">Waiting for first production cycle</div>
                  <div className="no-data-text">
                    {selectedPlcConnected
                      ? "PLC is connected. Dashboard will update automatically after cycle completion."
                      : "Connecting to PLC server and waiting for live machine data."}
                  </div>
                </div>
              )}

              {Object.keys(readings).length > 0 && cardGroups.map(group => (
                  <section
                    key={group.id}
                    className="group-section"
                    style={{ "--group-color": group.color }}
                  >
                    <div className="group-header">
                      <span className="group-icon">{group.icon}</span>
                      <span className="group-label">{group.label}</span>
                      <div className="group-line" />
                      <span className="group-count">{group.keys.length} regs</span>
                    </div>

                    <div className="cards-grid">
                      {group.keys.map(({ name, unit, label }) => {
                        const value = isLeakTestMachine && isScanField(name)
                          ? displayScanData || "-"
                          : name === "shot_time"
                            ? plcShotTime
                            : getReadingValue(readings, name);
                        return (
                          <ValueCard
                            key={name}
                            name={name}
                            label={label}
                            unit={unit}
                            value={value}
                            history={sparklines[name]}
                            accentColor={group.color}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
            </div>
          </section>

        </div>
      </div>
    </>
  );
}

export default function PlcMonitorPage({ onLogout, currentUser }) {
  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser} hideFooter>
      <PLCDashboard />
    </AppLayout>
  );
}
