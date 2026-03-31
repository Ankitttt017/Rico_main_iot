import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, UserPlus, Edit, Trash2, Search, Shield, UserCog,
  X, Save, Calendar, RefreshCw, ChevronUp, ChevronDown, CheckCircle, Layout
} from "lucide-react";
import toast from "react-hot-toast";
import { userApi } from "../api/services";
import ConfirmModal from "../components/ConfirmModal";

const DEFAULT_FORM = { username: "", password: "", role: "Operator", status: "ACTIVE" };

const ROLE_STYLE = {
  Admin:      "bg-danger/10 text-danger border-danger/20",
  Engineer:   "bg-accent/10 text-accent border-accent/20",
  Supervisor: "bg-warning/10 text-warning border-warning/20",
  Operator:   "bg-primary/10 text-primary border-primary/20",
};

const ROLE_SELECTED_STYLE = {
  Admin:      "border-danger bg-danger/10 text-danger",
  Engineer:   "border-accent bg-accent/10 text-accent",
  Supervisor: "border-warning bg-warning/10 text-warning",
  Operator:   "border-primary bg-primary/10 text-primary",
};

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "username", direction: "asc" });
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await userApi.list();
      setUsers(data || []);
    } catch { toast.error("User database sync failed"); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const resetForm = () => { setFormData(DEFAULT_FORM); setEditingUser(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingUser) {
        const payload = { ...formData };
        if (!payload.password) delete payload.password;
        await userApi.update(editingUser.id, payload);
        toast.success("User credentials updated");
      } else {
        await userApi.create(formData);
        toast.success(`Personnel "${formData.username}" enrolled`);
      }
      await fetchUsers();
      setShowModal(false);
      resetForm();
    } catch (err) { toast.error(err.response?.data?.error || "Provisioning failed"); }
    finally { setLoading(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await userApi.remove(deleteTarget.id);
      toast.success("Access revoked");
      await fetchUsers();
    } catch { toast.error("Revocation failed"); }
    finally { setDeleteTarget(null); }
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username || "",
      password: "",
      role: user.role || "Operator",
      status: user.status || "ACTIVE",
    });
    setShowModal(true);
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  };

  const sortedUsers = useMemo(() => {
    const filtered = users.filter((u) => {
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const keyword = searchTerm.toLowerCase();
      return matchesRole && (u.username.toLowerCase().includes(keyword) || u.role.toLowerCase().includes(keyword));
    });
    return filtered.sort((a, b) => {
      const aVal = String(a[sortConfig.key] || "");
      const bVal = String(b[sortConfig.key] || "");
      return aVal < bVal ? (sortConfig.direction === "asc" ? -1 : 1) : aVal > bVal ? (sortConfig.direction === "asc" ? 1 : -1) : 0;
    });
  }, [roleFilter, searchTerm, sortConfig, users]);

  const roleCount = useMemo(() => Object.fromEntries(["Admin", "Engineer", "Supervisor", "Operator"].map((r) => [r, users.filter((u) => u.role === r).length])), [users]);

  return (
    <div className="space-y-6 rise-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl border border-primary/20">
            <Users size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main">Access Control List</h1>
            <p className="text-text-muted text-sm mt-0.5">Manage personnel hierarchy and role-based permissions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchUsers()} className="p-2.5 rounded-xl border border-border bg-bg-card text-text-muted hover:border-primary/50 transition-colors"><RefreshCw size={18} /></button>
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="px-5 py-2.5 bg-primary text-on-strong font-black rounded-xl flex items-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/10 text-sm">
            <UserPlus size={16} /> Enroll Personnel
          </button>
        </div>
      </div>

      {/* Role Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(roleCount).map(([role, count]) => (
          <button key={role} onClick={() => setRoleFilter(roleFilter === role ? "all" : role)}
            className={`industrial-card p-5 text-left transition-all group ${roleFilter === role ? "border-primary shadow-lg shadow-primary/5 ring-1 ring-primary/20" : "hover:border-primary/40"}`}>
            <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border mb-3 inline-block ${ROLE_STYLE[role]}`}>
               {role}
            </div>
            <div className="flex items-end justify-between">
               <div>
                  <p className="text-3xl font-black text-text-main leading-none">{count}</p>
                  <p className="text-[10px] text-text-muted uppercase font-bold mt-2">Active Accounts</p>
               </div>
               <div className="p-2 rounded-lg bg-bg-dark border border-border group-hover:text-primary transition-colors"><Shield size={16}/></div>
            </div>
          </button>
        ))}
      </div>

      {/* Filter Matrix */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name, role or ID..." 
            className="w-full bg-bg-card border border-border rounded-xl py-3.5 pl-11 pr-4 focus:border-primary/50 text-text-main outline-none focus:ring-1 focus:ring-primary/20" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-bg-card border border-border rounded-xl px-6 py-3.5 text-text-main text-sm font-bold focus:outline-none focus:border-primary/50">
          <option value="all">Global Filter: All Roles</option>
          {["Admin", "Engineer", "Supervisor", "Operator"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Master List */}
      <div className="industrial-card p-0 overflow-hidden relative">
        <div className="px-6 py-4 border-b border-border bg-bg-dark/40 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <Layout size={16} className="text-primary" />
              <h2 className="text-sm font-bold text-text-main uppercase tracking-wider">User Directory</h2>
           </div>
           <span className="text-[10px] font-black text-text-muted uppercase tracking-widest bg-bg-dark px-3 py-1 rounded-lg border border-border">{sortedUsers.length} Results</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
             <thead className="bg-bg-dark/70 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                <tr>
                   <th className="px-6 py-4 text-left cursor-pointer hover:text-primary" onClick={() => handleSort('username')}>
                     Identity <SortIcon active={sortConfig.key === "username"} direction={sortConfig.direction} />
                   </th>
                   <th className="px-6 py-4 text-left cursor-pointer hover:text-primary" onClick={() => handleSort('role')}>
                     Clearance <SortIcon active={sortConfig.key === "role"} direction={sortConfig.direction} />
                   </th>
                   <th className="px-6 py-4 text-left">Enrollment</th>
                   <th className="px-6 py-4 text-left">Security State</th>
                   <th className="px-6 py-4 text-right">Management</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-border">
                {sortedUsers.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-20 text-center text-text-muted"><Users size={48} className="mx-auto opacity-10 mb-4" />No matching personnel records.</td></tr>
                ) : sortedUsers.map(user => (
                  <tr key={user.id} className="group hover:bg-bg-dark/20 transition-colors">
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-xl bg-bg-dark border border-border flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><UserCog size={18} /></div>
                           <p className="font-bold text-text-main">{user.username}</p>
                        </div>
                     </td>
                     <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded text-[10px] font-black tracking-wider border ${ROLE_STYLE[user.role] || ROLE_STYLE.Operator}`}>{user.role.toUpperCase()}</span>
                     </td>
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                           <Calendar size={12}/> {new Date(user.createdAt).toLocaleDateString()}
                        </div>
                     </td>
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <div className={`w-2 h-2 rounded-full animate-pulse ${user.status === 'ACTIVE' ? 'bg-accent' : 'bg-danger'}`} />
                           <span className={`text-[10px] font-black uppercase ${user.status === 'ACTIVE' ? 'text-accent' : 'text-danger'}`}>{user.status || 'ACTIVE'}</span>
                        </div>
                     </td>
                     <td className="px-6 py-4 text-right">
                        <div className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => handleOpenEdit(user)} className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-all"><Edit size={14}/></button>
                           <button onClick={() => setDeleteTarget(user)} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"><Trash2 size={14}/></button>
                        </div>
                     </td>
                  </tr>
                ))}
             </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg-dark/90 backdrop-blur-md" onClick={() => setShowModal(false)} />
          <div className="relative industrial-card p-0 w-full max-w-lg overflow-hidden rise-in border-accent/20">
            <div className="p-6 border-b border-border flex items-center justify-between bg-bg-dark/30">
               <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20"><Shield size={20}/></div>
                  <h2 className="text-lg font-bold text-text-main">{editingUser ? 'Policy Update' : 'Personnel Enrollment'}</h2>
               </div>
               <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-main"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Network Logic Username</label>
                  <input required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="e.g. j.doe" className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main outline-none focus:border-primary/50" />
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">{editingUser ? 'Credential Override (Optional)' : 'Security Credential'}</label>
                  <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={!editingUser} placeholder="••••••••" className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main outline-none focus:border-primary/50 font-mono" />
               </div>
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Clearance Level</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Operator", "Engineer", "Supervisor", "Admin"].map(role => (
                      <button key={role} type="button" onClick={() => setFormData({...formData, role})}
                        className={`py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${formData.role === role ? ROLE_SELECTED_STYLE[role] + ' border-current' : 'border-border bg-bg-dark/40 text-text-muted hover:border-text-muted'}`}>
                        {role}
                      </button>
                    ))}
                  </div>
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Operational State</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-bg-dark border border-border rounded-xl p-3 text-text-main outline-none focus:border-primary/50 font-bold">
                     <option value="ACTIVE">SYSTEM ACTIVE</option>
                     <option value="INACTIVE">ACCOUNT SUSPENDED</option>
                  </select>
               </div>
               
               <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 text-[11px] font-black uppercase text-text-muted hover:text-text-main">Abort</button>
                  <button type="submit" disabled={loading} className="px-8 py-2.5 bg-primary text-on-strong font-black rounded-xl text-[11px] uppercase shadow-lg shadow-primary/10 flex items-center gap-2">
                     {loading ? <RefreshCw className="animate-spin" size={14}/> : <CheckCircle size={14}/>} {editingUser ? 'Commit Changes' : 'Enroll Personnel'}
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Revoke Credentials"
        message={`Are you sure you want to permanently revoke system access for ${deleteTarget?.username}? All biometric/passkey links will be severed.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

const SortIcon = ({ active, direction }) => {
  if (!active) {
    return <span className="inline-block ml-1 opacity-30 select-none">?</span>;
  }
  return direction === "asc" ? (
    <ChevronUp size={12} className="inline-block ml-1 text-primary" />
  ) : (
    <ChevronDown size={12} className="inline-block ml-1 text-primary" />
  );
};

export default UsersPage;
