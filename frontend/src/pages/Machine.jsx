import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cpu, Plus, Save, Trash2, Edit, RefreshCw, Search,
  X, Network, Terminal, Activity, Layers, Settings,
  Layout, Database, ChevronRight, Info, AlertTriangle, Eye
} from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import { machineApi, plcConfigApi } from "../api/services";
import {
  MACHINE_MODBUS_TUNING_FIELD_CONFIG,
  MACHINE_REGISTER_ROLE_FIELDS,
  formatMachineLabel,
} from "../utils/machineFields";

/* ─── helpers ─────────────────────────────────────────────── */
function toFormValue(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v);
}
function toNullableNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toNumberWithDefault(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeProtocol(value, fallback = "TCP_TEXT") {
  const n = String(value || "").trim().toUpperCase();
  if (!n) return fallback;
  if (n === "MODBUS") return "MODBUS_TCP";
  if (["TCP", "TEXT"].includes(n)) return "TCP_TEXT";
  return n;
}
function createEmptyForm() {
  return {
    machineName: "", lineName: "", sequenceNo: "", operationNo: "",
    dailyTargetQty: "0", plcIp: "", plcPort: "", plcProtocol: "TCP_TEXT",
    plcRangeId: "", plcSlmpDevice: "D", status: "ACTIVE",
    plcConfig: {
      rangeId: "", startRegister: "", statusRegister: "", partRegister: "",
      stationRegister: "", resetRegister: "",
      startValue: "1", startedValue: "2", endOkValue: "3", endNgValue: "4", blockValue: "2",
    },
    // New: registers to read live values
    readRegisters: {
      temperature: "",   // user-defined register for temperature
    },
  };
}
function buildFormFromMachine(m) {
  const cfg = m.plcConfig || {};
  const plcRangeId = cfg.rangeId ?? m.plcRangeId ?? "";
  return {
    machineName: m.machineName || "", lineName: m.lineName || "",
    sequenceNo: toFormValue(m.sequenceNo, ""), operationNo: m.operationNo || "",
    dailyTargetQty: toFormValue(m.dailyTargetQty, "0"),
    plcIp: m.plcIp || "", plcPort: toFormValue(m.plcPort, ""),
    plcProtocol: m.plcProtocol || "TCP_TEXT",
    plcRangeId: toFormValue(plcRangeId, ""),
    plcSlmpDevice: m.plcSlmpDevice || "D", status: m.status || "ACTIVE",
    plcConfig: {
      rangeId: toFormValue(plcRangeId, ""),
      startRegister: toFormValue(cfg.startRegister ?? m.plcStartRegister, ""),
      statusRegister: toFormValue(cfg.statusRegister ?? m.plcStatusRegister, ""),
      partRegister: toFormValue(cfg.partRegister ?? m.plcPartRegister, ""),
      stationRegister: toFormValue(cfg.stationRegister ?? m.plcStationRegister, ""),
      resetRegister: toFormValue(cfg.resetRegister ?? m.plcResetRegister, ""),
      startValue: toFormValue(cfg.startValue ?? m.plcStartValue, "1"),
      startedValue: toFormValue(cfg.startedValue ?? m.plcStartedValue, "2"),
      endOkValue: toFormValue(cfg.endOkValue ?? m.plcEndOkValue, "3"),
      endNgValue: toFormValue(cfg.endNgValue ?? m.plcEndNgValue, "4"),
      blockValue: toFormValue(cfg.blockValue ?? m.plcBlockValue, "2"),
    },
    readRegisters: {
      temperature: toFormValue(m.readRegisters?.temperature ?? "", ""),
    },
  };
}
function toSubmitPayload(f) {
  const plcIp = String(f.plcIp || "").trim();
  const plcPort = toNullableNumber(f.plcPort);
  const plcRangeId = toNullableNumber(f.plcRangeId);
  const cfg = f.plcConfig || {};
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
    machineName: String(f.machineName || "").trim(),
    lineName: String(f.lineName || "").trim(),
    sequenceNo: toNullableNumber(f.sequenceNo),
    operationNo: String(f.operationNo || "").trim().toUpperCase(),
    dailyTargetQty: Math.max(toNullableNumber(f.dailyTargetQty) ?? 0, 0),
    plcIp, plcPort, plcProtocol: f.plcProtocol, plcRangeId, plcConfig,
    plcBlockValue: plcConfig.blockValue,
    plcSlmpDevice: String(f.plcSlmpDevice || "").trim().toUpperCase() || null,
    status: f.status || "ACTIVE",
    machineIp: plcIp, machinePort: plcPort,
    readRegisters: {
      temperature: toNullableNumber(f.readRegisters?.temperature) ?? null,
    },
  };
}

const FORM_TABS = [
  { id: "general", label: "Identity", icon: Layout },
  { id: "network", label: "Network", icon: Network },
  { id: "registers", label: "Registers", icon: Terminal },
  { id: "tuning", label: "Tuning", icon: Settings },
  { id: "live", label: "Live Data", icon: Eye }, // new tab
];

/* ─── sub-components ───────────────────────────────────────── */
function FieldLabel({ children, hint }) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">{children}</label>
      {hint && <span className="text-[10px] text-text-muted/50 normal-case tracking-normal font-normal">— {hint}</span>}
    </div>
  );
}

function InputField({ label, hint, children }) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-primary/60 transition-colors placeholder:text-text-muted/40";
const selectCls = "w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-primary/60 transition-colors";

/* ─── main component ───────────────────────────────────────── */
const MachinePage = () => {
  const [machines, setMachines] = useState([]);
  const [plcRanges, setPlcRanges] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [editingMachine, setEditingMachine] = useState(null);
  const [formData, setFormData] = useState(() => createEmptyForm());
  const [searchTerm, setSearchTerm] = useState("");
  const [lineFilter, setLineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);

  // Live data read states
  const [reading, setReading] = useState(false);
  const [liveValues, setLiveValues] = useState({ temperature: null });

  const loadData = useCallback(async () => {
    try {
      const [machineRows, rangeRows] = await Promise.all([
        machineApi.list(),
        plcConfigApi.listRanges().catch(() => []),
      ]);
      setMachines(machineRows || []);
      setPlcRanges(rangeRows || []);
    } catch {
      toast.error("Failed to load machine data");
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const rangeById = useMemo(() =>
    plcRanges.reduce((acc, r) => { acc[r.id] = r; return acc; }, {}),
    [plcRanges]
  );

  const normalizedProtocol = normalizeProtocol(formData.plcProtocol, "TCP_TEXT");
  const isModbus = normalizedProtocol === "MODBUS_TCP";
  const isSlmp = normalizedProtocol === "SLMP";
  const usesRange = isModbus || isSlmp;

  const selectableRanges = useMemo(() => {
    const selectedIp = String(formData.plcIp || "").trim();
    const pool = plcRanges.filter(r =>
      String(r.status || "").toUpperCase() === "ACTIVE" &&
      (!usesRange || normalizeProtocol(r.plcProtocol, "MODBUS_TCP") === normalizedProtocol) &&
      (!selectedIp || String(r.plcIp || "").trim() === selectedIp)
    );
    const map = new Map(pool.map(r => [String(r.id), r]));
    const editRangeId = toNullableNumber(editingMachine?.plcRangeId || editingMachine?.plcConfig?.rangeId);
    if (editRangeId && rangeById[editRangeId]) map.set(String(editRangeId), rangeById[editRangeId]);
    return Array.from(map.values());
  }, [plcRanges, editingMachine, formData.plcIp, normalizedProtocol, usesRange, rangeById]);

  const filteredMachines = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    return machines.filter(m => {
      const ms = !s || [m.machineName, m.lineName, m.operationNo, m.plcIp].some(v => String(v || "").toLowerCase().includes(s));
      const ml = lineFilter === "all" || m.lineName === lineFilter;
      const mst = statusFilter === "all" || m.status === statusFilter;
      return ms && ml && mst;
    }).sort((a, b) => (Number(a.sequenceNo) || 0) - (Number(b.sequenceNo) || 0));
  }, [machines, searchTerm, lineFilter, statusFilter]);

  const lines = useMemo(() => [...new Set(machines.map(m => m.lineName).filter(Boolean))].sort(), [machines]);

  const stats = useMemo(() => ({
    total: machines.length,
    active: machines.filter(m => m.status === "ACTIVE").length,
    configured: machines.filter(m => m.plcIp).length,
    inactive: machines.filter(m => m.status === "INACTIVE").length,
  }), [machines]);

  const updateField = (key, value) => {
    if (key === "plcProtocol") {
      setFormData(prev => ({
        ...prev, plcProtocol: String(value).toUpperCase(), plcRangeId: "",
        plcConfig: { ...prev.plcConfig, rangeId: "", startRegister: "", statusRegister: "", partRegister: "", stationRegister: "", resetRegister: "" },
      }));
      return;
    }
    setFormData(prev => ({ ...prev, [key]: value }));
  };
  const updateCfg = (k, v) => setFormData(p => ({ ...p, plcConfig: { ...(p.plcConfig || {}), [k]: v } }));
  const updateReadReg = (k, v) => setFormData(p => ({ ...p, readRegisters: { ...p.readRegisters, [k]: v } }));

  const openCreate = () => { setFormData(createEmptyForm()); setEditingMachine(null); setActiveTab("general"); setShowModal(true); };
  const openEdit = (m) => { setFormData(buildFormFromMachine(m)); setEditingMachine(m); setActiveTab("general"); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingMachine(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = toSubmitPayload(formData);
      if (editingMachine) await machineApi.update(editingMachine.id, payload);
      else await machineApi.create(payload);
      toast.success(editingMachine ? "Machine updated successfully" : "Machine deployed successfully");
      closeModal();
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save machine");
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await machineApi.remove(deleteConfirmId);
      toast.success("Machine removed from registry");
      await loadData();
    } catch { toast.error("Failed to remove machine"); }
    finally { setDeleteConfirmId(null); }
  };

  // Live read from PLC
  const readTemperature = async () => {
    if (!editingMachine && !formData.plcIp) {
      toast.error("Configure the machine's PLC first");
      return;
    }
    const tempReg = formData.readRegisters.temperature;
    if (!tempReg) {
      toast.error("No temperature register configured");
      return;
    }
    setReading(true);
    try {
      // Simulate API call: read register from PLC
      // In real implementation, you'd call machineApi.readRegister(machineId, register)
      const response = await machineApi.readRegister(editingMachine?.id, { register: tempReg });
      setLiveValues({ temperature: response.value });
      toast.success(`Temperature = ${response.value} °C`);
    } catch {
      toast.error("Failed to read temperature register");
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="space-y-6 rise-in">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Layout size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-main tracking-tight">Machine Registry</h1>
            <p className="text-text-muted text-xs mt-0.5">All production equipment, PLC endpoints &amp; register assignments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="h-9 px-4 rounded-xl border border-border bg-bg-card text-text-muted hover:text-text-main hover:border-primary/40 transition-all flex items-center gap-2 text-sm font-semibold">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={openCreate} className="h-9 px-5 rounded-xl bg-primary text-on-strong font-bold flex items-center gap-2 text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/15">
            <Plus size={16} /> Add Machine
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total machines", value: stats.total, color: "text-text-main" },
          { label: "Active / live", value: stats.active, color: "text-accent" },
          { label: "PLC configured", value: stats.configured, color: "text-primary" },
          { label: "Offline", value: stats.inactive, color: "text-danger" },
        ].map((s, i) => (
          <div key={i} className="bg-bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name, line, IP or operation…"
            className="w-full h-9 bg-bg-card border border-border rounded-xl pl-9 pr-4 text-sm text-text-main outline-none focus:border-primary/50 placeholder:text-text-muted/50"
          />
        </div>
        <select value={lineFilter} onChange={e => setLineFilter(e.target.value)}
          className="h-9 bg-bg-card border border-border rounded-xl px-3 text-sm text-text-main outline-none focus:border-primary/50">
          <option value="all">All lines</option>
          {lines.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 bg-bg-card border border-border rounded-xl px-3 text-sm text-text-main outline-none focus:border-primary/50">
          <option value="all">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {/* ── Machine Grid ── */}
      {filteredMachines.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-2xl p-20 flex flex-col items-center text-center text-text-muted">
          <Database size={40} className="opacity-20 mb-3" />
          <p className="font-semibold">No machines found</p>
          <p className="text-sm mt-1 text-text-muted/60">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMachines.map(m => {
            const isActive = m.status === "ACTIVE";
            const hasCfg = m.plcConfig && (m.plcProtocol === "MODBUS_TCP" || m.plcProtocol === "SLMP");
            return (
              <div key={m.id} className="bg-bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-all group">
                {/* Card head */}
                <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? "bg-primary/10 text-primary border border-primary/20" : "bg-bg-dark text-text-muted border border-border"}`}>
                      <Cpu size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-text-main text-sm leading-tight truncate">{m.machineName}</h3>
                      <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                        <Layers size={9} /> {m.lineName || "Global"} · Seq {String(m.sequenceNo || 0).padStart(2, "0")}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${isActive ? "bg-accent/10 border border-accent/20 text-accent" : "bg-bg-dark border border-border text-text-muted"}`}>
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                    {isActive ? "Live" : "Offline"}
                  </div>
                </div>

                {/* Card body */}
                <div className="px-5 py-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-0.5">Operation</p>
                      <p className="text-sm font-bold text-text-main font-mono">{m.operationNo || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-0.5">Daily target</p>
                      <p className="text-sm font-bold text-text-main">{m.dailyTargetQty || 0} units</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-bg-dark/60 border border-border rounded-lg px-3 py-2">
                    <span className="text-xs font-mono text-primary">{m.plcIp || "Not configured"}</span>
                    <span className="text-[10px] text-text-muted font-semibold uppercase">{m.plcProtocol || "—"}</span>
                  </div>
                  {hasCfg && (
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { label: "TRG", val: m.plcConfig.startRegister },
                        { label: "STS", val: m.plcConfig.statusRegister },
                        { label: "PRT", val: m.plcConfig.partRegister },
                        { label: "RST", val: m.plcConfig.resetRegister },
                      ].map(chip => (
                        <span key={chip.label} className="px-2 py-0.5 bg-bg-dark border border-border rounded text-[10px] font-mono">
                          <span className="text-primary font-bold">{chip.label}</span>
                          <span className="text-text-muted ml-1">R{chip.val}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div className="px-5 py-3 border-t border-border bg-bg-dark/20 flex items-center justify-end gap-2">
                  <button onClick={() => setDeleteConfirmId(m.id)}
                    className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => openEdit(m)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold hover:bg-primary hover:text-on-strong transition-all">
                    <Edit size={12} /> Configure
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit / Create Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg-dark/90 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-3xl bg-bg-card border border-border/60 rounded-2xl overflow-hidden flex flex-col max-h-[90vh] rise-in shadow-2xl">
            {/* Modal header */}
            <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-bg-dark/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Cpu size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-text-main">{editingMachine ? "Configure machine" : "Register new machine"}</h2>
                  <p className="text-xs text-text-muted mt-0.5">{editingMachine ? `ID: ${editingMachine.id}` : "Add new equipment to the production line"}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 text-text-muted hover:text-text-main hover:bg-bg-dark rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center border-b border-border bg-bg-dark/20 px-6 gap-1 overflow-x-auto">
              {FORM_TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-main"}`}>
                  <tab.icon size={13} /> {tab.label}
                </button>
              ))}
            </div>

            {/* Form body */}
            <form id="machine-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              {/* ── GENERAL TAB ── */}
              {activeTab === "general" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <InputField label="Machine name">
                      <input required value={formData.machineName} onChange={e => updateField("machineName", e.target.value)}
                        placeholder="e.g. OP-010 Press" className={inputCls} />
                    </InputField>
                  </div>
                  <InputField label="Line / department">
                    <input value={formData.lineName} onChange={e => updateField("lineName", e.target.value)}
                      placeholder="Assembly Line A" className={inputCls} />
                  </InputField>
                  <InputField label="Status">
                    <select value={formData.status} onChange={e => updateField("status", e.target.value)} className={selectCls}>
                      <option value="ACTIVE">Active — live tracing</option>
                      <option value="INACTIVE">Inactive — maintenance</option>
                    </select>
                  </InputField>
                  <InputField label="Sequence number" hint="order on the line">
                    <input type="number" value={formData.sequenceNo} onChange={e => updateField("sequenceNo", e.target.value)}
                      placeholder="1" className={`${inputCls} font-mono`} />
                  </InputField>
                  <InputField label="Operation code">
                    <input value={formData.operationNo} onChange={e => updateField("operationNo", e.target.value.toUpperCase())}
                      placeholder="OP010" className={`${inputCls} font-mono uppercase`} />
                  </InputField>
                  <InputField label="Daily production target">
                    <input type="number" value={formData.dailyTargetQty} onChange={e => updateField("dailyTargetQty", e.target.value)}
                      placeholder="480" className={`${inputCls} font-mono font-bold`} />
                  </InputField>
                </div>
              )}

              {/* ── NETWORK TAB ── */}
              {activeTab === "network" && (
                <div className="space-y-5">
                  <InputField label="PLC protocol">
                    <select value={formData.plcProtocol} onChange={e => updateField("plcProtocol", e.target.value)} className={`${selectCls} font-semibold`}>
                      <option value="TCP_TEXT">Generic TCP text</option>
                      <option value="MODBUS_TCP">Modbus TCP (standard industrial)</option>
                      <option value="SLMP">SLMP — Mitsubishi Melsec</option>
                    </select>
                  </InputField>
                  <div className="grid grid-cols-2 gap-4">
                    <InputField label="PLC IP address">
                      <input required value={formData.plcIp} onChange={e => updateField("plcIp", e.target.value)}
                        placeholder="192.168.1.10" className={`${inputCls} font-mono`} />
                    </InputField>
                    <InputField label="Port">
                      <input type="number" value={formData.plcPort} onChange={e => updateField("plcPort", e.target.value)}
                        placeholder="502" className={`${inputCls} font-mono`} />
                    </InputField>
                  </div>
                  {usesRange && (
                    <InputField label="Register block (range)" hint="assigned from PLC config page">
                      <select value={formData.plcRangeId} onChange={e => updateField("plcRangeId", e.target.value)}
                        className={`${selectCls} font-semibold`}>
                        <option value="">— Select reserved memory block —</option>
                        {selectableRanges.map(r => (
                          <option key={r.id} value={r.id}>{r.rangeName} [R{r.rangeStart}–R{r.rangeEnd}]</option>
                        ))}
                      </select>
                    </InputField>
                  )}
                  <div className="p-4 bg-bg-dark/50 border border-border rounded-xl flex items-start gap-3">
                    <Info size={16} className="text-text-muted mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-text-muted leading-relaxed">
                      Modbus TCP default port is <span className="font-mono font-bold text-primary">502</span>.
                      SLMP (Mitsubishi) uses <span className="font-mono font-bold text-primary">5006</span>.
                      Generic TCP scanners typically use <span className="font-mono font-bold text-primary">9001</span>.
                      Ensure the PLC firewall allows inbound connections on the selected port.
                    </p>
                  </div>
                </div>
              )}

              {/* ── REGISTERS TAB ── */}
              {activeTab === "registers" && (
                <div className="space-y-5">
                  {!formData.plcRangeId ? (
                    <div className="p-16 border border-dashed border-border rounded-2xl flex flex-col items-center text-center text-text-muted">
                      <Network size={32} className="opacity-20 mb-3" />
                      <p className="font-semibold text-sm">Select a network block first</p>
                      <p className="text-xs mt-1 text-text-muted/60">Go to the Network tab and assign a register block to enable register mapping</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {MACHINE_REGISTER_ROLE_FIELDS.map(field => {
                          const range = rangeById[formData.plcRangeId];
                          const start = range?.rangeStart || 0;
                          const end = range?.rangeEnd || 0;
                          const usedRegisters = new Set();
                          machines.forEach(m => {
                            if (m.id === editingMachine?.id) return;
                            if (Number(m.plcRangeId) !== Number(formData.plcRangeId)) return;
                            const mc = m.plcConfig || {};
                            MACHINE_REGISTER_ROLE_FIELDS.forEach(f => { if (mc[f.key]) usedRegisters.add(Number(mc[f.key])); });
                          });
                          MACHINE_REGISTER_ROLE_FIELDS.forEach(f => {
                            if (f.key !== field.key && formData.plcConfig?.[f.key]) usedRegisters.add(Number(formData.plcConfig[f.key]));
                          });
                          const options = [];
                          for (let r = start; r <= end; r++) {
                            if (!usedRegisters.has(r) || Number(formData.plcConfig?.[field.key]) === r) options.push(r);
                          }
                          return (
                            <div key={field.key} className="bg-bg-dark/60 border border-border rounded-xl p-4">
                              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">{field.label}</p>
                              <select required value={formData.plcConfig?.[field.key] ?? ""} onChange={e => updateCfg(field.key, e.target.value)}
                                className="w-full bg-bg-dark border-0 border-b border-primary/30 pb-1 text-sm text-primary font-mono font-bold outline-none focus:border-primary">
                                <option value="">— Select R —</option>
                                {options.map(o => <option key={o} value={o}>R{o}</option>)}
                              </select>
                              {range && <p className="text-[9px] text-text-muted/50 mt-1.5">Block: {range.rangeName}</p>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl flex items-start gap-3">
                        <Activity size={16} className="text-accent mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-text-muted leading-relaxed">
                          Registers already used by other machines on this block are automatically filtered out to prevent data collision.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── TUNING TAB ── */}
              {activeTab === "tuning" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {MACHINE_MODBUS_TUNING_FIELD_CONFIG.map(field => (
                      <InputField key={field.key} label={field.label}>
                        <input type="number" value={formData.plcConfig?.[field.key] ?? ""}
                          onChange={e => updateCfg(field.key, e.target.value)}
                          className={`${inputCls} font-mono`} />
                      </InputField>
                    ))}
                  </div>
                  <div className="p-4 bg-danger/5 border border-danger/20 rounded-xl flex items-start gap-3">
                    <AlertTriangle size={16} className="text-danger mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-text-muted leading-relaxed">
                      Changing handshake signal values will immediately break the PLC communication unless the hardware program is updated to match. Coordinate with your PLC programmer before making changes.
                    </p>
                  </div>
                </div>
              )}

              {/* ── LIVE DATA TAB ── */}
              {activeTab === "live" && (
                <div className="space-y-6">
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                      <Eye size={16} className="text-primary" />
                      <h3 className="text-sm font-bold text-text-main">Read PLC Values</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <FieldLabel label="Temperature register" hint="Modbus address (e.g., 40001)"/>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={formData.readRegisters.temperature}
                            onChange={e => updateReadReg("temperature", e.target.value)}
                            placeholder="e.g., 40001"
                            className={`${inputCls} flex-1`}
                          />
                          <button
                            type="button"
                            onClick={readTemperature}
                            disabled={reading || !formData.readRegisters.temperature}
                            className="px-4 py-2 bg-primary text-on-strong font-bold rounded-lg text-sm hover:brightness-110 transition-all disabled:opacity-50"
                          >
                            {reading ? "Reading..." : "Read"}
                          </button>
                        </div>
                        {liveValues.temperature !== null && (
                          <div className="mt-3 p-3 bg-accent/10 border border-accent/20 rounded-lg flex items-center justify-between">
                            <span className="text-sm font-semibold text-text-main">Current temperature:</span>
                            <span className="text-lg font-bold text-accent">{liveValues.temperature} °C</span>
                          </div>
                        )}
                      </div>
                      {/* You can add more registers here */}
                    </div>
                    <p className="text-xs text-text-muted mt-4">
                      Note: The PLC must be accessible and the register must be configured to hold the desired value.
                    </p>
                  </div>
                </div>
              )}
            </form>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-bg-dark/20">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <ChevronRight size={12} />
                <span>Fill in Identity → Network → Registers in order</span>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-text-muted hover:text-text-main transition-colors font-semibold">Cancel</button>
                <button type="submit" form="machine-form" disabled={saving}
                  className="px-6 py-2 bg-primary text-on-strong font-bold rounded-xl text-sm hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50">
                  <Save size={14} /> {saving ? "Saving…" : editingMachine ? "Save changes" : "Deploy machine"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onCancel={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Remove machine?"
        message="This will remove the machine from the registry. Historical production data is preserved but live tracing for this node will stop immediately."
      />
    </div>
  );
};

export default MachinePage;