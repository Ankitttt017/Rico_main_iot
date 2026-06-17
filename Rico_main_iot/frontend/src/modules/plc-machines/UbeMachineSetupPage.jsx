import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Activity, CheckCircle2, FileSpreadsheet, Pencil, Plus, Power, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import SearchableSelect from "../../components/common/SearchableSelect";
import AppLayout from "../../components/common/AppLayout";
import {
  deletePlcMachineConfig,
  getLocations,
  getMachines,
  getPlcMachineConfigs,
  savePlcRegisterTemplate,
  savePlcMachineConfig,
  testPlcMachineConfig,
} from "../../services/api";

export const DEFAULT_PLC_DRAFT = {
  machine_id: null,
  machine_key: "",
  machine_name: "",
  machine_type: "ube",
  ip_address: "",
  port: "",
  protocol: "SLMP",
  register_profile_key: "UBE_850T",
  sequence_no: null,
  is_active: true,
  register_config: [],
  notes: "",
};

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50";
const cardClass = "rounded-lg border border-slate-200 bg-white shadow-sm";
const textareaClass = "min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50";
const PROTOCOL_OPTIONS = [
  { value: "GENERIC_TCP_TEXT", label: "Generic TCP Text" },
  { value: "MODBUS_TCP", label: "Modbus TCP" },
  { value: "SLMP", label: "SLMP (Mitsubishi)" },
];

function protocolLabel(value) {
  return PROTOCOL_OPTIONS.find((protocol) => protocol.value === value)?.label || value || "SLMP (Mitsubishi)";
}

function isActiveLocation(location = {}) {
  return location.is_active !== false && location.is_active !== 0 && location.is_active !== "0";
}

function firstTemplateForType(registerTemplates = [], type = "ube") {
  return registerTemplates.find((template) => template.machine_type === type && template.is_active !== false);
}

function nextDraft(_machines = [], type = "ube", defaultRegistersByType = {}, registerTemplates = []) {
  const template = firstTemplateForType(registerTemplates, type);
  return {
    ...DEFAULT_PLC_DRAFT,
    machine_type: type,
    register_profile_key: template?.template_key || profileForType(type),
    register_config: template?.register_config || getDefaultRegisters(defaultRegistersByType, type),
  };
}

export function getMachineType(machine = {}) {
  return machine.machine_type === "leaktest" ? "leaktest" : "ube";
}

export function getDefaultRegisters(defaultRegistersByType, type) {
  return defaultRegistersByType?.[type] || [];
}

export function profileForType(type) {
  return type === "leaktest" ? "LEAK_TEST" : "UBE_850T";
}

function cleanTemplateKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function keyFromMachine(machine = {}) {
  return String(machine.machine_code || machine.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function machineTypeLabel(type) {
  return type === "leaktest" ? "Leak Test" : "Die Casting / PLC";
}

export function inferAssetType(machine = {}) {
  const haystack = `${machine.asset || ""} ${machine.category || ""} ${machine.name || ""} ${machine.machine_code || ""}`.toLowerCase();
  return haystack.includes("leak") ? "leaktest" : "ube";
}

function displayMachineLabel(machine = {}) {
  const name = machine.name || machine.machine_code || "Machine";
  return machine.machine_code && machine.machine_code !== name ? `${name} (${machine.machine_code})` : name;
}

function getRegisterAddress(register = {}) {
  return register.device || register.stringDevice || "";
}

function setRegisterAddressValue(register = {}, value = "") {
  const address = String(value || "").trim().toUpperCase();
  if ((register.type || "").toLowerCase() === "text") {
    return { ...register, stringDevice: address, device: "" };
  }
  return { ...register, device: address, stringDevice: "" };
}

function setRegisterTypeValue(register = {}, type = "int") {
  const next = { ...register, type };
  const address = getRegisterAddress(register);
  if (type === "text") {
    next.stringDevice = address;
    next.device = "";
    next.stringLength = register.stringLength || 1;
  } else {
    next.device = address;
    next.stringDevice = "";
  }
  return next;
}

export function withRegisterDefaults(machine, defaultRegistersByType) {
  const type = getMachineType(machine);
  return {
    ...machine,
    machine_type: type,
    protocol: machine.protocol || "SLMP",
    register_profile_key: machine.register_profile_key || profileForType(type),
    register_config: Array.isArray(machine.register_config) && machine.register_config.length
      ? machine.register_config
      : getDefaultRegisters(defaultRegistersByType, type),
  };
}

function splitDelimitedLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  const delimiter = line.includes("\t") ? "\t" : ",";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseRegisterImport(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : parsed.registers || parsed.register_config || [];
    if (!Array.isArray(rows)) return [];
    return rows;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitDelimitedLine(lines[0]).map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  );

  return lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function normalizeImportedRegisters(rows = []) {
  return rows
    .map((row, index) => {
      const name = row.name || row.parameter || row.parameter_name || row.register || row.label || "";
      const device = row.device || row.plc_device || row.address || "";
      const type = String(row.type || row.data_type || "int").trim().toLowerCase();
      const enabledValue = row.enabled ?? row.use ?? row.active ?? true;
      const enabled = typeof enabledValue === "boolean"
        ? enabledValue
        : !["0", "false", "no", "n", "off"].includes(String(enabledValue).trim().toLowerCase());

      if (!name && !device) return null;
      return {
        id: row.id || `import-${Date.now()}-${index}`,
        name,
        device: String(device || "").trim().toUpperCase(),
        stringDevice: row.stringDevice || row.string_device || "",
        stringLength: row.stringLength || row.string_length || row.length || "",
        type: ["int", "decimal", "dword", "text", "real32", "uint16", "uint32", "bool", "bit"].includes(type) ? type : "int",
        scale: row.scale || 1,
        computed: row.computed || "",
        enabled,
        min: row.min ?? row.minimum ?? "",
        max: row.max ?? row.maximum ?? "",
        warning_min: row.warning_min ?? row.warningMin ?? "",
        warning_max: row.warning_max ?? row.warningMax ?? "",
        unit: row.unit || "",
        show_on_monitor: row.show_on_monitor ?? row.showOnMonitor ?? true,
        show_to_operator: row.show_to_operator ?? row.showToOperator ?? false,
        log_history: row.log_history ?? row.logHistory ?? true,
        alarm_enabled: row.alarm_enabled ?? row.alarmEnabled ?? false,
      };
    })
    .filter(Boolean);
}

export function MachineForm({
  draft,
  setDraft,
  onSave,
  onTest,
  saving,
  testing,
  testResult,
  defaultRegistersByType,
  registerTemplates,
  machineAssets = [],
  locationOptions = [],
  plantFilter = "",
  setPlantFilter = () => {},
  onImportRegisters,
  showMachineSelector = true,
  showActions = true,
  title = "Add / Edit PLC Configuration",
  description = "Step 3: select an existing machine, then add PLC IP, port, protocol and register limits.",
}) {
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const setField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));
  const setMachineAsset = (machineId) => {
    const selected = machineAssets.find((machine) => String(machine.id) === String(machineId));
    const nextType = selected ? inferAssetType(selected) : getMachineType(draft);
    setDraft((prev) => ({
      ...prev,
      machine_id: machineId || null,
      machine_key: selected ? keyFromMachine(selected) : prev.machine_key,
      machine_name: selected ? selected.name || selected.machine_code : prev.machine_name,
      machine_type: nextType,
      register_profile_key: firstTemplateForType(registerTemplates, nextType)?.template_key || profileForType(nextType),
      register_config: selected ? (firstTemplateForType(registerTemplates, nextType)?.register_config || getDefaultRegisters(defaultRegistersByType, nextType)) : prev.register_config,
    }));
  };
  const applyTemplate = (templateKey, forcedType = null) => {
    const template = registerTemplates.find((item) => item.template_key === templateKey);
    if (!template) return;
    setDraft((prev) => ({
      ...prev,
      machine_type: forcedType || template.machine_type || prev.machine_type,
      register_profile_key: template.template_key,
      register_config: template.register_config || [],
    }));
  };
  const setMachineType = (type) => {
    const template = firstTemplateForType(registerTemplates, type);
    setDraft((prev) => ({
      ...prev,
      machine_type: type,
      register_profile_key: template?.template_key || profileForType(type),
      register_config: template?.register_config || getDefaultRegisters(defaultRegistersByType, type),
    }));
  };
  const importRegisters = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".pdf")) {
      toast.error("Please save Excel/PDF as CSV or JSON, then import it here.");
      return;
    }

    try {
      const text = await file.text();
      const imported = normalizeImportedRegisters(parseRegisterImport(text));
      if (!imported.length) {
        toast.error("No register rows found in import file.");
        return;
      }
      onImportRegisters(imported);
      toast.success(`${imported.length} registers imported.`);
    } catch (error) {
      toast.error(error.message || "Unable to import register file.");
    }
  };

  const machineOptions = useMemo(() => {
    return machineAssets
      .filter((machine) => !plantFilter || String(machine.plant_code || "") === String(plantFilter))
      .filter((machine) => !assetTypeFilter || inferAssetType(machine) === assetTypeFilter)
      .map((machine) => {
        const plantLabel = locationOptions.find((item) => String(item.value) === String(machine.plant_code))?.label || machine.plant_code || "No location";
        return {
          value: String(machine.id),
          label: displayMachineLabel(machine),
          description: `${plantLabel} - ${machine.category || "No department"} - ${machine.line_name || "No line"}`,
          keywords: `${machine.name || ""} ${machine.machine_code || ""} ${machine.asset || ""} ${machine.category || ""} ${plantLabel} ${machine.line_name || ""}`,
        };
      });
  }, [assetTypeFilter, locationOptions, machineAssets, plantFilter]);
  const templateOptions = useMemo(() => {
    const type = getMachineType(draft);
    return registerTemplates
      .filter((template) => template.machine_type === type)
      .map((template) => ({
        value: template.template_key,
        label: template.template_name,
        description: `${template.template_key} - ${(template.register_config || []).length} registers${template.is_system ? " - System" : ""}`,
        keywords: `${template.template_key} ${template.template_name} ${template.notes || ""}`,
      }));
  }, [draft, registerTemplates]);

  return (
    <section className={cardClass}>
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-xs font-bold text-slate-400">{description}</p>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
          <h3 className="mb-4 text-xs font-black uppercase tracking-wide text-slate-500">PLC Connection</h3>
          {showMachineSelector && (
            <div className="mb-4 grid gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-blue-700">Filter Location</span>
                <select className={inputClass} value={plantFilter} onChange={(event) => setPlantFilter(event.target.value)}>
                  <option value="">All Locations</option>
                  {locationOptions.map((location) => (
                    <option key={location.value} value={location.value}>{location.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-blue-700">Filter Machine Type</span>
                <select className={inputClass} value={assetTypeFilter} onChange={(event) => setAssetTypeFilter(event.target.value)}>
                  <option value="">All Machine Types</option>
                  <option value="leaktest">Leak Test</option>
                  <option value="ube">Die Casting / PLC</option>
                </select>
              </label>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {showMachineSelector && (
              <label className="md:col-span-2">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Select Machine</span>
                <SearchableSelect
                  value={draft.machine_id ? String(draft.machine_id) : ""}
                  options={machineOptions}
                  placeholder="Type Leak Test, machine code, department or location..."
                  inputClassName={inputClass}
                  maxVisible={120}
                  onChange={setMachineAsset}
                />
                <p className="mt-1 text-[11px] font-bold text-slate-400">
                  Showing {machineOptions.length} of {machineAssets.length} Machine Master assets.
                </p>
              </label>
            )}
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Machine Type</span>
              <select className={inputClass} value={getMachineType(draft)} onChange={(event) => setMachineType(event.target.value)}>
                <option value="ube">Die Casting / PLC</option>
                <option value="leaktest">Leak Test</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Register Template</span>
              <SearchableSelect
                value={draft.register_profile_key || ""}
                options={templateOptions}
                placeholder="Select template..."
                inputClassName={inputClass}
                onChange={(value) => applyTemplate(value)}
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Selected Machine Name</span>
              <input className={inputClass} value={draft.machine_name} onChange={(event) => setField("machine_name", event.target.value)} placeholder="Select a machine asset above" />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">PLC IP Address</span>
              <input className={inputClass} value={draft.ip_address} onChange={(event) => setField("ip_address", event.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">PLC Port</span>
              <input className={inputClass} type="number" min="1" max="65535" value={draft.port || ""} onChange={(event) => setField("port", event.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Protocol</span>
              <select className={inputClass} value={draft.protocol || "SLMP"} onChange={(event) => setField("protocol", event.target.value)}>
                {PROTOCOL_OPTIONS.map((protocol) => (
                  <option key={protocol.value} value={protocol.value}>{protocol.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Status</span>
              <select className={inputClass} value={draft.is_active ? "1" : "0"} onChange={(event) => setField("is_active", event.target.value === "1")}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <label className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Notes</span>
            <textarea className={textareaClass} value={draft.notes || ""} onChange={(event) => setField("notes", event.target.value)} />
          </label>
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-white p-2 text-blue-700 shadow-sm">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-900">Import Data Registers</h3>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">Upload CSV, TSV, TXT or JSON. Columns can include parameter, device, type, min, max, warning_min, warning_max, unit and visibility flags.</p>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
                  <Upload className="h-4 w-4" />
                  Import File
                  <input type="file" accept=".csv,.tsv,.txt,.json,.xls,.xlsx,.pdf" className="hidden" onChange={importRegisters} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showActions && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <div>
          {testResult && (
            <p className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${testResult.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              <CheckCircle2 className="h-4 w-4" />
              {testResult.message}{testResult.latency_ms ? ` (${testResult.latency_ms}ms)` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onTest} disabled={testing} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <Activity className="h-4 w-4" />
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save PLC Config"}
          </button>
        </div>
      </div>}
    </section>
  );
}

export function RegisterConfigTable({ registers, setRegisters, maxHeightClass = "max-h-[390px]" }) {
  const setRegisterField = (index, field, value) => {
    setRegisters((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };
  const setRegisterAddress = (index, value) => {
    setRegisters((current) => current.map((item, itemIndex) => (
      itemIndex === index ? setRegisterAddressValue(item, value) : item
    )));
  };
  const setRegisterType = (index, value) => {
    setRegisters((current) => current.map((item, itemIndex) => (
      itemIndex === index ? setRegisterTypeValue(item, value) : item
    )));
  };
  const addRegister = () => {
    setRegisters((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        name: "",
        device: "",
        type: "int",
        enabled: true,
        unit: "",
        min: "",
        max: "",
        warning_min: "",
        warning_max: "",
        show_on_monitor: true,
        show_to_operator: false,
        log_history: true,
        alarm_enabled: false,
      },
    ]);
  };

  const removeRegister = (index) => {
    setRegisters((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-black text-slate-900">Data Registers</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">Machine-wise register map. Use D/M/R addresses, string addresses and datatype here.</p>
        </div>
        <button type="button" onClick={addRegister} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
          <Plus className="h-3.5 w-3.5" />
          Add Register
        </button>
      </div>
      <div className={`${maxHeightClass} overflow-auto`}>
        <table className="min-w-[720px] w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Use</th>
              <th className="px-3 py-3">Parameter</th>
              <th className="px-3 py-3">PLC Address</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Alarm</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {registers.map((register, index) => (
              <tr key={register.id || `${register.name}-${index}`} className={register.enabled === false ? "bg-slate-50 opacity-70" : "hover:bg-slate-50"}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={register.enabled !== false} onChange={(event) => setRegisterField(index, "enabled", event.target.checked)} />
                </td>
                <td className="px-3 py-2">
                  <input className={inputClass} value={register.name || ""} onChange={(event) => setRegisterField(index, "name", event.target.value)} />
                </td>
                <td className="px-3 py-2">
                  <input className={inputClass} value={getRegisterAddress(register)} onChange={(event) => setRegisterAddress(index, event.target.value)} placeholder="D2258 / M110 / R2250" />
                </td>
                <td className="px-3 py-2">
                  <select className={inputClass} value={register.type || "int"} onChange={(event) => setRegisterType(index, event.target.value)}>
                    <option value="int">INT16</option>
                    <option value="uint16">UINT16</option>
                    <option value="uint32">UINT32</option>
                    <option value="decimal">DEC / scaled D</option>
                    <option value="dword">DWORD</option>
                    <option value="real32">REAL32</option>
                    <option value="bool">BOOL / M bit</option>
                    <option value="bit">BIT</option>
                    <option value="text">STRING / ASCII</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={register.alarm_enabled === true} onChange={(event) => setRegisterField(index, "alarm_enabled", event.target.checked)} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => removeRegister(index)} className="rounded-lg border border-red-200 px-2.5 py-2 font-black text-red-700 hover:bg-red-50">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function UbeMachineSetupPage({ onLogout, currentUser }) {
  const [machines, setMachines] = useState([]);
  const [machineAssets, setMachineAssets] = useState([]);
  const [locations, setLocations] = useState([]);
  const [registerTemplates, setRegisterTemplates] = useState([]);
  const [defaultRegistersByType, setDefaultRegistersByType] = useState({ ube: [], leaktest: [] });
  const [draft, setDraft] = useState(DEFAULT_PLC_DRAFT);
  const [plantFilter, setPlantFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    const [response, machineResponse, locationResponse] = await Promise.all([
      getPlcMachineConfigs(),
      getMachines({ _: Date.now() }),
      getLocations({ active: 1 }),
    ]);
    const rows = response.data?.data || [];
    const assetRows = Array.isArray(machineResponse.data) ? machineResponse.data : machineResponse.data?.data || [];
    const locationRows = Array.isArray(locationResponse.data?.data) ? locationResponse.data.data : [];
    const defaults = response.data?.default_registers_by_type || { ube: response.data?.default_registers || [], leaktest: [] };
    const templates = Array.isArray(response.data?.register_templates) ? response.data.register_templates : [];
    setDefaultRegistersByType(defaults);
    setMachines(rows);
    const activeLocationCodes = new Set(locationRows.filter(isActiveLocation).map((location) => String(location.code || "").trim()).filter(Boolean));
    const activeLocationAssets = assetRows.filter((machine) => {
      const plantCode = String(machine.plant_code || "").trim();
      return !plantCode || activeLocationCodes.has(plantCode);
    });
    setMachineAssets(activeLocationAssets);
    setLocations(locationRows.filter(isActiveLocation));
    setRegisterTemplates(templates);
    return { rows, defaults, templates };
  };

  useEffect(() => {
    setLoading(true);
    load()
      .then(({ defaults, templates }) => setDraft(nextDraft([], "ube", defaults, templates)))
      .catch((error) => toast.error(error.response?.data?.message || "Unable to load UBE machine setup"))
      .finally(() => setLoading(false));
  }, []);

  const locationOptions = useMemo(() => {
    const byCode = new Map();
    locations.forEach((location) => {
      const code = String(location.code || "").trim();
      if (!code) return;
      byCode.set(code, {
        value: code,
        label: `${location.name || code}${location.address ? ` (${location.address})` : ""}`,
      });
    });
    machineAssets.forEach((machine) => {
      const code = String(machine.plant_code || "").trim();
      if (code && !byCode.has(code)) byCode.set(code, { value: code, label: code });
    });
    return Array.from(byCode.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [locations, machineAssets]);

  const assetById = useMemo(() => {
    return new Map(machineAssets.map((machine) => [String(machine.id), machine]));
  }, [machineAssets]);

  const getConfigPlantCode = (machine) => {
    return machine.plant_code || assetById.get(String(machine.machine_id || ""))?.plant_code || "";
  };

  const filteredMachines = useMemo(() => {
    return machines.filter((machine) => !plantFilter || String(getConfigPlantCode(machine)) === String(plantFilter));
  }, [assetById, machines, plantFilter]);

  const activeMachines = useMemo(() => filteredMachines.filter((machine) => machine.is_active), [filteredMachines]);

  const portSummary = useMemo(() => {
    const ports = Array.from(new Set(filteredMachines.map((machine) => Number(machine.port || 5002)).filter(Boolean)));
    if (!ports.length) return "5002";
    if (ports.length === 1) return String(ports[0]);
    return `${ports.length} ports`;
  }, [filteredMachines]);

  const save = async () => {
    setSaving(true);
    try {
      const type = getMachineType(draft);
      await savePlcMachineConfig({
        ...draft,
        machine_type: type,
        register_profile_key: draft.register_profile_key || profileForType(type),
        port: Number(draft.port || 5002),
        register_config: draft.register_config || getDefaultRegisters(defaultRegistersByType, type),
      });
      toast.success("PLC configuration saved. Monitor will pick it up automatically.");
      const { rows, defaults, templates } = await load();
      setDraft(nextDraft(rows, type, defaults, templates));
      setTestResult(null);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save PLC configuration");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await testPlcMachineConfig({ ...draft, port: Number(draft.port || 5002) });
      setTestResult(response.data);
      toast.success(response.data?.message || "Connection successful");
    } catch (error) {
      const payload = error.response?.data || { connected: false, message: error.message };
      setTestResult(payload);
      toast.error(payload.message || "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const editMachine = (machine) => {
    setDraft(withRegisterDefaults(machine, defaultRegistersByType));
    setTestResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createNewMachine = () => {
    setDraft(nextDraft(machines, getMachineType(draft), defaultRegistersByType, registerTemplates));
    setTestResult(null);
  };

  const toggleMachineStatus = async (machine) => {
    setTogglingId(machine.id);
    try {
      await savePlcMachineConfig({ ...machine, is_active: !machine.is_active, port: Number(machine.port || 5002) });
      toast.success(`${machine.machine_name} ${machine.is_active ? "deactivated" : "activated"}.`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update machine status");
    } finally {
      setTogglingId(null);
    }
  };

  const deleteMachine = async (machine) => {
    if (!machine.id) return toast.error("Machine id missing. Refresh and try again.");
    const ok = window.confirm(`Delete ${machine.machine_name}? Existing production readings will remain, but this PLC will be removed from setup and monitoring.`);
    if (!ok) return;

    setDeletingId(machine.id);
    try {
      await deletePlcMachineConfig(machine.id);
      toast.success(`${machine.machine_name} deleted from setup.`);
      const remaining = machines.filter((item) => item.id !== machine.id);
      setDraft(nextDraft(remaining, getMachineType(draft), defaultRegistersByType, registerTemplates));
      setTestResult(null);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to delete machine");
    } finally {
      setDeletingId(null);
    }
  };

  const importRegistersIntoDraft = (importedRegisters) => {
    setDraft((current) => ({
      ...current,
      register_config: importedRegisters,
    }));
  };

  const saveCurrentAsTemplate = async () => {
    const name = window.prompt("Template name likho, jaise Leak Test - Vendor A");
    if (!name) return;
    try {
      const type = getMachineType(draft);
      const templateKey = cleanTemplateKey(name);
      await savePlcRegisterTemplate({
        template_key: templateKey,
        template_name: name,
        machine_type: type,
        register_config: draft.register_config || getDefaultRegisters(defaultRegistersByType, type),
        notes: `Created from ${draft.machine_name || machineTypeLabel(type)} PLC config`,
      });
      toast.success("Register template saved.");
      const { templates } = await load();
      setDraft((current) => ({
        ...current,
        register_profile_key: templateKey,
        register_config: templates.find((template) => template.template_key === templateKey)?.register_config || current.register_config,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save template");
    }
  };

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Master Setup / Machine Manager</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">PLC Config / Tags</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Configure PLC connection only after the machine exists in Machine Master.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={createNewMachine} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" />
              Add PLC Config
            </button>
            <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Configured</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{filteredMachines.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Active</p>
            <p className="mt-2 text-2xl font-black text-emerald-600">{activeMachines.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Ports</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{portSummary}</p>
          </div>
        </div>

        <MachineForm
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onTest={test}
          saving={saving}
          testing={testing}
          testResult={testResult}
          defaultRegistersByType={defaultRegistersByType}
          registerTemplates={registerTemplates}
          machineAssets={machineAssets}
          locationOptions={locationOptions}
          plantFilter={plantFilter}
          setPlantFilter={setPlantFilter}
          onImportRegisters={importRegistersIntoDraft}
        />

        <RegisterConfigTable
          registers={draft.register_config || getDefaultRegisters(defaultRegistersByType, getMachineType(draft))}
          setRegisters={(updater) => setDraft((current) => ({
            ...current,
            register_config: typeof updater === "function"
              ? updater(current.register_config || getDefaultRegisters(defaultRegistersByType, getMachineType(current)))
              : updater,
          }))}
        />
        <div className="-mt-2 flex justify-end">
          <button type="button" onClick={saveCurrentAsTemplate} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100">
            <Save className="h-4 w-4" />
            Save Current Registers as Template
          </button>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-black text-slate-900">Saved Machines</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-4 py-3">PLC</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-sm font-bold text-slate-400">Loading...</td></tr>
                ) : filteredMachines.map((machine) => (
                  <tr key={machine.machine_key} className={`hover:bg-slate-50 ${draft.id === machine.id ? "bg-blue-50/60" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-950">{machine.machine_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono font-black text-slate-800">{machine.ip_address}:{machine.port}</p>
                      <p className="text-xs font-bold text-slate-400">{protocolLabel(machine.protocol)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black uppercase text-blue-700">{machineTypeLabel(getMachineType(machine))}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${machine.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {machine.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => editMachine(machine)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-700">
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMachineStatus(machine)}
                          disabled={togglingId === machine.id}
                          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-black disabled:opacity-60 ${machine.is_active ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {togglingId === machine.id ? "Saving" : machine.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMachine(machine)}
                          disabled={deletingId === machine.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingId === machine.id ? "Deleting" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !filteredMachines.length && (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-sm font-bold text-slate-400">No machines configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
