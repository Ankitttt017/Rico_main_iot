export const PLC_LATEST_POLL_MS = Number(import.meta.env.VITE_PLC_LATEST_POLL_MS || 5000);

export const MACHINE_NAMES = {};

export const DEFAULT_MACHINES = [];

export function getMachineKey(machine = {}) {
  return machine.key || machine.machine_key || machine.ip;
}

const machineNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function getMachineLabel(machine = {}) {
  return machine.name || MACHINE_NAMES[machine.ip] || machine.machine_name || getMachineKey(machine) || machine.ip || "";
}

function getMachineSortParts(machine = {}) {
  const label = getMachineLabel(machine);
  const normalized = String(label || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/([a-z])\s+(\d)/gi, "$1$2")
    .replace(/(\d)\s+([a-z])/gi, "$1$2");
  const match = normalized.match(/^(.*?)(?:-?\s*0*(\d+))$/);
  return {
    family: match ? match[1].replace(/[-\s]+$/g, "") : normalized,
    number: match ? Number(match[2]) : Number.MAX_SAFE_INTEGER,
    label: normalized,
  };
}

export function sortMachinesBySeries(source = []) {
  return [...source].sort((a, b) => {
    const aParts = getMachineSortParts(a);
    const bParts = getMachineSortParts(b);
    const familyDiff = machineNameCollator.compare(aParts.family, bParts.family);
    if (familyDiff !== 0) return familyDiff;
    if (aParts.number !== bParts.number) return aParts.number - bParts.number;
    return machineNameCollator.compare(aParts.label, bParts.label);
  });
}

export function mergeMachineList(list = []) {
  const byKey = new Map(DEFAULT_MACHINES.map((machine) => [getMachineKey(machine), machine]));
  list.forEach((machine) => {
    const key = getMachineKey(machine);
    const defaultMachine = byKey.get(key);
    const registerConfig = Array.isArray(machine.registerConfig)
      ? machine.registerConfig
      : Array.isArray(machine.register_config)
        ? machine.register_config
        : defaultMachine?.registerConfig;
    byKey.set(key, {
      ...(defaultMachine || {}),
      ...machine,
      registerConfig,
      register_config: registerConfig,
      connected: machine.connected,
      error: machine.error,
      lastCycleAt: machine.lastCycleAt,
      lastShotNumber: machine.lastShotNumber,
      partName: machine.partName,
      cycleTime: machine.cycleTime,
    });
  });
  return sortMachinesBySeries(Array.from(byKey.values()));
}

export const REGISTER_GROUPS = [];

export const PARAMETER_NAMES = REGISTER_GROUPS.flatMap((group) => group.keys.map((item) => item.name));
export const PARAMETER_NAMES_BY_KIND = REGISTER_GROUPS.reduce((acc, group) => {
  acc[group.kind] = acc[group.kind] || new Set();
  group.keys.forEach((item) => acc[group.kind].add(item.name));
  return acc;
}, {});
export const HIDDEN_DB_FIELDS = new Set([
  "id",
  "rn",
  "created_at",
  "updated_at",
  "recorded_at",
  "raw_readings_json",
  "is_online",
  "has_data",
  "error",
  "db_status",
]);
export const DISPLAY_LABELS = {
  recorded_at: "Recorded At",
  created_at: "Created At",
  updated_at: "Updated At",
  machine_name: "Machine",
  machine_key: "Machine Key",
  machine_type: "Machine Type",
  plc_ip: "PLC IP",
  plc_port: "PLC Port",
  machine: "Machine",
  ip: "IP",
  status: "Status",
};

