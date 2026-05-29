import React, { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "../components/common/AppLayout";
import Pagination from "../components/common/Pagination";
import SearchableSelect from "../components/common/SearchableSelect";
import {
  createLine,
  createLineMachine,
  deleteLine,
  getLineMachines,
  getLineOperations,
  getLines,
  getRawMasterData,
  removeLineMachine,
  updateLine,
  updateLineMachine,
} from "../services/api";

const PAGE_SIZE = 50;

const PLANTS = [
  { code: "1002", name: "Gurugram Plant" },
  { code: "1008", name: "Bawal Plant" },
  { code: "PATHREDI", name: "Pathredi Plant" },
  { code: "CHENNAI", name: "Chennai Plant" },
];

const PLANT_OPTIONS = PLANTS.map((plant) => ({
  value: plant.code,
  label: `${plant.name} (${plant.code})`,
  description: plant.name,
  keywords: `${plant.name} ${plant.code}`,
}));

const DIVISION_OPTIONS = [
  { value: "HPDC", label: "1. HPDC", keywords: "hpdc" },
  { value: "Machining", label: "2. Machining", keywords: "machining machine shop mcs machine" },
];

const FILTER_DIVISION_OPTIONS = [
  { value: "", label: "All Divisions" },
  ...DIVISION_OPTIONS,
];

const STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

const FILTER_STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  ...STATUS_OPTIONS,
];

const PROTOCOL_OPTIONS = [
  { value: "SLMP", label: "SLMP" },
  { value: "TCP/IP", label: "TCP/IP", keywords: "tcp ip ethernet" },
];

const FILTER_PROTOCOL_OPTIONS = [
  { value: "", label: "All Protocols" },
  ...PROTOCOL_OPTIONS,
];

const FALLBACK_OPERATIONS = [
  ["OP-10", "Incoming Inspection (Aluminium Alloy Ingots)"],
  ["OP-20A", "Melting of Aluminium Alloy Ingots"],
  ["OP-20B", "Degassing & Metal Treatment of Molten Metal"],
  ["OP-20C", "Holding of Molten Metal for Casting"],
  ["OP-30", "Die Casting"],
  ["OP-40", "Trimming"],
  ["OP-50", "Shot Blasting"],
  ["OP-50B", "Final Inspection (Casting)"],
  ["OP-60", "Face Milling, Drilling, Reaming, Tapping & Boring"],
  ["OP-70", "Pre-Inspection"],
  ["OP-80", "Marking (Dot Marking)"],
  ["OP-90", "Leak Testing"],
  ["OP-100", "Ultrasonic Washing"],
  ["OP-110", "Final Inspection / Visual Inspection"],
  ["OP-120", "Packaging"],
].map(([operation_no, operation_name]) => ({ operation_no, operation_name }));

const emptyLine = {
  plant: "Gurugram Plant",
  line_name: "",
  division: "HPDC",
  is_active: true,
};

const emptyMachine = {
  id: null,
  machine_code: "",
  name: "",
  ip_address: "",
  port: "",
  protocol: "SLMP",
  part_name: "",
  operation_no: "OP-10",
};

const normalizeProtocolLabel = (protocol) => {
  const compact = String(protocol || "").replace(/[\s/]+/g, "").toLowerCase();
  if (compact === "tcpip" || compact === "tcpmodbus" || compact === "modbustcp") return "TCP/IP";
  return protocol || "SLMP";
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
    {children}
  </label>
);

const inputClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-50";

const TextInput = (props) => <input {...props} className={inputClass} />;
const SelectInput = (props) => <select {...props} className={inputClass} />;

const getPlantByCode = (code) => PLANTS.find((plant) => plant.code === code) || PLANTS[0];

const getPlantCodeFromValue = (value, fallbackCode = "1002") => {
  const text = String(value || "").trim();
  if (!text) return fallbackCode;
  const byCode = PLANTS.find((plant) => plant.code === text);
  if (byCode) return byCode.code;
  const byName = PLANTS.find((plant) => text.toLowerCase().includes(plant.name.toLowerCase().split(" ")[0]));
  if (byName) return byName.code;
  if (/bawal/i.test(text)) return "1008";
  if (/gurugram|gurgaon/i.test(text)) return "1002";
  return fallbackCode;
};

const getLinePlantCode = (line = {}, fallbackCode = "1002") =>
  getPlantCodeFromValue(line.plant_code || line.plant, fallbackCode);

const getLineProtocolLabels = (line = {}) => {
  const labels = [];
  if (Number(line.has_slmp)) labels.push("SLMP");
  if (Number(line.has_tcp_modbus)) labels.push("TCP/IP");
  if (!labels.length && line.primary_protocol) labels.push(line.primary_protocol);
  return labels;
};

const divisionMatches = (lineDivision, selectedDivision) => {
  if (!selectedDivision) return true;
  const lineText = String(lineDivision || "").toLowerCase();
  const selectedText = String(selectedDivision || "").toLowerCase();
  if (selectedText.includes("machining") || selectedText.includes("machine")) {
    return lineText.includes("machining") || lineText.includes("machine") || lineText.includes("mcs");
  }
  return lineText.includes(selectedText);
};

const lineMatchesProtocol = (line, protocol) => {
  if (!protocol) return true;
  const compact = String(protocol).replace(/\s+/g, "").toLowerCase();
  if (compact === "slmp") return Number(line.has_slmp) === 1 || String(line.primary_protocol || "").toLowerCase() === "slmp";
  if (compact === "tcp/ip" || compact === "tcpip" || compact === "tcpmodbus" || compact === "modbustcp") {
    const primary = String(line.primary_protocol || "").replace(/[\s/]+/g, "").toLowerCase();
    return Number(line.has_tcp_modbus) === 1 || primary === "tcpip" || primary === "tcpmodbus";
  }
  return getLineProtocolLabels(line).some((label) => label.toLowerCase() === String(protocol).toLowerCase());
};

const ActionInput = ({ value, onChange, placeholder, disabled, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div 
      className="relative flex items-center w-full"
      onMouseEnter={() => setFocused(true)}
      onMouseLeave={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <input 
        type="text" 
        value={value} 
        onChange={onChange} 
        placeholder={placeholder} 
        disabled={disabled} 
        className={`${inputClass} w-full pr-[88px]`}
        {...props} 
      />
      <div className={`absolute right-1.5 flex gap-0.5 transition-opacity duration-200 ${focused ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
         <button type="button" className="flex items-center justify-center p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors" title="Add">
           <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
         </button>
         <button type="button" className="flex items-center justify-center p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit">
           <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
         </button>
         <button type="button" className="flex items-center justify-center p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete" onClick={() => onChange({ target: { value: '' } })}>
           <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
         </button>
      </div>
    </div>
  );
};

const LineIllustration = () => (
  <svg viewBox="0 0 160 120" className="h-full w-full drop-shadow-sm" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="lineBody" x1="20" y1="20" x2="140" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3b82f6" />
        <stop offset="0.5" stopColor="#2563eb" />
        <stop offset="1" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <ellipse cx="80" cy="108" rx="60" ry="7" fill="#0f172a" opacity="0.07" />
    <rect x="18" y="72" width="124" height="16" rx="8" fill="url(#lineBody)" />
    <rect x="24" y="76" width="112" height="8" rx="4" fill="#1d4ed8" opacity="0.5" />
    {[30, 50, 70, 90, 110].map((x) => (
      <rect key={x} x={x} y="76" width="12" height="8" rx="2" fill="#60a5fa" opacity="0.4" />
    ))}
    <circle cx="26" cy="80" r="10" fill="#1e40af" />
    <circle cx="26" cy="80" r="6" fill="#3b82f6" />
    <circle cx="26" cy="80" r="2" fill="#bfdbfe" />
    <circle cx="134" cy="80" r="10" fill="#1e40af" />
    <circle cx="134" cy="80" r="6" fill="#3b82f6" />
    <circle cx="134" cy="80" r="2" fill="#bfdbfe" />
    <rect x="35" y="44" width="28" height="28" rx="4" fill="#1e40af" />
    <rect x="38" y="47" width="22" height="18" rx="2" fill="#3b82f6" />
    <circle cx="49" cy="56" r="6" fill="#93c5fd" />
    <rect x="75" y="38" width="28" height="34" rx="4" fill="#1e40af" />
    <rect x="78" y="41" width="22" height="20" rx="2" fill="#3b82f6" />
    <rect x="112" y="48" width="24" height="24" rx="4" fill="#1e40af" />
    <rect x="115" y="51" width="18" height="14" rx="2" fill="#3b82f6" />
  </svg>
);

const makeMachineDraft = (machine = {}) => ({
  id: machine.id || null,
  machine_code: machine.machine_code || "",
  name: machine.name || "",
  ip_address: machine.ip_address || "",
  port: machine.port || "",
  protocol: normalizeProtocolLabel(machine.protocol),
  part_name: machine.part_name || "",
  operation_no: machine.operation_no || "OP-10",
});

const LineWorkspaceModal = ({ initialLine, initialMachines, plant, operations, saving, onClose, onSave }) => {
  const [line, setLine] = useState(initialLine || emptyLine);
  const [machines, setMachines] = useState(initialMachines.map(makeMachineDraft));
  const [machineFormOpen, setMachineFormOpen] = useState(false);
  const [editingMachineIndex, setEditingMachineIndex] = useState(null);
  const [machineDraft, setMachineDraft] = useState(makeMachineDraft(emptyMachine));
  const [deletedMachineIds, setDeletedMachineIds] = useState([]);
  const [localError, setLocalError] = useState("");
  const isEdit = Boolean(initialLine?.line_id);

  const [dbParts, setDbParts] = useState([]);
  const [dbMachines, setDbMachines] = useState([]);

  const [dbOperations, setDbOperations] = useState(FALLBACK_OPERATIONS);

  useEffect(() => {
    if (initialLine?.line_id && !line.line_id) {
      setLine((prev) => ({ ...prev, ...initialLine }));
    }
  }, [initialLine, line.line_id]);

  const linePlantCode = getLinePlantCode(line, plant.code);

  useEffect(() => {
    if (!linePlantCode) return;
    const plantFilter = linePlantCode;

    // Fetch parts (no division filter on parts - show all)
    getRawMasterData({ plant: plantFilter, type: 'parts' })
      .then(res => setDbParts(res.data?.data || []))
      .catch(() => {});
    
    // Fetch machines with division filter
    const divParam = line.division || '';
    getRawMasterData({ plant: plantFilter, type: 'machines', division: divParam })
      .then(res => setDbMachines(res.data?.data || []))
      .catch(() => {});

    // Fetch operations
    getRawMasterData({ plant: plantFilter, type: 'operations' })
      .then(res => setDbOperations(res.data?.data && res.data.data.length > 0 ? res.data.data : FALLBACK_OPERATIONS))
      .catch(() => {});
  }, [linePlantCode, line.division]);

  const setLineField = (key, value) => setLine((prev) => ({ ...prev, [key]: value }));
  const setMachineField = (key, value) => {
    setMachineDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handlePartSelect = (partCode) => {
    const part = dbParts.find(p => p.material_code === partCode || p.description === partCode);
    if (part) {
      setMachineDraft(prev => ({
        ...prev,
        part_name: part.description,
      }));
    } else {
      setMachineDraft(prev => ({ ...prev, part_name: partCode }));
    }
  };

  const handleMachineSelect = (value) => {
    const m = dbMachines.find(x => x.name === value || x.machine_code === value);
    if (m) {
      setMachineDraft(prev => ({
        ...prev,
        machine_code: m.machine_code,
        name: m.name,
      }));
    } else {
      setMachineDraft(prev => ({ ...prev, name: value }));
    }
  };

  const filteredParts = useMemo(() => {
    if (!line.division) return dbParts;
    const divLower = line.division.toLowerCase();
    const isHPDC = divLower.includes("hpdc");
    const isMachine = divLower.includes("machine");
    const matched = dbParts.filter(p => {
      const type = (p.manufacturing_type || "").toLowerCase();
      const group = (p.material_group || "").toLowerCase();
      if (isHPDC && (type.includes("hpdc") || type.includes("die cast") || group.includes("casting"))) return true;
      if (isMachine && (type.includes("machin") || group.includes("machin"))) return true;
      return false;
    });
    return matched.length ? matched : dbParts;
  }, [dbParts, line.division]);

  const filteredMachines = useMemo(() => {
    // Backend already filters machines by division, so just deduplicate names
    const seen = new Set();
    return dbMachines.filter(m => {
      if (!m.name || seen.has(m.name)) return false;
      seen.add(m.name);
      return true;
    });
  }, [dbMachines]);

  const startAddMachine = () => {
    setEditingMachineIndex(null);
    setMachineDraft(makeMachineDraft(emptyMachine));
    setMachineFormOpen(true);
    setLocalError("");
  };

  const startEditMachine = (index) => {
    setEditingMachineIndex(index);
    setMachineDraft(makeMachineDraft(machines[index]));
    setMachineFormOpen(true);
    setLocalError("");
  };

  const cancelMachineForm = () => {
    setMachineFormOpen(false);
    setEditingMachineIndex(null);
    setMachineDraft(makeMachineDraft(emptyMachine));
  };

  const saveMachineDraft = async () => {
    const draft = { ...machineDraft };
    if (!draft.machine_code) {
      draft.machine_code = `MC-${Date.now()}`;
    }
    if (!draft.name.trim() || !draft.operation_no || !draft.protocol) {
      setLocalError("Machine save karne ke liye name, protocol aur operation required hai.");
      return;
    }

    const nextMachines = editingMachineIndex == null
      ? [...machines, draft]
      : machines.map((machine, index) => (index === editingMachineIndex ? draft : machine));

    const selectedPlantInfo = getPlantByCode(getLinePlantCode(line, plant.code));
    const finalLine = {
      ...line,
      line_code: line.line_code || `LN-${Date.now()}`,
      plant: selectedPlantInfo.name,
      plant_code: selectedPlantInfo.code,
      is_active: Boolean(line.is_active),
    };

    try {
      setLocalError("");
      const result = await onSave({
        line: finalLine,
        machines: nextMachines,
        deletedMachineIds,
        keepOpen: true,
      });
      setLine((prev) => ({ ...prev, ...(result?.line || finalLine) }));
      setMachines((result?.machines || nextMachines).map(makeMachineDraft));
      setDeletedMachineIds([]);
      cancelMachineForm();
    } catch (err) {
      setLocalError(err.response?.data?.message || err.message || "Unable to save machine.");
    }
  };

  const removeMachineRow = (index) => {
    setMachines((prev) => {
      const machine = prev[index];
      if (machine?.id) setDeletedMachineIds((ids) => [...ids, machine.id]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const submitLineOnly = async (e) => {
    e.preventDefault();
    if (!line.line_name || !line.plant || !line.division) {
      setLocalError("Please fill out line name, plant, and division.");
      return;
    }
    const selectedPlantInfo = getPlantByCode(getLinePlantCode(line, plant.code));
    const finalLine = {
      ...line,
      line_code: line.line_code || `LN-${Date.now()}`,
      plant: selectedPlantInfo.name,
      plant_code: selectedPlantInfo.code,
      is_active: Boolean(line.is_active),
    };
    try {
      const result = await onSave({
        line: finalLine,
        machines,
        deletedMachineIds,
        keepOpen: true
      });
      setLine((prev) => ({ ...prev, ...(result?.line || finalLine) }));
      setMachines((result?.machines || machines).map(makeMachineDraft));
      setDeletedMachineIds([]);
    } catch (err) {
      setLocalError(err.response?.data?.message || err.message || "Unable to save line.");
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (machineFormOpen) {
      setLocalError("Machine form open hai. Pehle machine save/cancel karo, phir final line setup save karo.");
      return;
    }

    setLocalError("");
    const selectedPlantInfo = getPlantByCode(getLinePlantCode(line, plant.code));
    const finalLine = {
      ...line,
      line_code: line.line_code || `LN-${Date.now()}`,
      plant: selectedPlantInfo.name,
      plant_code: selectedPlantInfo.code,
      is_active: Boolean(line.is_active),
    };
    onSave({
      line: finalLine,
      machines,
      deletedMachineIds,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950">{isEdit ? "Edit Line Setup" : "Add Line Setup"}</h3>
            <p className="mt-1 text-sm text-slate-500">Add one line, attach multiple machines, and assign one operation to each machine.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {localError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{localError}</div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h4 className="text-sm font-extrabold text-slate-900">Line Information</h4>
              <p className="mt-1 text-xs font-medium text-slate-400">Basic production line details are grouped in two-column tiles.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <Field label="Plant Section">
                  <SearchableSelect
                    value={linePlantCode}
                    options={PLANT_OPTIONS}
                    placeholder="Search plant..."
                    onChange={(value) => {
                      const selected = getPlantByCode(value);
                      setLine((prev) => ({ ...prev, plant: selected.name, plant_code: selected.code }));
                    }}
                  />
                </Field>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <Field label="Line Name">
                  <ActionInput required value={line.line_name || ""} onChange={(e) => setLineField("line_name", e.target.value)} placeholder="Machining Line M01" />
                </Field>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <Field label="Division">
                  <SearchableSelect
                    value={line.division || ""}
                    options={DIVISION_OPTIONS}
                    placeholder="Search division..."
                    onChange={(value) => setLineField("division", value)}
                  />
                </Field>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <Field label="Status">
                  <SearchableSelect
                    value={line.is_active ? "1" : "0"}
                    options={STATUS_OPTIONS}
                    placeholder="Search status..."
                    onChange={(value) => setLineField("is_active", value === "1")}
                  />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={submitLineOnly} disabled={saving} className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">
                {saving ? "Saving..." : "Save Line"}
              </button>
            </div>
          </div>

          {/* Part Details Removed */}

          <div className="mt-5 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">Machines Under This Line</h4>
                <p className="text-xs text-slate-400">{isEdit ? "Add one machine at a time, save it here, then final-save the line setup." : "Save this line setup first to start adding machines."}</p>
              </div>
              {isEdit && (
                <button type="button" onClick={startAddMachine} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-700">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  Add Machine
                </button>
              )}
            </div>

            {!isEdit ? (
              <div className="p-8 text-center text-sm font-semibold text-slate-400 bg-slate-50/50">
                Please save this line setup first to start adding machines.
              </div>
            ) : (
              <>

            {machineFormOpen && (
              <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h5 className="text-sm font-extrabold text-slate-900">
                    {editingMachineIndex == null ? "Add Machine Details" : "Edit Machine Details"}
                  </h5>
                  <button type="button" onClick={cancelMachineForm} className="text-xs font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <Field label="Machine Name">
                      <SearchableSelect
                        value={machineDraft.name}
                        allowCustom
                        placeholder="Search machine..."
                        options={filteredMachines.map((m) => ({
                          value: m.name,
                          label: m.name,
                          description: m.machine_code,
                          keywords: `${m.machine_code} ${m.category || ""} ${m.cost_center || ""}`,
                        }))}
                        onChange={handleMachineSelect}
                      />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <Field label="Machine IP Address">
                      <ActionInput value={machineDraft.ip_address} onChange={(e) => setMachineField("ip_address", e.target.value)} placeholder="192.168.1.10" />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <Field label="Machine Port">
                      <TextInput value={machineDraft.port} onChange={(e) => setMachineField("port", e.target.value)} placeholder="Port e.g. 8080" />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <Field label="Part Name">
                      <SearchableSelect
                        value={machineDraft.part_name}
                        placeholder="Search part..."
                        options={filteredParts.map((p) => ({
                          value: p.description,
                          label: p.description || p.material_code,
                          description: p.material_code,
                          keywords: `${p.material_code} ${p.material_group || ""} ${p.manufacturing_type || ""}`,
                        }))}
                        onChange={handlePartSelect}
                      />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <Field label="Operation">
                      <SearchableSelect
                        value={machineDraft.operation_no}
                        placeholder="Search operation..."
                        options={dbOperations.map((operation) => ({
                          value: operation.operation_no,
                          label: `${operation.operation_no} - ${operation.operation_name}`,
                          keywords: operation.operation_name,
                        }))}
                        onChange={(value) => setMachineField("operation_no", value)}
                      />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <Field label="Protocol">
                      <SearchableSelect
                        value={machineDraft.protocol}
                        placeholder="Search protocol..."
                        options={PROTOCOL_OPTIONS}
                        onChange={(value) => setMachineField("protocol", value)}
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={saveMachineDraft} disabled={saving} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
                    {saving ? "Saving..." : "Save Machine"}
                  </button>
                </div>
              </div>
            )}

            {machines.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-bold text-slate-500">No machines added under this line yet.</p>
                <p className="mt-1 text-xs text-slate-400">Use Add Machine above, fill full details, then Save Machine.</p>
              </div>
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {machines.map((machine, index) => {
                  const selectedOperation = operations.find((operation) => operation.operation_no === machine.operation_no);
                  return (
                    <div key={machine.id || `${machine.machine_code}-${index}`} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Machine</p>
                        <p className="mt-1 text-sm font-extrabold text-slate-950">{machine.name}</p>
                        <p className="mt-0.5 font-mono text-xs font-semibold text-slate-400">{machine.machine_code}</p>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Connection</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{machine.ip_address || "No IP"}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {machine.port ? `Port ${machine.port}` : "No port"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Protocol</p>
                          <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-700">{machine.protocol || "Not set"}</p>
                          <p className="mt-1 truncate text-xs text-slate-400">{machine.part_name || "No part selected"}</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg bg-teal-50 px-3 py-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-teal-600">Operation</p>
                        <p className="mt-1 text-sm font-extrabold text-teal-700">{machine.operation_no}</p>
                        <p className="mt-0.5 truncate text-xs font-medium text-teal-700/70">{selectedOperation?.operation_name || "Operation"}</p>
                      </div>
                      <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                        <button type="button" onClick={() => startEditMachine(index)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          Edit
                        </button>
                        <button type="button" onClick={() => removeMachineRow(index)} className="flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-colors">
            {isEdit ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
};

const LineCard = ({ line, onEdit, onDelete }) => {
  const protocols = getLineProtocolLabels(line);
  return (
    <article className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-slate-200/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-slate-950">{line.line_name}</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-400">{line.line_code}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${line.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {line.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-lg font-extrabold leading-none text-slate-950">{line.total_machines ?? 0}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Machines</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="truncate text-sm font-extrabold text-slate-800">{line.division || "Division"}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Division</p>
        </div>
      </div>

      <div className="mt-3 min-h-[34px]">
        {protocols.length ? (
          <div className="flex flex-wrap gap-1.5">
            {protocols.map((protocol) => (
              <span key={protocol} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold text-blue-700">
                {protocol}
              </span>
            ))}
          </div>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500">No protocol</span>
        )}
      </div>

      <div className="mt-auto flex gap-2 border-t border-slate-100 pt-3">
        <button onClick={() => onEdit(line)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-100">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          Edit Setup
        </button>
        <button onClick={() => onDelete(line)} className="flex items-center justify-center rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </article>
  );
};

const StatBox = ({ value, label }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
    <p className="text-2xl font-extrabold leading-none text-slate-950">{value}</p>
    <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
  </div>
);

const LineMasterPage = ({ onLogout, currentUser }) => {
  const [selectedPlant, setSelectedPlant] = useState(PLANTS[0]);
  const [operations, setOperations] = useState(FALLBACK_OPERATIONS);
  const [lines, setLines] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [workspaceMachines, setWorkspaceMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [page, setPage] = useState(1);

  const loadLines = useCallback(() => {
    setLoading(true);
    setError("");
    const params = {
      plant: selectedPlant.code,
      division: divisionFilter || undefined,
      status: statusFilter || undefined,
      protocol: protocolFilter || undefined,
      _: Date.now(),
    };
    const request = () => getLines(params);

    request()
      .catch((err) => {
        console.warn("Line load failed, retrying once:", err?.message || err);
        return new Promise((resolve) => setTimeout(resolve, 600)).then(request);
      })
      .then((res) => setLines(Array.isArray(res.data?.data) ? res.data.data : []))
      .catch((err) => {
        console.error("Unable to load lines:", err);
        setError("Unable to load lines. Please check backend connection.");
      })
      .finally(() => setLoading(false));
  }, [divisionFilter, protocolFilter, selectedPlant.code, statusFilter]);

  useEffect(() => {
    getLineOperations()
      .then((res) => {
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        if (rows.length) setOperations(rows);
      })
      .catch(() => setOperations(FALLBACK_OPERATIONS));
  }, []);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  useEffect(() => {
    setPage(1);
  }, [divisionFilter, protocolFilter, search, selectedPlant.code, statusFilter]);

  const openWorkspace = async (line = null) => {
    setWorkspace(line || "new");
    setWorkspaceMachines([]);
    if (!line?.line_id) return;
    setWorkspaceLoading(true);
    try {
      const res = await getLineMachines(line.line_id);
      setWorkspaceMachines(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setWorkspaceMachines([]);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const saveWorkspace = async ({ line, machines, deletedMachineIds, keepOpen }) => {
    setSaving(true);
    setError("");
    try {
      let lineId = line.line_id;
      let finalLine = line;
      if (lineId) {
        await updateLine(lineId, line);
      } else {
        const res = await createLine(line);
        lineId = res.data?.line_id;
        finalLine = { ...line, line_id: lineId };
      }

      for (const machineId of deletedMachineIds) {
        await removeLineMachine(lineId, machineId, { mode: "delete" });
      }

      const persistedMachines = [];
      for (const machine of machines) {
        if (machine.id) {
          await updateLineMachine(lineId, machine.id, machine);
          persistedMachines.push(machine);
        } else {
          const res = await createLineMachine(lineId, machine);
          persistedMachines.push({ ...machine, id: res.data?.id || machine.id });
        }
      }

      if (!keepOpen) {
        setWorkspace(null);
        setWorkspaceMachines([]);
      } else {
        setWorkspace(finalLine);
        setWorkspaceMachines(persistedMachines);
      }
      loadLines();
      return { line: finalLine, machines: persistedMachines };
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save line setup.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteLine = async (line) => {
    if (!window.confirm(`Delete ${line.line_name}? Machines will be detached from this line.`)) return;
    setSaving(true);
    try {
      await deleteLine(line.line_id);
      loadLines();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete line.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) =>
      divisionMatches(line.division, divisionFilter) &&
      (!statusFilter || Boolean(line.is_active) === (statusFilter === "1")) &&
      lineMatchesProtocol(line, protocolFilter) &&
      (!q ||
        String(line.line_name || "").toLowerCase().includes(q) ||
        String(line.line_code || "").toLowerCase().includes(q) ||
        String(line.division || "").toLowerCase().includes(q))
    );
  }, [divisionFilter, lines, protocolFilter, search, statusFilter]);

  const pagedLines = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalMachines = filtered.reduce((sum, line) => sum + (line.total_machines || 0), 0);
  const activeLines = filtered.filter((line) => line.is_active).length;

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      {workspace && !workspaceLoading && (
        <LineWorkspaceModal
          initialLine={workspace === "new" ? null : workspace}
          initialMachines={workspaceMachines}
          plant={selectedPlant}
          operations={operations}
          saving={saving}
          onClose={() => setWorkspace(null)}
          onSave={saveWorkspace}
        />
      )}
      {workspaceLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40">
          <div className="rounded-xl bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-xl">Loading line setup...</div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-extrabold text-slate-950">Production Lines</h1>
          <span className="text-slate-300">|</span>
          <nav className="flex items-center gap-1 text-sm text-slate-500">
            <span className="app-brand-text font-medium">Organisation</span>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-gray-600">Line Master</span>
          </nav>
        </div>
        <button onClick={() => openWorkspace()} className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700">
          Add Line
        </button>
      </div>

      <div className="app-panel mb-6 w-full rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-5 flex flex-col gap-1">
          <h2 className="text-lg font-extrabold text-slate-950"></h2>
          <p className="max-w-4xl text-sm leading-relaxed text-slate-500">
            Manage one line with multiple machines, and assign one operation to every machine from the operation list.
          </p>
        </div>

        <div className="mb-5 grid gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Select Plant">
            <SearchableSelect
              value={selectedPlant.code}
              options={PLANT_OPTIONS}
              placeholder="Search plant..."
              onChange={(value) => setSelectedPlant(getPlantByCode(value))}
            />
          </Field>
          <Field label="Division">
            <SearchableSelect
              value={divisionFilter}
              options={FILTER_DIVISION_OPTIONS}
              placeholder="All divisions"
              onChange={setDivisionFilter}
            />
          </Field>
          <Field label="Status">
            <SearchableSelect
              value={statusFilter}
              options={FILTER_STATUS_OPTIONS}
              placeholder="All status"
              onChange={setStatusFilter}
            />
          </Field>
          <Field label="Protocol">
            <SearchableSelect
              value={protocolFilter}
              options={FILTER_PROTOCOL_OPTIONS}
              placeholder="All protocols"
              onChange={setProtocolFilter}
            />
          </Field>
          <Field label="Search Lines">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="app-field h-11 w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50"
                placeholder="Search by name, code or division..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <p className="mb-4 text-xs text-gray-400">Showing {filtered.length} of {lines.length} loaded lines for {selectedPlant.name}</p>
        <div className="border-t border-slate-100 pt-5">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Overall Statistics</h3>
          <p className="mb-4 text-xs text-slate-400">Summary of production lines and mapped machines for the selected plant.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatBox value={filtered.length} label="Total Lines" />
            <StatBox value={activeLines} label="Active Lines" />
            <StatBox value={totalMachines} label="Total Machines" />
            <StatBox value={operations.length} label="Operation Options" />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <svg className="h-8 w-8 animate-spin text-teal-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-400">Loading lines...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-24 text-gray-400">
          <p className="text-base font-bold">No lines found</p>
          <p className="mt-1 text-sm">Use the Add Line button at the top-right to create a new line.</p>
        </div>
      ) : (
          <div className="auto-fit-wide-cards">
          {pagedLines.map((line) => (
            <LineCard key={line.line_id} line={line} onEdit={openWorkspace} onDelete={confirmDeleteLine} />
          ))}
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="lines" onPageChange={setPage} />
      )}
    </AppLayout>
  );
};

export default LineMasterPage;
