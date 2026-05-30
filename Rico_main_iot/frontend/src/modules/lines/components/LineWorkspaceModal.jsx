import React, { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../../../components/common/SearchableSelect";
import { getRawMasterData } from "../../../services/api";
import {
  DIVISION_OPTIONS,
  FALLBACK_OPERATIONS,
  PLANT_OPTIONS,
  PROTOCOL_OPTIONS,
  STATUS_OPTIONS,
  emptyLine,
  emptyMachine,
} from "../constants";
import { ActionInput, Field, TextInput } from "./FormControls";
import { getLinePlantCode, getPlantByCode, makeMachineDraft } from "../utils/lineUtils";

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

export default LineWorkspaceModal;
