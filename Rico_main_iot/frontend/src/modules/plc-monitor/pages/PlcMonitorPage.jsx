import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import AppLayout from "../../../components/common/AppLayout";
import { getPlcLatestReadings } from "../../../services/api";
import { SOCKET_URL } from "../../../services/endpoints";
import { DEFAULT_MACHINES, MACHINE_NAMES, PLC_LATEST_POLL_MS, REGISTER_GROUPS, getMachineKey, mergeMachineList } from "../constants";
import PlcMonitorStyles from "../components/PlcMonitorStyles";
import PlcReportModal from "../components/PlcReportModal";
import { MachineStatusCard, MetricTile, ParameterTable, STATUS_CFG, ValueCard, formatValue } from "../components/PlcWidgets";
import { buildShotDateFromRow, buildShotTimeFromRow, formatDateOnly, formatDateTime, formatTimeOnly, getMachineKindFromRow, getNumericShotNumber, getReadingShotNumber, getRowTimestamp, rowToReadings } from "../utils/plcFormatters";

function hasReadableValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "" && String(value).trim() !== "-";
}

function PLCDashboard() {
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
  const [plcConfig, setPlcConfig] = useState({ key: "ube-850t-2", ip: "192.168.117.201", port: 5002,kind: "ube" });
  const [draftConfig, setDraftConfig] = useState({ ip: "192.168.117.201", port: "5002" });
  const [configMessage, setConfigMessage] = useState("");
  const [readingsByIp, setReadingsByIp] = useState({});
  const [historyByIp, setHistoryByIp] = useState({});
  const [sparkByIp, setSparkByIp] = useState({});
  const [metaByIp, setMetaByIp] = useState({});
  const socketRef = useRef(null);
  const selectedKeyRef = useRef(plcConfig.key || plcConfig.ip);
  const selectedSnapshotRef = useRef({ shotNumber: null, observedAtMs: 0, source: "" });
  const disconnectTimerRef = useRef(null);

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

  useEffect(() => {
    let cancelled = false;

    getPlcLatestReadings()
      .then((response) => {
        if (cancelled) return;
        const rows = Array.isArray(response.data?.data) ? response.data.data.filter((item) => item.has_data) : [];
        if (!rows.length) return;

        const selectedAtLoad = selectedKeyRef.current || plcConfig.key || plcConfig.ip;
        const row = rows.find((item) => (item.machine_key || item.plc_ip) === selectedAtLoad || item.plc_ip === selectedAtLoad);

        const nextReadingsByKey = {};
        const nextMetaByKey = {};
        const nextHistoryByKey = {};
        const nextStatusByKey = {};
        rows.forEach((item) => {
          const key = item.machine_key || item.plc_ip;
          const machine = DEFAULT_MACHINES.find((entry) => getMachineKey(entry) === key || entry.ip === item.plc_ip);
          const itemKind = machine?.kind || getMachineKindFromRow(item);
          const itemTimestamp = getRowTimestamp(item);
          const itemHistory = { id: `db-${item.id || itemTimestamp}`, timestamp: new Date(itemTimestamp), cycleTime: item.cycle_time ?? null };
          nextReadingsByKey[key] = rowToReadings(item, itemKind);
          if (item.plc_ip) nextReadingsByKey[item.plc_ip] = nextReadingsByKey[key];
          nextMetaByKey[key] = {
            timestamp: itemTimestamp,
            cycleTime: item.cycle_time ?? null,
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
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
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
            cycleTime: item.cycle_time ?? null,
          };
          if (item.plc_ip) nextStatusByKey[item.plc_ip] = nextStatusByKey[key];
        });

        setReadingsByIp(prev => ({ ...prev, ...nextReadingsByKey }));
        setMetaByIp(prev => ({ ...prev, ...nextMetaByKey }));
        setHistoryByIp(prev => ({ ...prev, ...nextHistoryByKey }));
        setMachineStatuses(prev => ({ ...prev, ...nextStatusByKey }));

        if (!row) return;

        const rowKey = row.machine_key || row.plc_ip;
        const rowMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === rowKey || machine.ip === row.plc_ip);
        const nextReadings = rowToReadings(row, rowMachine?.kind || getMachineKindFromRow(row));
        const timestamp = getRowTimestamp(row);
        const cycleTime = row.cycle_time ?? null;
        const historyItem = { id: `db-${row.id || timestamp}`, timestamp: new Date(timestamp), cycleTime };
        setReadings(nextReadings);
        rememberSelectedSnapshot(nextReadings, { observedAt: timestamp, source: "db" });
        setCycleHistory([historyItem]);
        setCycleCount(1);
        setLastTimestamp(new Date(timestamp));
        setPartName(row.part_qr_code || row.scan_data || row.part_name || "");
        setShotTime(buildShotTimeFromRow(row));
        setPlcConfig({ key: rowKey, ip: row.plc_ip, port: Number(row.plc_port || rowMachine?.port || 5002), kind: rowMachine?.kind });
        setDraftConfig({ ip: row.plc_ip, port: String(row.plc_port || rowMachine?.port || 5002) });
      })
      .catch((error) => {
        setConfigMessage(error.response?.data?.message || "Latest PLC DB data load failed.");
      });

    return () => {
      cancelled = true;
    };
  }, [rememberSelectedSnapshot]);

  const pushSpark = useCallback((name, value) => {
    setSparklines(prev => {
      const arr = [...(prev[name] || []), value].slice(-20);
      return { ...prev, [name]: arr };
    });
  }, []);

  const applyReadings = useCallback((newReadings, timestamp, cycleTime) => {
    setReadings(newReadings);
    setLastTimestamp(new Date(timestamp));
    setCycleCount(c => c + 1);
    setCycleHistory(prev => [
      { id: Date.now(), timestamp: new Date(timestamp), cycleTime },
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
          const machine = DEFAULT_MACHINES.find((entry) => getMachineKey(entry) === key || entry.ip === item.plc_ip);
          const itemKind = machine?.kind || getMachineKindFromRow(item);
          const itemTimestamp = getRowTimestamp(item);
          const itemReadings = rowToReadings(item, itemKind);
          const itemHistory = {
            id: `db-${item.id || itemTimestamp}`,
            timestamp: new Date(itemTimestamp),
            cycleTime: item.cycle_time ?? null,
          };

          nextReadingsByKey[key] = itemReadings;
          if (item.plc_ip) nextReadingsByKey[item.plc_ip] = itemReadings;
          nextMetaByKey[key] = {
            timestamp: itemTimestamp,
            cycleTime: item.cycle_time ?? null,
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
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
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
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
        const rowMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === rowKey || machine.ip === selectedRow.plc_ip);
        const nextReadings = rowToReadings(selectedRow, rowMachine?.kind || getMachineKindFromRow(selectedRow));
        const timestamp = getRowTimestamp(selectedRow);
        const cycleTime = selectedRow.cycle_time ?? null;
        const historyItem = { id: `db-${selectedRow.id || timestamp}`, timestamp: new Date(timestamp), cycleTime };

        if (isOlderDbSnapshotForSelectedMachine(selectedRow)) return;

        setReadings(nextReadings);
        rememberSelectedSnapshot(nextReadings, { observedAt: timestamp, source: "db" });
        setLastTimestamp(new Date(timestamp));
        setPartName(selectedRow.part_qr_code || selectedRow.scan_data || selectedRow.part_name || "");
        setShotTime(buildShotTimeFromRow(selectedRow));
        setCycleHistory(prev => {
          if (prev[0]?.id === historyItem.id) return prev;
          return [historyItem, ...prev].slice(0, 100);
        });
        setCycleCount(prev => Math.max(prev, 1));

        Object.entries(nextReadings).forEach(([name, item]) => {
          if (item?.value !== undefined && item.value !== null) pushSpark(name, item.value);
        });
      } catch (error) {
        if (!cancelled) {
          setConfigMessage(error.response?.data?.message || "Latest PLC auto refresh failed.");
        }
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
  }, [isOlderDbSnapshotForSelectedMachine, plcConfig.ip, plcConfig.key, pushSpark, rememberSelectedSnapshot]);

  const loadMachineSnapshot = useCallback((machineOrKey) => {
    const lookupKeys = typeof machineOrKey === "object"
      ? [getMachineKey(machineOrKey), machineOrKey.ip].filter(Boolean)
      : [machineOrKey].filter(Boolean);
    const snapshotKey = lookupKeys.find((key) => readingsByIp[key]) || lookupKeys[0];
    const nextReadings = snapshotKey ? readingsByIp[snapshotKey] || {} : {};
    const nextMeta = snapshotKey ? metaByIp[snapshotKey] || {} : {};
    const nextHistory = snapshotKey ? historyByIp[snapshotKey] || [] : [];
    const nextSparks = snapshotKey ? sparkByIp[snapshotKey] || {} : {};

    setReadings(nextReadings);
    setCycleHistory(nextHistory);
    setCycleCount(nextHistory.length);
    setSparklines(nextSparks);
    setLastTimestamp(nextMeta.timestamp ? new Date(nextMeta.timestamp) : null);
    setPartName(nextMeta.partName || "");
    setShotTime(nextMeta.shotTime || "");
    setCycleStatus("idle");
  }, [historyByIp, metaByIp, readingsByIp, sparkByIp]);

  const normalizeConfig = useCallback((config = {}) => {
    const key = config.key || config.machine_key || config.ip;
    const localMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === key)
      || machines.find((machine) => getMachineKey(machine) === key || machine.ip === config.ip);
    const machineKey = localMachine ? getMachineKey(localMachine) : key;
    return {
      key: machineKey,
      ip: localMachine?.ip || config.ip,
      port: Number(localMachine?.port || config.port || 5002),
      kind: localMachine?.kind || config.kind || "ube",
    };
  }, [machines]);

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
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        setSocketConnected(false);
        setPlcConnected(false);
      }, 1800);
    });

    socket.on("plc_status", ({ connected }) => {
      setPlcConnected(connected);
    });

    socket.on("plc_config", (config) => {
      const nextConfig = normalizeConfig(config);
      if (nextConfig.key && selectedKeyRef.current && nextConfig.key !== selectedKeyRef.current) {
        return;
      }

      setPlcConfig(nextConfig);
      setDraftConfig({ ip: nextConfig.ip, port: String(nextConfig.port) });
    });

    socket.on("machines", (list = []) => {
      setMachines(list.length ? mergeMachineList(list) : DEFAULT_MACHINES);
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

    socket.on("plc_data", ({ timestamp, observedAt, liveOnly = false, cycleTime, readings: r = {}, config, partName: nextPartName, shotTime: nextShotTime }) => {
      const key = config?.key || config?.ip || selectedKeyRef.current;
      const ip = config?.ip || key;
      const port = Number(config?.port || 5002);
      const eventTimestamp = r?.cycle_end_time?.value || r?.shot_datetime?.value || timestamp || null;
      const observedTimestamp = observedAt || new Date().toISOString();
      const eventPartName = r?.part_qr_code?.value || r?.scan_data?.value || nextPartName || "";

      setReadingsByIp(prev => ({ ...prev, [key]: r, [ip]: r }));
      setMetaByIp(prev => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          timestamp: liveOnly ? prev[key]?.timestamp || eventTimestamp : eventTimestamp,
          observedAt: observedTimestamp,
          cycleTime,
          partName: eventPartName,
          shotTime: nextShotTime,
        },
        [ip]: {
          ...(prev[ip] || {}),
          timestamp: liveOnly ? prev[ip]?.timestamp || eventTimestamp : eventTimestamp,
          observedAt: observedTimestamp,
          cycleTime,
          partName: eventPartName,
          shotTime: nextShotTime,
        },
      }));
      setSparkByIp(prev => {
        const next = { ...(prev[key] || {}) };
        Object.entries(r).forEach(([name, item]) => {
          if (item?.value !== undefined && item.value !== null) {
            next[name] = [...(next[name] || []), item.value].slice(-20);
          }
        });
        return { ...prev, [key]: next, [ip]: next };
      });

      if (selectedKeyRef.current !== key && selectedKeyRef.current !== ip) return;

      setPlcConfig({ key, ip, port, kind: config?.kind });
      setDraftConfig({ ip, port: String(port) });
      setReadings(r);
      rememberSelectedSnapshot(r, { observedAt: observedTimestamp, source: "live" });
      if (!liveOnly && eventTimestamp) {
        setLastTimestamp(new Date(eventTimestamp));
      }
      setPartName(eventPartName);
      setShotTime(nextShotTime || "");
      Object.entries(r).forEach(([name, item]) => {
        if (item?.value !== undefined && item.value !== null) pushSpark(name, item.value);
      });
    });

    socket.on("cycle_complete", ({ timestamp, cycleTime, readings: r, config, partName: nextPartName, shotTime: nextShotTime }) => {
      const key = config?.key || config?.ip || selectedKeyRef.current;
      const ip = config?.ip || key;
      const port = Number(config?.port || 5002);
      const eventTimestamp = r?.cycle_end_time?.value || r?.shot_datetime?.value || timestamp;
      const eventPartName = r?.part_qr_code?.value || r?.scan_data?.value || nextPartName || "";
      const historyItem = { id: `${key}-${eventTimestamp}`, timestamp: new Date(eventTimestamp), cycleTime };

      setReadingsByIp(prev => ({ ...prev, [key]: r, [ip]: r }));
      setMetaByIp(prev => ({
        ...prev,
        [key]: { timestamp: eventTimestamp, cycleTime, partName: eventPartName, shotTime: nextShotTime },
        [ip]: { timestamp: eventTimestamp, cycleTime, partName: eventPartName, shotTime: nextShotTime },
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
      setPlcConfig({ key, ip, port, kind: config?.kind });
      setDraftConfig({ ip, port: String(port) });
      setCycleStatus("complete");
      setReadings(r);
      rememberSelectedSnapshot(r, { observedAt: eventTimestamp, source: "live" });
      setLastTimestamp(new Date(eventTimestamp));
      setPartName(eventPartName);
      setShotTime(nextShotTime || "");
      setCycleHistory(prev => [historyItem, ...prev].slice(0, 100));
      setCycleCount(c => c + 1);
      Object.entries(r).forEach(([k, v]) => {
        if (v?.value !== undefined && v.value !== null) pushSpark(k, v.value);
      });
      setConfigMessage(`${machines.find((machine) => getMachineKey(machine) === key)?.name || MACHINE_NAMES[ip] || ip} live data received.`);
      setTimeout(() => setCycleStatus("idle"), 3000);
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
  const shotNumber = readings.shot_number?.value ?? null;
  const cycleTime = readings.cycle_time?.value ?? null;
  const shotForwardTime = readings.shot_fwd_time?.value ?? null;
  const shotDate = readings.shot_date?.value || buildShotDateFromRow(
    Object.fromEntries(Object.entries(readings).map(([name, item]) => [name, item?.value ?? null]))
  );
  const plcShotTime = readings.shot_time?.value || shotTime || buildShotTimeFromRow(
    Object.fromEntries(Object.entries(readings).map(([name, item]) => [name, item?.value ?? null]))
  );
  const selectedMachineKey = plcConfig.key || plcConfig.ip;
  const selectedMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === selectedMachineKey || machine.ip === plcConfig.ip)
    || machines.find((machine) => getMachineKey(machine) === selectedMachineKey || machine.ip === plcConfig.ip);
  const machineName = selectedMachine?.name || MACHINE_NAMES[plcConfig.ip] || "Unknown Machine";
  const selectedMachineKind = selectedMachine?.kind || plcConfig.kind || "ube";
  const isLeakTestMachine = selectedMachineKind === "leaktest";
  const selectedMachineStatus = machineStatuses[selectedMachineKey] || machineStatuses[plcConfig.ip] || {};
  const selectedMachineOnline = Boolean(selectedMachineStatus.connected);
  const selectedPlcConnected = Boolean(selectedMachineStatus.connected || selectedMachineStatus.hasRecentData || readings.plc_ip?.value);
  const availableGroups = REGISTER_GROUPS
    .filter((group) => group.kind === selectedMachineKind)
    .filter((group) => {
      if (group.id !== "machine_bits") return true;
      return group.keys.some(({ name }) => {
        const value = readings[name]?.value;
        if (!hasReadableValue(value)) return false;
        if (name === "cycle_end" && Number(value) === 0) return false;
        return true;
      });
    });
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
              const value = readings[name]?.value;
              if (!hasReadableValue(value)) return false;
              if (name === "cycle_end" && Number(value) === 0) return false;
              return true;
            }),
          }
        : group
    ))
    .filter((group) => group.keys.length > 0);
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
  ]);
  const cardGroups = displayGroups
    .map((group) => ({
      ...group,
      keys: group.keys.filter(({ name }) => !compactCardHiddenFields.has(name)),
    }))
    .filter((group) => group.keys.length > 0);
  const reportReading = {
    ...Object.fromEntries(Object.entries(readings).map(([name, item]) => [name, item?.value ?? null])),
    machine_name: readings.machine_name?.value || machineName,
    machine_key: readings.machine_key?.value || selectedMachineKey,
    kind: selectedMachineKind,
    plc_ip: readings.plc_ip?.value || readings.ip?.value || plcConfig.ip,
    plc_port: readings.plc_port?.value || plcConfig.port,
    part_name: readings.part_name?.value || readings.part_qr_code?.value || partName,
    shot_date: readings.shot_date?.value || shotDate,
    shot_time: readings.shot_time?.value || plcShotTime,
    shot_datetime: readings.shot_datetime?.value || readings.recorded_at?.value || lastTimestamp?.toISOString(),
    cycle_end_time: readings.cycle_end_time?.value || lastTimestamp?.toISOString(),
    recorded_at: readings.shot_datetime?.value || lastTimestamp?.toISOString(),
  };

  const resetDashboardData = () => {
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
    const machine = DEFAULT_MACHINES.find(item => getMachineKey(item) === key)
      || machines.find(item => getMachineKey(item) === key)
      || { key, ip: key, port: 5002 };
    const config = { key: getMachineKey(machine), ip: machine.ip, port: Number(machine.port || draftConfig.port || 5002), kind: machine.kind };
    selectedKeyRef.current = config.key;
    setPlcConfig(config);
    setDraftConfig({ ip: config.ip, port: String(config.port) });
    resetDashboardData();
    setConfigMessage(`${machine.name || MACHINE_NAMES[config.ip] || "Machine"} selected.`);
    loadMachineSnapshot(machine);
    socketRef.current?.emit("update_plc_config", config);
  };

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
                  <select value={selectedMachineKey} onChange={(e) => selectMachine(e.target.value)}>
                    {machines.map(machine => {
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

            <MetricTile label={isLeakTestMachine ? "Part QR Code" : "Part Name"} value={partName || "-"} tone="cyan" />
            <MetricTile
              label={isLeakTestMachine ? "Result" : "Shot Number"}
              value={isLeakTestMachine ? readings.result?.value ?? null : shotNumber}
              tone="cyan"
            />
            {isLeakTestMachine && (
              <MetricTile
                label="Body Leak"
                value={readings.body_leak_value?.value ?? null}
                tone="green"
              />
            )}
            {isLeakTestMachine && (
              <MetricTile
                label="GALL-1 / GALL-2"
                value={[readings.gall_1?.value, readings.gall_2?.value].filter(value => value !== null && value !== undefined).join(" / ") || null}
                tone="amber"
              />
            )}
            <MetricTile label="Cycle Time" value={cycleTime} unit="sec" tone="green" />
            <MetricTile
              label={isLeakTestMachine ? "Cycle End Time" : "Shot Forward Time"}
              value={isLeakTestMachine
                ? (lastTimestamp ? lastTimestamp.toLocaleTimeString() : null)
                : shotForwardTime}
              unit={isLeakTestMachine ? "" : "sec"}
              tone="slate"
            />
            {!isLeakTestMachine && (
              <MetricTile
                label="Shot Date"
                value={shotDate ? formatDateOnly(shotDate) : null}
                tone="slate"
              />
            )}
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
                        const reg = readings[name];
                        return (
                          <ValueCard
                            key={name}
                            name={name}
                            label={label}
                            unit={unit}
                            value={reg?.value ?? null}
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
