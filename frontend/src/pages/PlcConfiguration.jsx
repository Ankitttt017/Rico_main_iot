// PlcConfiguration.jsx — Clean PLC Register Management
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Plus, Save, Trash2, RefreshCw, Download, AlertTriangle, Info } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import { plcConfigApi } from "../api/services";

const PROTO_OPTIONS = [
  { value: "MODBUS_TCP", label: "Modbus TCP" },
  { value: "TCP_TEXT", label: "Generic TCP Text" },
  { value: "SLMP", label: "SLMP (Mitsubishi)" },
];

const PlcConfiguration = () => {
  const [ranges, setRanges] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    plcName: "", plcIp: "", plcPort: "502", plcProtocol: "MODBUS_TCP", rangeInput: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await plcConfigApi.listRanges();
      setRanges(data || []);
    } catch {
      toast.error("Failed to load PLC ranges");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const updateField = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Basic validation (you can enhance)
      if (!formData.plcIp || !formData.rangeInput) {
        toast.error("IP and Range are required");
        return;
      }
      await plcConfigApi.createRange({ ...formData, rangeName: `Block_${formData.rangeInput}` });
      toast.success("Register block added successfully");
      setShowAddModal(false);
      setFormData({ plcName: "", plcIp: "", plcPort: "502", plcProtocol: "MODBUS_TCP", rangeInput: "" });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await plcConfigApi.deleteRange(deleteId);
      toast.success("Block deleted");
      await loadData();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <Cpu size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main">PLC Configuration</h1>
            <p className="text-text-muted text-sm">Manage register blocks and PLC endpoints</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl hover:bg-bg-dark transition">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-primary text-on-strong px-5 py-2 rounded-2xl font-semibold hover:brightness-105 transition">
            <Plus size={18} /> Add Register Block
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-border rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex justify-between bg-bg-dark/50">
          <h2 className="font-semibold">Registered Blocks</h2>
          <span className="text-sm text-text-muted">{ranges.length} blocks</span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-text-muted">Loading...</div>
        ) : ranges.length === 0 ? (
          <div className="py-20 text-center text-text-muted">No register blocks yet. Click "Add Register Block".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-dark/30 text-text-muted text-xs uppercase tracking-widest">
                  <th className="px-6 py-4 text-left">PLC Name</th>
                  <th className="px-6 py-4 text-left">Endpoint</th>
                  <th className="px-6 py-4 text-left">Protocol</th>
                  <th className="px-6 py-4 text-left">Range</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {ranges.map(r => (
                  <tr key={r.id} className="hover:bg-bg-dark/10 transition">
                    <td className="px-6 py-4 font-medium">{r.plcName || "—"}</td>
                    <td className="px-6 py-4 font-mono text-primary">{r.plcIp}:{r.plcPort}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 text-xs bg-primary/10 text-primary rounded-full">{r.plcProtocol}</span>
                    </td>
                    <td className="px-6 py-4 font-mono">R{r.rangeStart}–R{r.rangeEnd}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setDeleteId(r.id)} className="p-2 text-danger hover:bg-danger/10 rounded-xl transition">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-card border border-border rounded-3xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-5 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-lg">Add New Register Block</h3>
              <button onClick={() => setShowAddModal(false)} className="text-text-muted hover:text-text-main">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">PLC Friendly Name</label>
                <input value={formData.plcName} onChange={e => updateField("plcName", e.target.value)}
                  placeholder="OP-010 Main PLC" className="w-full bg-bg-dark border border-border rounded-2xl px-4 py-3 text-sm focus:border-primary outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5">IP Address</label>
                  <input value={formData.plcIp} onChange={e => updateField("plcIp", e.target.value)}
                    placeholder="192.168.1.100" className="w-full bg-bg-dark border border-border rounded-2xl px-4 py-3 text-sm font-mono focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5">Port</label>
                  <input type="number" value={formData.plcPort} onChange={e => updateField("plcPort", e.target.value)}
                    className="w-full bg-bg-dark border border-border rounded-2xl px-4 py-3 text-sm font-mono focus:border-primary outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Protocol</label>
                <select value={formData.plcProtocol} onChange={e => updateField("plcProtocol", e.target.value)}
                  className="w-full bg-bg-dark border border-border rounded-2xl px-4 py-3 text-sm focus:border-primary outline-none">
                  {PROTO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Range (start-size)</label>
                <input value={formData.rangeInput} onChange={e => updateField("rangeInput", e.target.value)}
                  placeholder="100-12" className="w-full bg-bg-dark border border-border rounded-2xl px-4 py-3 text-sm font-mono focus:border-primary outline-none" />
                <p className="text-xs text-text-muted mt-1">Example: 100-12 means R100 to R111 (min 6 registers recommended)</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-3 text-text-muted font-medium border border-border rounded-2xl hover:bg-bg-dark transition">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-3 bg-primary text-on-strong font-semibold rounded-2xl hover:brightness-105 transition disabled:opacity-70">
                  {saving ? "Saving..." : "Add Block"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteId} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} title="Delete block?" message="This action cannot be undone." />
    </div>
  );
};

export default PlcConfiguration;