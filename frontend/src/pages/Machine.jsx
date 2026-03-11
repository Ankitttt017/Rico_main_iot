import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Download, Edit, Plus, RefreshCw, Save, Search, Settings, Trash2, X } from "lucide-react";
import { machineApi, plcConfigApi } from "../api/services";
import {
  MACHINE_FORM_FIELD_CONFIG,
  MACHINE_MODBUS_TUNING_FIELD_CONFIG,
  MACHINE_REGISTER_ROLE_FIELDS,
  MACHINE_TABLE_COLUMNS,
} from "../utils/machineFields";

const SLMP_DEVICE_OPTIONS = ["D", "M", "X", "Y", "W", "L", "F", "V", "B", "R"];
const SLMP_SIGNAL_KEY_BY_ROLE = {
  startRegister: "TRIGGER",
  statusRegister: "STATUS",
  stationRegister: "STATION_HASH",
  resetRegister: "RESET",
  partRegister: "PART_ID_HASH",
};
const REGISTER_LABEL_BY_ROLE = {
  startRegister: "Trigger Register",
  statusRegister: "Interlock Register",
  stationRegister: "Complete Register",
  resetRegister: "Reset Register",
  partRegister: "Part Register",
};
const MACHINE_REGISTER_FALLBACKS = {
  startRegister: "plcStartRegister",
  statusRegister: "plcStatusRegister",
  stationRegister: "plcStationRegister",
  resetRegister: "plcResetRegister",
  partRegister: "plcPartRegister",
};

function normalizeProtocol(value, fallback = "TCP_TEXT") {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "MODBUS") {
    return "MODBUS_TCP";
  }
  if (["TCP", "TEXT"].includes(normalized)) {
    return "TCP_TEXT";
  }
  return normalized;
}

function normalizeRangeProtocol(value) {
  return normalizeProtocol(value, "MODBUS_TCP");
}

function createEmptyForm() {
  return {
    machineName: "",
    lineName: "",
    sequenceNo: "",
    operationNo: "",
    dailyTargetQty: "0",
    plcIp: "",
    plcPort: "",
    plcProtocol: "TCP_TEXT",
    plcRangeId: "",
    plcSlmpDevice: "D",
    plcConfig: {
      rangeId: "",
      startRegister: "",
      statusRegister: "",
      partRegister: "",
      stationRegister: "",
      resetRegister: "",
      startValue: "1",
      startedValue: "2",
      endOkValue: "3",
      endNgValue: "4",
      blockValue: "2",
    },
    plcSignalMap: "",
    status: "ACTIVE",
  };
}

function toFormValue(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumberWithDefault(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseSignalMapInput(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) {
      return parsed;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveSignalMapEntry(signalMap, signalKey) {
  if (!signalMap || !signalKey) {
    return null;
  }
  const target = normalizeUpper(signalKey);
  if (Array.isArray(signalMap)) {
    return (
      signalMap.find((entry) => normalizeUpper(entry?.key || entry?.signalKey) === target) || null
    );
  }
  if (typeof signalMap === "object") {
    const direct = signalMap[signalKey] ?? signalMap[target];
    if (direct && typeof direct === "object") {
      return direct;
    }
    const matchedKey = Object.keys(signalMap).find((key) => normalizeUpper(key) === target);
    if (matchedKey) {
      const candidate = signalMap[matchedKey];
      if (candidate && typeof candidate === "object") {
        return candidate;
      }
    }
  }
  return null;
}

function resolveSlmpDeviceForSignal(signalMap, signalKey, fallbackDevice) {
  const entry = resolveSignalMapEntry(signalMap, signalKey);
  const candidate = entry?.device ?? entry?.deviceCode;
  return normalizeUpper(candidate) || fallbackDevice;
}

function formatSlmpAddress(device, register) {
  return `${device}${register}`;
}

function getMachineRegisterValue(machine, roleKey) {
  if (!machine) {
    return null;
  }
  const config = machine.plcConfig || {};
  if (config[roleKey] !== undefined && config[roleKey] !== null && config[roleKey] !== "") {
    return toNullableNumber(config[roleKey]);
  }
  const fallbackKey = MACHINE_REGISTER_FALLBACKS[roleKey];
  return fallbackKey ? toNullableNumber(machine[fallbackKey]) : null;
}

function buildDefaultSlmpSignalMap(deviceCode, config = {}) {
  const device = String(deviceCode || "D").trim().toUpperCase() || "D";
  const entries = [
    {
      key: "TRIGGER",
      label: "START_CMD",
      register: toNullableNumber(config.startRegister),
      direction: "PC -> PLC",
      writable: true,
      device,
    },
    {
      key: "STATUS",
      label: "STATUS",
      register: toNullableNumber(config.statusRegister),
      direction: "PLC -> PC",
      writable: false,
      device,
    },
    {
      key: "PART_ID_HASH",
      label: "PART_ID_HASH",
      register: toNullableNumber(config.partRegister),
      direction: "PC -> PLC",
      writable: true,
      device,
    },
    {
      key: "RESET",
      label: "RESET_CMD",
      register: toNullableNumber(config.resetRegister),
      direction: "PC -> PLC",
      writable: true,
      device,
    },
    {
      key: "STATION_HASH",
      label: "STATION_HASH",
      register: toNullableNumber(config.stationRegister),
      direction: "PC -> PLC",
      writable: true,
      device,
    },
  ];

  return JSON.stringify(entries, null, 2);
}

function clearRangeAssignments(config = {}) {
  return {
    ...config,
    rangeId: "",
    startRegister: "",
    statusRegister: "",
    partRegister: "",
    stationRegister: "",
    resetRegister: "",
  };
}

function buildFormFromMachine(machine) {
  const config = machine.plcConfig || {};
  const plcRangeId = config.rangeId ?? machine.plcRangeId ?? "";

  return {
    machineName: machine.machineName || "",
    lineName: machine.lineName || "",
    sequenceNo: toFormValue(machine.sequenceNo, ""),
    operationNo: machine.operationNo || "",
    dailyTargetQty: toFormValue(machine.dailyTargetQty, "0"),
    plcIp: machine.plcIp || "",
    plcPort: toFormValue(machine.plcPort, ""),
    plcProtocol: machine.plcProtocol || "TCP_TEXT",
    plcRangeId: toFormValue(plcRangeId, ""),
    plcSlmpDevice: machine.plcSlmpDevice || "D",
    plcConfig: {
      rangeId: toFormValue(plcRangeId, ""),
      startRegister: toFormValue(config.startRegister ?? machine.plcStartRegister, ""),
      statusRegister: toFormValue(config.statusRegister ?? machine.plcStatusRegister, ""),
      partRegister: toFormValue(config.partRegister ?? machine.plcPartRegister, ""),
      stationRegister: toFormValue(config.stationRegister ?? machine.plcStationRegister, ""),
      resetRegister: toFormValue(config.resetRegister ?? machine.plcResetRegister, ""),
      startValue: toFormValue(config.startValue ?? machine.plcStartValue, "1"),
      startedValue: toFormValue(config.startedValue ?? machine.plcStartedValue, "2"),
      endOkValue: toFormValue(config.endOkValue ?? machine.plcEndOkValue, "3"),
      endNgValue: toFormValue(config.endNgValue ?? machine.plcEndNgValue, "4"),
      blockValue: toFormValue(config.blockValue ?? machine.plcBlockValue, "2"),
    },
    plcSignalMap: machine.plcSignalMap ? JSON.stringify(machine.plcSignalMap, null, 2) : "",
    status: machine.status || "ACTIVE",
  };
}

function toSubmitPayload(formData) {
  const plcIp = String(formData.plcIp || "").trim();
  const plcPort = toNullableNumber(formData.plcPort);
  const plcRangeId = toNullableNumber(formData.plcRangeId);
  const cfg = formData.plcConfig || {};

  const plcConfig = {
    rangeId: plcRangeId,
    startRegister: toNullableNumber(cfg.startRegister),
    statusRegister: toNullableNumber(cfg.statusRegister),
    partRegister: toNullableNumber(cfg.partRegister),
    stationRegister: toNullableNumber(cfg.stationRegister),
    resetRegister: toNullableNumber(cfg.resetRegister),
    startValue: toNumberWithDefault(cfg.startValue, 1),
    startedValue: toNumberWithDefault(cfg.startedValue, 2),
    endOkValue: toNumberWithDefault(cfg.endOkValue, 3),
    endNgValue: toNumberWithDefault(cfg.endNgValue, 4),
    blockValue: toNumberWithDefault(cfg.blockValue, 2),
  };

  return {
    machineName: String(formData.machineName || "").trim(),
    lineName: String(formData.lineName || "").trim(),
    sequenceNo: toNullableNumber(formData.sequenceNo),
    operationNo: String(formData.operationNo || "").trim().toUpperCase(),
    dailyTargetQty: Math.max(toNullableNumber(formData.dailyTargetQty) ?? 0, 0),
    plcIp,
    plcPort,
    plcProtocol: formData.plcProtocol,
    plcRangeId,
    plcConfig,
    plcBlockValue: plcConfig.blockValue,
    plcSlmpDevice: String(formData.plcSlmpDevice || "").trim().toUpperCase() || null,
    plcSignalMap: parseSignalMapInput(formData.plcSignalMap),
    status: formData.status || "ACTIVE",
    machineIp: plcIp,
    machinePort: plcPort,
  };
}

function sortValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return value;
}

const MachinePage = () => {
  const [machines, setMachines] = useState([]);
  const [plcRanges, setPlcRanges] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [formData, setFormData] = useState(() => createEmptyForm());
  const [searchTerm, setSearchTerm] = useState("");
  const [lineFilter, setLineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "sequenceNo", direction: "asc" });
  const [pageError, setPageError] = useState("");
  const [rangeRegisters, setRangeRegisters] = useState(null);
  const [rangeRegistersLoading, setRangeRegistersLoading] = useState(false);
  const [rangeRegistersError, setRangeRegistersError] = useState("");

  const loadMachineContext = useCallback(async () => {
    const [machineRows, rangeRows] = await Promise.all([machineApi.list(), plcConfigApi.listRanges().catch(() => [])]);
    setMachines(machineRows || []);
    setPlcRanges(rangeRows || []);
    setPageError("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadMachineContext().catch((error) => {
        setPageError(error.response?.data?.error || "Error loading machine configuration");
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [loadMachineContext]);

  const rangeById = useMemo(
    () =>
      plcRanges.reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {}),
    [plcRanges]
  );

  const activeRanges = useMemo(
    () => plcRanges.filter((row) => String(row.status || "").toUpperCase() === "ACTIVE"),
    [plcRanges]
  );

  const normalizedProtocol = normalizeProtocol(formData.plcProtocol, "TCP_TEXT");
  const isModbusProtocol = normalizedProtocol === "MODBUS_TCP";
  const isSlmpProtocol = normalizedProtocol === "SLMP";
  const usesRange = isModbusProtocol || isSlmpProtocol;

  const activeRangesByProtocol = useMemo(() => {
    if (!usesRange) {
      return activeRanges;
    }
    return activeRanges.filter(
      (row) => normalizeRangeProtocol(row.plcProtocol) === normalizedProtocol
    );
  }, [activeRanges, normalizedProtocol, usesRange]);

  const plcIpOptions = useMemo(() => {
    const options = [];
    const seen = new Set();
    const rangePool = usesRange ? activeRangesByProtocol : activeRanges;
    for (const row of rangePool) {
      const ip = String(row.plcIp || "").trim();
      if (!ip || seen.has(ip)) {
        continue;
      }
      seen.add(ip);
      options.push(ip);
    }
    const currentIp = String(formData.plcIp || "").trim();
    if (currentIp && !seen.has(currentIp)) {
      options.push(currentIp);
    }
    return options.sort((a, b) => a.localeCompare(b));
  }, [activeRanges, activeRangesByProtocol, formData.plcIp, usesRange]);

  const selectableRanges = useMemo(() => {
    const selectedIp = String(formData.plcIp || "").trim();
    const map = new Map();
    const rangePool = usesRange ? activeRangesByProtocol : activeRanges;
    for (const row of rangePool.filter((entry) => !selectedIp || String(entry.plcIp || "").trim() === selectedIp)) {
      map.set(String(row.id), row);
    }

    const editingRangeId = toNullableNumber(editingMachine?.plcRangeId || editingMachine?.plcConfig?.rangeId);
    if (editingRangeId && rangeById[editingRangeId]) {
      map.set(String(editingRangeId), rangeById[editingRangeId]);
    }

    return Array.from(map.values());
  }, [activeRanges, activeRangesByProtocol, editingMachine, formData.plcIp, rangeById, usesRange]);

  const resetForm = () => {
    setFormData(createEmptyForm());
    setEditingMachine(null);
    setRangeRegisters(null);
    setRangeRegistersError("");
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const loadRangeRegisters = useCallback(async (rangeId, excludeMachineId = null) => {
    if (!rangeId) {
      setRangeRegisters(null);
      setRangeRegistersError("");
      return;
    }

    try {
      setRangeRegistersLoading(true);
      setRangeRegistersError("");

      const payload = await plcConfigApi.rangeRegisters(rangeId, excludeMachineId ? { excludeMachineId } : {});
      setRangeRegisters(payload || null);

      const defaults = payload?.range?.defaultRegisters || {};
      const available = new Set(
        (payload?.availableRegisters || [])
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry))
      );
      const currentMachine = new Set(
        (payload?.currentMachineRegisters || [])
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry))
      );

      setFormData((prev) => {
        if (String(prev.plcRangeId || "") !== String(rangeId)) {
          return prev;
        }

        let changed = false;
        const nextConfig = { ...(prev.plcConfig || {}), rangeId: String(rangeId) };

        for (const role of MACHINE_REGISTER_ROLE_FIELDS) {
          const existing = toNullableNumber(nextConfig[role.key]);
          if (existing !== null) {
            continue;
          }

          const defaultRegister = toNullableNumber(defaults[role.key]);
          if (defaultRegister === null) {
            continue;
          }
          if (!available.has(defaultRegister) && !currentMachine.has(defaultRegister)) {
            continue;
          }

          nextConfig[role.key] = String(defaultRegister);
          changed = true;
        }

        if (!changed) {
          return prev;
        }

        return {
          ...prev,
          plcConfig: nextConfig,
        };
      });
    } catch (error) {
      setRangeRegisters(null);
      setRangeRegistersError(error.response?.data?.error || "Unable to load range register usage");
    } finally {
      setRangeRegistersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showModal || !usesRange) {
      setRangeRegisters(null);
      setRangeRegistersError("");
      return;
    }

    if (!formData.plcRangeId) {
      setRangeRegisters(null);
      setRangeRegistersError("");
      return;
    }

    loadRangeRegisters(formData.plcRangeId, editingMachine?.id || null);
  }, [showModal, usesRange, formData.plcRangeId, editingMachine?.id, loadRangeRegisters]);

  useEffect(() => {
    if (!showModal) {
      return;
    }
    if (editingMachine) {
      return;
    }
    if (!usesRange) {
      return;
    }
    if (formData.plcRangeId) {
      return;
    }
    if (activeRangesByProtocol.length === 0) {
      return;
    }

    const firstRange = activeRangesByProtocol[0];
    const nextRangeId = String(firstRange.id);
    setFormData((prev) => ({
      ...prev,
      plcIp: firstRange.plcIp || "",
      plcPort: toFormValue(firstRange.plcPort, ""),
      plcRangeId: nextRangeId,
      plcConfig: {
        ...(prev.plcConfig || {}),
        rangeId: nextRangeId,
      },
    }));
  }, [showModal, editingMachine, usesRange, formData.plcRangeId, activeRangesByProtocol]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      if (String(formData.plcSignalMap || "").trim() && !parseSignalMapInput(formData.plcSignalMap)) {
        alert("Invalid PLC Signal Map JSON. Provide valid object/array or leave blank.");
        return;
      }
      const payload = toSubmitPayload(formData);
      if (String(payload.plcProtocol || "").toUpperCase() === "MODBUS_TCP" && !payload.plcRangeId) {
        alert("Select PLC register range for MODBUS_TCP machine");
        return;
      }
      if (["TCP_TEXT", "SLMP"].includes(String(payload.plcProtocol || "").toUpperCase())) {
        if (!payload.plcIp || !Number.isFinite(Number(payload.plcPort))) {
          alert("For TCP_TEXT/SLMP, PLC IP and PLC Port are required.");
          return;
        }
      }
      if (String(payload.plcProtocol || "").toUpperCase() === "SLMP") {
        const cfg = payload.plcConfig || {};
        if (!Number.isFinite(Number(cfg.startRegister)) || !Number.isFinite(Number(cfg.statusRegister))) {
          alert("For SLMP, Start Register and Status Register are required.");
          return;
        }
      }

      if (editingMachine) {
        await machineApi.update(editingMachine.id, payload);
      } else {
        await machineApi.create(payload);
      }

      closeModal();
      await loadMachineContext();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to save machine");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this machine?")) {
      return;
    }

    try {
      await machineApi.remove(id);
      await loadMachineContext();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to delete machine");
    }
  };

  const handleSort = (key) => {
    if (sortConfig.key === key) {
      setSortConfig((prev) => ({
        key,
        direction: prev.direction === "asc" ? "desc" : "asc",
      }));
      return;
    }

    setSortConfig({ key, direction: "asc" });
  };

  const downloadMachineSheet = () => {
    const rows = [
      [
        "Machine Name",
        "Line Name",
        "Sequence No",
        "Operation No",
        "Protocol",
        "PLC IP",
        "PLC Port",
        "Daily Target Qty",
        "PLC Range",
        "Trigger Register",
        "Interlock Register",
        "Complete Register",
        "Reset Register",
        "Start Value",
        "Started Value",
        "End OK Value",
        "End NG Value",
        "Block Value",
        "SLMP Device",
        "Status",
      ],
    ];

    for (const machine of filteredMachines) {
      const cfg = machine.plcConfig || {};
      const rangeId = toNullableNumber(machine.plcRangeId || cfg.rangeId);
      const range = rangeId ? rangeById[rangeId] : null;
      rows.push([
        machine.machineName || "",
        machine.lineName || "",
        machine.sequenceNo ?? "",
        machine.operationNo || "",
        machine.plcProtocol || "",
        machine.plcIp || "",
        machine.plcPort ?? "",
        machine.dailyTargetQty ?? "",
        range ? `${range.rangeName} (${range.rangeStart}-${range.rangeEnd})` : rangeId || "",
        cfg.startRegister ?? "",
        cfg.statusRegister ?? "",
        cfg.stationRegister ?? "",
        cfg.resetRegister ?? "",
        cfg.startValue ?? "",
        cfg.startedValue ?? "",
        cfg.endOkValue ?? "",
        cfg.endNgValue ?? "",
        cfg.blockValue ?? "",
        machine.plcSlmpDevice || "",
        machine.status || "",
      ]);
    }

    const csv = rows
      .map((row) =>
        row
          .map((entry) => {
            const text = String(entry ?? "");
            if (!text.includes(",") && !text.includes('"') && !text.includes("\n")) {
              return text;
            }
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "machine_handshake_sheet.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const uniqueLines = useMemo(() => {
    const lines = machines.map((machine) => machine.lineName).filter(Boolean);
    return ["all", ...new Set(lines)];
  }, [machines]);

  const filteredMachines = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = machines.filter((machine) => {
      const rangeId = toNullableNumber(machine.plcRangeId || machine.plcConfig?.rangeId);
      const rangeName = rangeId ? rangeById[rangeId]?.rangeName || "" : "";

      const searchFields = [
        machine.machineName,
        machine.lineName,
        machine.operationNo,
        String(machine.sequenceNo ?? ""),
        String(machine.dailyTargetQty ?? ""),
        machine.plcIp,
        machine.plcProtocol,
        machine.plcRangeId,
        rangeName,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !normalizedSearch || searchFields.includes(normalizedSearch);
      const matchesLine = lineFilter === "all" || machine.lineName === lineFilter;
      const matchesStatus = statusFilter === "all" || machine.status === statusFilter;
      return matchesSearch && matchesLine && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const aValue = sortValue(a[sortConfig.key]);
      const bValue = sortValue(b[sortConfig.key]);
      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [lineFilter, machines, rangeById, searchTerm, sortConfig.direction, sortConfig.key, statusFilter]);

  const handleEdit = (machine) => {
    setEditingMachine(machine);
    setFormData(buildFormFromMachine(machine));
    setRangeRegisters(null);
    setRangeRegistersError("");
    setShowModal(true);
  };

  const updateField = (key, value) => {
    if (key === "operationNo") {
      setFormData((prev) => ({ ...prev, [key]: String(value).toUpperCase() }));
      return;
    }

    if (key === "plcProtocol") {
      const normalized = String(value || "").toUpperCase();
      const rangesByProtocol = activeRanges.filter(
        (row) => normalizeRangeProtocol(row.plcProtocol) === normalized
      );
      setFormData((prev) => {
        if (normalized === "MODBUS_TCP") {
          const candidateRanges = rangesByProtocol.filter(
            (row) => String(row.plcIp || "").trim() === String(prev.plcIp || "").trim()
          );
          const range =
            rangeById[toNullableNumber(prev.plcRangeId)] ||
            candidateRanges[0] ||
            rangesByProtocol[0] ||
            null;
          return {
            ...prev,
            plcProtocol: normalized,
            plcIp: range?.plcIp || "",
            plcPort: toFormValue(range?.plcPort, ""),
            plcRangeId: range ? String(range.id) : "",
            plcConfig: {
              ...(prev.plcConfig || {}),
              rangeId: range ? String(range.id) : "",
            },
          };
        }

        if (normalized === "SLMP") {
          const nextConfig = clearRangeAssignments(prev.plcConfig);
          const hasSignalMap = String(prev.plcSignalMap || "").trim().length > 0;
          const candidateRanges = rangesByProtocol.filter(
            (row) => String(row.plcIp || "").trim() === String(prev.plcIp || "").trim()
          );
          const range = candidateRanges[0] || rangesByProtocol[0] || null;
          const nextRangeId = range ? String(range.id) : "";
          return {
            ...prev,
            plcProtocol: normalized,
            plcIp: range?.plcIp || prev.plcIp || "",
            plcPort: toFormValue(range?.plcPort, prev.plcPort || ""),
            plcRangeId: nextRangeId,
            plcConfig: {
              ...nextConfig,
              rangeId: nextRangeId,
            },
            plcSignalMap: hasSignalMap
              ? prev.plcSignalMap
              : buildDefaultSlmpSignalMap(prev.plcSlmpDevice, prev.plcConfig || {}),
          };
        }

        return {
          ...prev,
          plcProtocol: normalized,
          plcRangeId: "",
          plcConfig: clearRangeAssignments(prev.plcConfig),
        };
      });
      return;
    }

    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updatePlcConfigField = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      plcConfig: {
        ...(prev.plcConfig || {}),
        [key]: value,
      },
    }));
  };

  const updateSelectedPlcIp = (ipValue) => {
    const normalizedIp = String(ipValue || "").trim();
    const rangePool = usesRange ? activeRangesByProtocol : activeRanges;
    const candidateRanges = rangePool.filter((row) => String(row.plcIp || "").trim() === normalizedIp);
    const currentRangeId = toNullableNumber(formData.plcRangeId);
    const currentRange =
      currentRangeId && candidateRanges.some((entry) => Number(entry.id) === currentRangeId)
        ? candidateRanges.find((entry) => Number(entry.id) === currentRangeId)
        : null;
    const nextRange = currentRange || candidateRanges[0] || null;

    setFormData((prev) => ({
      ...prev,
      plcIp: normalizedIp,
      plcPort: toFormValue(nextRange?.plcPort, ""),
      plcRangeId: nextRange ? String(nextRange.id) : "",
      plcConfig: {
        ...clearRangeAssignments(prev.plcConfig),
        rangeId: nextRange ? String(nextRange.id) : "",
      },
    }));

    setRangeRegisters(null);
    setRangeRegistersError("");
  };

  const updateSelectedRange = (rangeId) => {
    if (!rangeId) {
      setFormData((prev) => ({
        ...prev,
        plcRangeId: "",
        plcConfig: {
          ...clearRangeAssignments(prev.plcConfig),
          rangeId: "",
        },
      }));
      setRangeRegisters(null);
      setRangeRegistersError("");
      return;
    }
    const range = rangeById[toNullableNumber(rangeId)] || null;
    setFormData((prev) => ({
      ...prev,
      plcRangeId: rangeId,
      plcProtocol: String(range?.plcProtocol || "MODBUS_TCP").toUpperCase(),
      plcIp: range?.plcIp || "",
      plcPort: toFormValue(range?.plcPort, ""),
      plcConfig: {
        ...clearRangeAssignments(prev.plcConfig),
        rangeId,
      },
    }));

    setRangeRegisters(null);
    setRangeRegistersError("");
  };

  const getRoleRegisterOptions = useCallback(
    (roleKey) => {
      const selectedRangeId = toNullableNumber(formData.plcRangeId);
      if (!selectedRangeId) {
        return [];
      }

      const rangeRow = rangeById[selectedRangeId] || null;
      const fallbackRegisters = [];
      if (rangeRow) {
        for (let registerNo = rangeRow.rangeStart; registerNo <= rangeRow.rangeEnd; registerNo += 1) {
          fallbackRegisters.push(registerNo);
        }
      }

      const baseSet = new Set(
        ((rangeRegisters?.availableRegisters || []).length > 0 ? rangeRegisters.availableRegisters : fallbackRegisters)
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry))
      );

      const current = toNullableNumber(formData.plcConfig?.[roleKey]);
      if (current !== null) {
        baseSet.add(current);
      }

      const usedByOtherRoles = new Set(
        MACHINE_REGISTER_ROLE_FIELDS.filter((entry) => entry.key !== roleKey)
          .map((entry) => toNullableNumber(formData.plcConfig?.[entry.key]))
          .filter((entry) => entry !== null)
      );

      return Array.from(baseSet)
        .filter((registerNo) => registerNo === current || !usedByOtherRoles.has(registerNo))
        .sort((a, b) => a - b);
    },
    [formData.plcConfig, formData.plcRangeId, rangeById, rangeRegisters]
  );

  const slmpRegisterConflicts = useMemo(() => {
    if (!showModal || !isSlmpProtocol) {
      return null;
    }
    const plcIp = String(formData.plcIp || "").trim();
    const plcPort = toNullableNumber(formData.plcPort);
    if (!plcIp || plcPort === null) {
      return null;
    }

    const signalMap = parseSignalMapInput(formData.plcSignalMap);
    const defaultDevice = normalizeUpper(formData.plcSlmpDevice || "D") || "D";
    const currentAssignments = [
      {
        role: "startRegister",
        signalKey: SLMP_SIGNAL_KEY_BY_ROLE.startRegister,
        register: toNullableNumber(formData.plcConfig?.startRegister),
      },
      {
        role: "statusRegister",
        signalKey: SLMP_SIGNAL_KEY_BY_ROLE.statusRegister,
        register: toNullableNumber(formData.plcConfig?.statusRegister),
      },
      {
        role: "stationRegister",
        signalKey: SLMP_SIGNAL_KEY_BY_ROLE.stationRegister,
        register: toNullableNumber(formData.plcConfig?.stationRegister),
      },
      {
        role: "resetRegister",
        signalKey: SLMP_SIGNAL_KEY_BY_ROLE.resetRegister,
        register: toNullableNumber(formData.plcConfig?.resetRegister),
      },
    ]
      .filter((entry) => entry.register !== null)
      .map((entry) => ({
        ...entry,
        label: REGISTER_LABEL_BY_ROLE[entry.role] || entry.role,
        device: resolveSlmpDeviceForSignal(signalMap, entry.signalKey, defaultDevice),
      }));

    const localMessages = [];
    const localMap = new Map();
    for (const entry of currentAssignments) {
      const key = `${entry.device}:${entry.register}`;
      const labels = localMap.get(key) || [];
      labels.push(entry.label);
      localMap.set(key, labels);
    }
    for (const [key, labels] of localMap.entries()) {
      if (labels.length > 1) {
        const [device, register] = key.split(":");
        localMessages.push(`${formatSlmpAddress(device, register)} used by ${labels.join(" + ")}.`);
      }
    }

    const peerMap = new Map();
    for (const machine of machines) {
      if (editingMachine && String(machine.id) === String(editingMachine.id)) {
        continue;
      }
      if (normalizeProtocol(machine.plcProtocol, "TCP_TEXT") !== "SLMP") {
        continue;
      }
      const peerIp = String(machine.plcIp || "").trim();
      const peerPort = toNullableNumber(machine.plcPort);
      if (!peerIp || peerPort === null) {
        continue;
      }
      if (peerIp !== plcIp || peerPort !== plcPort) {
        continue;
      }
      const peerSignalMap = machine.plcSignalMap || null;
      const peerDefaultDevice = normalizeUpper(machine.plcSlmpDevice || "D") || "D";
      const peerRoles = ["startRegister", "statusRegister", "stationRegister", "resetRegister", "partRegister"];
      for (const role of peerRoles) {
        const register = getMachineRegisterValue(machine, role);
        if (register === null) {
          continue;
        }
        const signalKey = SLMP_SIGNAL_KEY_BY_ROLE[role] || role;
        const device = resolveSlmpDeviceForSignal(peerSignalMap, signalKey, peerDefaultDevice);
        const key = `${device}:${register}`;
        if (!peerMap.has(key)) {
          peerMap.set(key, []);
        }
        peerMap.get(key).push({
          machineName: machine.machineName || "Machine",
          operationNo: machine.operationNo || "",
          roleLabel: REGISTER_LABEL_BY_ROLE[role] || role,
        });
      }
    }

    const peerMessages = [];
    const seenKeys = new Set();
    for (const entry of currentAssignments) {
      const key = `${entry.device}:${entry.register}`;
      if (seenKeys.has(key)) {
        continue;
      }
      const matches = peerMap.get(key);
      if (!matches || matches.length === 0) {
        continue;
      }
      seenKeys.add(key);
      const target = matches
        .map((match) => {
          const op = match.operationNo ? ` (${match.operationNo})` : "";
          return `${match.machineName}${op} - ${match.roleLabel}`;
        })
        .join(", ");
      peerMessages.push(`${formatSlmpAddress(entry.device, entry.register)} already used by ${target}.`);
    }

    if (localMessages.length === 0 && peerMessages.length === 0) {
      return null;
    }
    return { local: localMessages, peer: peerMessages };
  }, [
    editingMachine,
    formData.plcConfig,
    formData.plcIp,
    formData.plcPort,
    formData.plcSignalMap,
    formData.plcSlmpDevice,
    isSlmpProtocol,
    machines,
    showModal,
  ]);

  const handleRegenerateSlmpSignalMap = () => {
    if (!isSlmpProtocol) {
      return;
    }
    const hasExisting = String(formData.plcSignalMap || "").trim().length > 0;
    if (hasExisting && !window.confirm("Regenerate SLMP signal map? This will overwrite the current mapping.")) {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      plcSignalMap: buildDefaultSlmpSignalMap(prev.plcSlmpDevice, prev.plcConfig || {}),
    }));
  };

  const renderCellValue = (machine, key) => {
    if (key === "status") {
      return (
        <span
          className={`px-2 py-1 rounded-full text-xs font-bold ${
            machine.status === "ACTIVE"
              ? "bg-accent/10 text-accent border border-accent/20"
              : "bg-danger/10 text-danger border border-danger/20"
          }`}
        >
          {machine.status || "ACTIVE"}
        </span>
      );
    }

    if (key === "sequenceNo") {
      return <span className="font-mono text-primary">#{String(machine.sequenceNo ?? "-").padStart(2, "0")}</span>;
    }

      if (key === "plcRangeId") {
        const rangeId = toNullableNumber(machine.plcRangeId || machine.plcConfig?.rangeId);
        const range = rangeId ? rangeById[rangeId] : null;

        const protocol = String(machine.plcProtocol || "").toUpperCase();
        if (!["MODBUS_TCP", "SLMP"].includes(protocol)) {
          return <span className="text-text-muted text-xs">N/A</span>;
        }

      if (!rangeId) {
        return <span className="text-danger text-xs">Not linked</span>;
      }

      return (
        <span className="text-text-main text-xs font-mono">
          {range?.rangeName || `Range #${rangeId}`}
          {range ? ` (${range.rangeStart}-${range.rangeEnd})` : ""}
        </span>
      );
    }

      if (key === "plcConfig") {
        const cfg = machine.plcConfig || null;
        if (!cfg) {
          return <span className="font-mono text-xs text-text-main">-</span>;
        }

        const protocol = String(machine.plcProtocol || "").toUpperCase();
        if (protocol !== "MODBUS_TCP" && protocol !== "SLMP") {
          return <span className="font-mono text-xs text-text-main">{machine.plcProtocol || "TCP_TEXT"}</span>;
        }

        return (
          <span className="font-mono text-xs text-text-main">
            TRG:{cfg.startRegister ?? "-"} | INT:{cfg.statusRegister ?? "-"} | CMP:{cfg.stationRegister ?? "-"} | RST:
            {cfg.resetRegister ?? "-"}
          </span>
        );
      }

    return <span className="text-text-main">{machine[key] ?? "-"}</span>;
  };

  return (
    <div className="space-y-6 text-text-main">
      <header className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20">
            <Settings size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main uppercase">Machine Configuration</h1>
            <p className="text-text-muted text-sm">Dynamic machine-to-PLC binding with register ownership control</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-primary hover:brightness-110 text-bg-dark px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-primary/10"
        >
          <Plus size={20} /> Add Machine
        </button>
      </header>

      {pageError ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 text-danger px-4 py-3 text-sm">{pageError}</div>
      ) : null}

      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
          <input
            type="text"
            placeholder="Search by machine, line, sequence, operation, PLC IP, range..."
            className="w-full bg-bg-card border border-border rounded-xl py-3 pl-10 pr-4 text-text-main focus:border-primary/50 focus:outline-none transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <select
            value={lineFilter}
            onChange={(event) => setLineFilter(event.target.value)}
            className="bg-bg-card border border-border rounded-xl px-4 py-2 text-text-main focus:border-primary/50 focus:outline-none"
          >
            <option value="all">All Lines</option>
            {uniqueLines
              .filter((entry) => entry !== "all")
              .map((line) => (
                <option key={line} value={line}>
                  {line}
                </option>
              ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="bg-bg-card border border-border rounded-xl px-4 py-2 text-text-main focus:border-primary/50 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>

          <button
            onClick={() => loadMachineContext().catch(() => {})}
            className="p-2 bg-bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={20} className="text-text-muted" />
          </button>
        </div>
      </div>

      <div className="industrial-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-bg-dark/30 flex items-center justify-between">
          <p className="text-sm font-semibold text-text-main">Machine Handshake Table</p>
          <button
            onClick={downloadMachineSheet}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-semibold text-text-main hover:border-primary"
          >
            <Download size={14} />
            Download Sheet
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bg-dark/50 border-b border-border">
              <tr>
                {MACHINE_TABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`px-6 py-4 text-left text-xs font-bold uppercase tracking-wider ${
                      column.sortable ? "text-text-muted cursor-pointer hover:text-primary" : "text-text-muted"
                    }`}
                    onClick={() => {
                      if (column.sortable) {
                        handleSort(column.key);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>{column.label}</span>
                      {column.sortable && sortConfig.key === column.key && (
                        <span>{sortConfig.direction === "asc" ? "^" : "v"}</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredMachines.length > 0 ? (
                filteredMachines.map((machine) => (
                  <tr key={machine.id} className="hover:bg-bg-dark/30 transition-colors group">
                    {MACHINE_TABLE_COLUMNS.map((column) => (
                      <td key={`${machine.id}-${column.key}`} className="px-6 py-4 whitespace-nowrap">
                        {renderCellValue(machine, column.key)}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(machine)}
                          className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-all hover:scale-110"
                          title="Edit machine"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(machine.id)}
                          className="p-2 hover:bg-danger/10 text-danger rounded-lg transition-all hover:scale-110"
                          title="Delete machine"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={MACHINE_TABLE_COLUMNS.length + 1} className="px-6 py-12 text-center">
                    <Database size={48} className="mx-auto text-text-muted mb-4 opacity-50" />
                    <p className="text-text-muted">No machines found</p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setLineFilter("all");
                        setStatusFilter("all");
                      }}
                      className="mt-4 text-primary hover:underline text-sm"
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-bg-dark/50 border-t border-border flex items-center justify-between">
          <div className="text-sm text-text-muted">
            Showing <span className="text-primary font-medium">{filteredMachines.length}</span> of{" "}
            <span className="text-primary font-medium">{machines.length}</span> machines
          </div>
          {filteredMachines.length > 0 && (
            <div className="text-sm text-text-muted">
              <span className="text-accent font-medium">{machines.filter((row) => row.status === "ACTIVE").length}</span> Active,{" "}
              <span className="text-danger font-medium">{machines.filter((row) => row.status === "INACTIVE").length}</span>{" "}
              Inactive
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-bg-card border border-border p-8 rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-bg-card py-2">
              <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
                {editingMachine ? (
                  <>
                    <Edit size={20} className="text-primary" />
                    <span>Edit Machine</span>
                  </>
                ) : (
                  <>
                    <Plus size={20} className="text-primary" />
                    <span>Add New Machine</span>
                  </>
                )}
              </h2>
              <button type="button" onClick={closeModal} className="p-2 hover:bg-bg-dark rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

           

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {MACHINE_FORM_FIELD_CONFIG.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1">
                    {field.label}
                    {field.required && <span className="text-primary">*</span>}
                  </label>
                  {field.type === "select" ? (
                    <select
                      value={formData[field.key]}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      required={field.required}
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    >
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={formData[field.key]}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      required={field.required}
                      placeholder={field.placeholder || ""}
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    />
                  )}
                </div>
              ))}
            </div>

            {isModbusProtocol ? (
              <div className="mt-6 border border-border rounded-2xl p-4 bg-bg-dark/40 space-y-5">
                <div>
                  <p className="text-sm font-bold text-text-main uppercase tracking-wide">PLC Binding</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">
                      Select PLC IP <span className="text-primary">*</span>
                    </label>
                    <select
                      value={formData.plcIp}
                      onChange={(event) => updateSelectedPlcIp(event.target.value)}
                      required
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    >
                      <option value="">Select PLC IP</option>
                      {plcIpOptions.map((ip) => (
                        <option key={ip} value={ip}>
                          {ip}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">Auto Port</label>
                    <input
                      value={formData.plcPort}
                      readOnly
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main outline-none opacity-80"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">
                      Select Register Range <span className="text-primary">*</span>
                    </label>
                    <select
                      value={formData.plcRangeId}
                      onChange={(event) => updateSelectedRange(event.target.value)}
                      required
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    >
                      <option value="">Select range</option>
                      {selectableRanges.map((range) => (
                        <option key={range.id} value={range.id}>
                          {range.rangeName} ({range.rangeStart}-{range.rangeEnd})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {rangeRegistersError ? (
                  <div className="rounded-xl border border-danger/40 bg-danger/10 text-danger px-3 py-2 text-xs">
                    {rangeRegistersError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-bold text-text-main uppercase tracking-wide">Handshake Mapping</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {MACHINE_REGISTER_ROLE_FIELDS.map((field) => {
                      const options = getRoleRegisterOptions(field.key);
                      return (
                        <div key={field.key} className="space-y-1">
                          <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1">
                            {field.label}
                            {field.required && <span className="text-primary">*</span>}
                          </label>
                          <select
                            value={formData.plcConfig?.[field.key] ?? ""}
                            onChange={(event) => updatePlcConfigField(field.key, event.target.value)}
                            required={field.required}
                            disabled={!formData.plcRangeId || selectableRanges.length === 0 || rangeRegistersLoading}
                            className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none disabled:opacity-60"
                          >
                            <option value="">Select register</option>
                            {options.map((registerNo) => (
                              <option key={`${field.key}-${registerNo}`} value={registerNo}>
                                {registerNo}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  {rangeRegistersLoading ? <p className="text-xs text-text-muted">Loading register occupancy...</p> : null}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-bold text-text-main uppercase tracking-wide">Value Mapping</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {MACHINE_MODBUS_TUNING_FIELD_CONFIG.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1">
                          {field.label}
                          {field.required && <span className="text-primary">*</span>}
                        </label>
                        <input
                          type={field.type || "text"}
                          value={formData.plcConfig?.[field.key] ?? ""}
                          onChange={(event) => updatePlcConfigField(field.key, event.target.value)}
                          required={field.required}
                          placeholder={field.placeholder || ""}
                          className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : isSlmpProtocol ? (
              <div className="mt-6 border border-border rounded-2xl p-4 bg-bg-dark/40 space-y-5">
                <p className="text-sm font-bold text-text-main uppercase tracking-wide">PLC Binding</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">
                      PLC IP <span className="text-primary">*</span>
                    </label>
                    <input
                      value={formData.plcIp}
                      onChange={(event) => updateField("plcIp", event.target.value)}
                      placeholder="192.168.0.10"
                      required
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">
                      PLC Port <span className="text-primary">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.plcPort}
                      onChange={(event) => updateField("plcPort", event.target.value)}
                      placeholder="5010"
                      required
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">PLC Range (Optional)</label>
                    <select
                      value={formData.plcRangeId}
                      onChange={(event) => updateSelectedRange(event.target.value)}
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    >
                      <option value="">No range</option>
                      {selectableRanges.map((range) => (
                        <option key={range.id} value={range.id}>
                          {range.rangeName} ({range.rangeStart}-{range.rangeEnd})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">SLMP Device Code</label>
                    <select
                      value={formData.plcSlmpDevice}
                      onChange={(event) => updateField("plcSlmpDevice", event.target.value)}
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    >
                      {SLMP_DEVICE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-dark/70 px-3 py-2 text-xs text-text-muted">
                    Use `plcSignalMap` to override device codes per signal when needed.
                  </div>
                </div>

                {rangeRegistersError ? (
                  <div className="rounded-xl border border-danger/40 bg-danger/10 text-danger px-3 py-2 text-xs">
                    {rangeRegistersError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-bold text-text-main uppercase tracking-wide">Handshake Mapping</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {MACHINE_REGISTER_ROLE_FIELDS.map((field) => {
                      const required = ["startRegister", "statusRegister"].includes(field.key);
                      const useRangeRegisters = Boolean(formData.plcRangeId);
                      const options = useRangeRegisters ? getRoleRegisterOptions(field.key) : [];
                      return (
                        <div key={field.key} className="space-y-1">
                          <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1">
                            {field.label}
                            {required && <span className="text-primary">*</span>}
                          </label>
                          {useRangeRegisters ? (
                            <select
                              value={formData.plcConfig?.[field.key] ?? ""}
                              onChange={(event) => updatePlcConfigField(field.key, event.target.value)}
                              required={required}
                              disabled={rangeRegistersLoading}
                              className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none disabled:opacity-60"
                            >
                              <option value="">Select register</option>
                              {options.map((registerNo) => (
                                <option key={`${field.key}-${registerNo}`} value={registerNo}>
                                  {registerNo}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              value={formData.plcConfig?.[field.key] ?? ""}
                              onChange={(event) => updatePlcConfigField(field.key, event.target.value)}
                              required={required}
                              placeholder="Register No"
                              className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {rangeRegistersLoading ? <p className="text-xs text-text-muted">Loading register occupancy...</p> : null}
                </div>

                {slmpRegisterConflicts?.local?.length ? (
                  <div className="rounded-xl border border-danger/40 bg-danger/10 text-danger px-3 py-2 text-xs space-y-1">
                    <p className="font-semibold uppercase tracking-wide text-[10px]">Duplicate Registers In This Machine</p>
                    {slmpRegisterConflicts.local.map((message, index) => (
                      <p key={`slmp-local-${index}`}>{message}</p>
                    ))}
                  </div>
                ) : null}

                {slmpRegisterConflicts?.peer?.length ? (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 text-warning px-3 py-2 text-xs space-y-1">
                    <p className="font-semibold uppercase tracking-wide text-[10px]">Registers Already Used On This PLC</p>
                    {slmpRegisterConflicts.peer.map((message, index) => (
                      <p key={`slmp-peer-${index}`}>{message}</p>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-bold text-text-main uppercase tracking-wide">Value Mapping</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {MACHINE_MODBUS_TUNING_FIELD_CONFIG.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1">
                          {field.label}
                          {field.required && <span className="text-primary">*</span>}
                        </label>
                        <input
                          type={field.type || "text"}
                          value={formData.plcConfig?.[field.key] ?? ""}
                          onChange={(event) => updatePlcConfigField(field.key, event.target.value)}
                          required={field.required}
                          placeholder={field.placeholder || ""}
                          className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 border border-border rounded-2xl p-4 bg-bg-dark/40 space-y-4">
                <p className="text-sm font-bold text-text-main uppercase tracking-wide">PLC Binding</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">
                      PLC IP <span className="text-primary">*</span>
                    </label>
                    <input
                      value={formData.plcIp}
                      onChange={(event) => updateField("plcIp", event.target.value)}
                      placeholder="192.168.0.10"
                      required
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-muted uppercase">
                      PLC Port <span className="text-primary">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.plcPort}
                      onChange={(event) => updateField("plcPort", event.target.value)}
                      placeholder="5000"
                      required
                      className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main focus:border-primary/50 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 border border-border rounded-2xl p-4 bg-bg-dark/40 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-text-main uppercase tracking-wide">Advanced Signal Map (Optional)</p>
                {isSlmpProtocol ? (
                  <button
                    type="button"
                    onClick={handleRegenerateSlmpSignalMap}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-dark px-3 py-1.5 text-[11px] font-semibold text-text-main hover:border-primary/60"
                  >
                    <RefreshCw size={14} />
                    Regenerate SLMP Map
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-text-muted">
                For protocol-specific I/O mapping (including SLMP), provide JSON array/object. If blank, default TRIGGER/INTERLOCK/COMPLETE/RESET mapping is used.
              </p>
              <textarea
                rows={8}
                value={formData.plcSignalMap}
                onChange={(event) => updateField("plcSignalMap", event.target.value)}
                placeholder={'[{"key":"TRIGGER","label":"START_CMD","register":100,"direction":"PC -> PLC","writable":true,"device":"D"}]'}
                className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main font-mono text-xs focus:border-primary/50 outline-none"
              />
            </div>

            <div className="flex justify-end mt-8 gap-4 pt-6 border-t border-border">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-3 text-text-muted hover:text-text-main transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-primary px-8 py-3 rounded-xl text-bg-dark font-bold flex gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/10"
              >
                <Save size={18} /> {editingMachine ? "Update" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default MachinePage;
