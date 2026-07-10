import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, Eye, Minus, Pencil, Plus, Power, RefreshCcw, Trash2, X } from "lucide-react";
import AppLayout from "../../../components/common/AppLayout";
import {
  checkAuthUsername,
  createAuthUser,
  deleteAuthUser,
  getAuthRoles,
  getAuthUsers,
  resetAuthUserPassword,
  toggleAuthUser,
  updateAuthUser,
} from "../../../services/api";

const PERMISSION_ROWS = [
  ["Master Data", "master:manage", "Plant, department, line, machine, part, operation manage"],
  ["Master Data", "master:view", "Master data view only"],
  ["PLC & Shopfloor", "plc:manage", "PLC setup and tag mapping"],
  ["PLC & Shopfloor", "plc:view", "Real-time PLC monitor"],
  ["PLC & Shopfloor", "workstation:view", "Digital workstation view"],
  ["PLC & Shopfloor", "workstation:operate", "Operator transactions"],
  ["Downtime", "downtime:view", "Downtime view"],
  ["Downtime", "downtime:manage", "Downtime logging and close"],
  ["Reports", "reports:view", "Reports view"],
  ["Reports", "reports:export", "Reports export"],
  ["External Systems", "traceability:view", "Traceability"],
  ["External Systems", "camera:view", "Live Machine View"],
  ["Quality", "ng:view", "NG signals"],
  ["Administration", "roles:manage", "User and role access"],
  ["Administration", "system:config", "System settings"],
];

const ROLE_PILL_STYLES = {
  SYSTEM_ADMIN: "bg-purple-50 text-purple-800",
  PLANT_MANAGER: "bg-green-50 text-green-800",
  SHIFT_SUPERVISOR: "bg-blue-50 text-blue-800",
  QUALITY_INSPECTOR: "bg-amber-50 text-amber-800",
  OPERATOR: "bg-gray-100 text-gray-700",
};

const ROLE_FALLBACKS = [
  {
    key: "SYSTEM_ADMIN",
    label: "System Administrator",
    description: "Full access for IT and system owners",
    landingPath: "/dashboard",
    permissions: PERMISSION_ROWS.map(([, key]) => key),
  },
  {
    key: "PLANT_MANAGER",
    label: "Plant Manager",
    description: "Reports and KPI focused view access",
    landingPath: "/dashboard",
    permissions: ["master:view", "plc:view", "workstation:view", "downtime:view", "reports:view", "reports:export", "traceability:view", "camera:view", "ng:view"],
  },
  {
    key: "SHIFT_SUPERVISOR",
    label: "Shift Supervisor",
    description: "Monitor, operate and log downtime",
    landingPath: "/plc-monitor",
    permissions: ["plc:view", "workstation:view", "workstation:operate", "downtime:view", "downtime:manage", "reports:view", "traceability:view", "camera:view", "ng:view"],
  },
  {
    key: "QUALITY_INSPECTOR",
    label: "Quality Inspector",
    description: "Quality data, NG signals and traceability",
    landingPath: "/plc-report",
    permissions: ["plc:view", "reports:view", "traceability:view", "camera:view", "ng:view"],
  },
  {
    key: "OPERATOR",
    label: "Operator",
    description: "Shopfloor workstation only",
    landingPath: "/operator-workstation",
    permissions: ["workstation:view", "workstation:operate"],
  },
];

const emptyForm = {
  fullName: "",
  employeeId: "",
  username: "",
  email: "",
  password: "",
  department: "",
  role: "OPERATOR",
  landingPath: "/operator-workstation",
  permissions: ["workstation:view", "workstation:operate"],
  isActive: true,
};

function canManage(currentUser) {
  return Array.isArray(currentUser?.permissions) && currentUser.permissions.includes("roles:manage");
}

function isDefaultAdmin(user) {
  return String(user?.username || "").toLowerCase() === "admin";
}

function roleLabel(roles, key) {
  return roles.find((role) => role.key === key)?.label || key;
}

function roleLanding(roles, key) {
  return roles.find((role) => role.key === key)?.landingPath || "/dashboard";
}

function rolePermissions(roles, key) {
  return roles.find((role) => role.key === key)?.permissions || [];
}

function initials(name = "") {
  return String(name || "U").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function suggestUsername(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^\.+|\.+$/g, "");
}

function validateStep(step, form, mode) {
  const errors = {};
  if (step === 1) {
    if (mode === "create" && !/^[a-z][a-z0-9._-]{2,29}$/.test(form.username)) errors.username = "Lowercase username, 3-30 chars";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email";
    if (mode === "create" && !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password)) errors.password = "Min 8 chars, 1 uppercase, 1 number";
    if (mode === "edit" && form.password && !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password)) errors.password = "Min 8 chars, 1 uppercase, 1 number";
  }
  if (step === 2) {
    if (!form.role) errors.role = "Role required";
    if (!form.permissions.length) errors.permissions = "Select at least one permission";
  }
  return errors;
}

function CreateUserModal({ isOpen, onClose, onSuccess, user, roles, currentUser }) {
  const mode = user ? "edit" : "create";
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (user) {
      setForm({
        fullName: user.fullName || user.name || "",
        employeeId: user.employeeId || "",
        username: user.username || "",
        email: user.email || "",
        password: "",
        department: user.department || "",
        role: user.role || user.role_key || "OPERATOR",
        landingPath: user.landingPath || roleLanding(roles, user.role || user.role_key),
        permissions: user.permissions || rolePermissions(roles, user.role || user.role_key),
        isActive: user.isActive !== false,
      });
    } else {
      setForm(emptyForm);
    }
    setStep(1);
    setErrors({});
  }, [isOpen, roles, user]);

  if (!isOpen) return null;

  const setRole = (roleKey) => {
    setForm((current) => ({
      ...current,
      role: roleKey,
      landingPath: roleLanding(roles, roleKey),
      permissions: rolePermissions(roles, roleKey),
    }));
  };

  const togglePermission = (permission) => {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  const next = async () => {
    const nextErrors = validateStep(step, form, mode);
    if (step === 1 && mode === "create" && !nextErrors.username) {
      try {
        const response = await checkAuthUsername(form.username);
        if (!response.data?.available) nextErrors.username = "Username already taken";
      } catch {
        nextErrors.username = "Unable to check username";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setStep((current) => Math.min(3, current + 1));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        fullName: form.username,
        performedBy: currentUser?.username || currentUser?.name || "admin",
      };
      const response = mode === "edit" ? await updateAuthUser(user.id, payload) : await createAuthUser(payload);
      onSuccess(response.data?.data || response.data?.user);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1a2332]">{mode === "edit" ? `Edit user - ${user.username}` : "Create user"}</h2>
            <p className="mt-1 text-sm text-[#6b7a8d]">Basic info, role access and confirmation</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-slate-100 px-5 py-3">
          {["Basic info", "Role & access", "Confirm"].map((label, index) => (
            <span key={label} className={`rounded-full px-3 py-1 text-xs font-semibold ${step === index + 1 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
              {index + 1}. {label}
            </span>
          ))}
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-5">
          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Username" error={errors.username}>
                <input
                  disabled={mode === "edit"}
                  placeholder="operator01"
                  className="app-field h-10 w-full rounded-lg border px-3 lowercase disabled:bg-slate-100"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    username: event.target.value.toLowerCase().replace(/\s+/g, ""),
                    fullName: event.target.value.toLowerCase().replace(/\s+/g, ""),
                  }))}
                />
              </Field>
              <Field label={mode === "edit" ? "Password (leave blank to keep current)" : "Password"} error={errors.password}>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} placeholder="Password123" className="app-field h-10 w-full rounded-lg border px-3 pr-10" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">show</button>
                </div>
              </Field>
              <Field label="Email" error={errors.email}>
                <input placeholder="user@rico.com" className="app-field h-10 w-full rounded-lg border px-3" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </Field>
              <Field label="Department">
                <input placeholder="Production" className="app-field h-10 w-full rounded-lg border px-3" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} />
              </Field>
              <Field label="Employee ID">
                <input placeholder="E-1001" className="app-field h-10 w-full rounded-lg border px-3" value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {mode === "edit" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">Changing role will update all permissions.</div>}
              <div className="grid gap-3 md:grid-cols-2">
                {roles.map((role) => (
                  <button key={role.key} type="button" onClick={() => setRole(role.key)} className={`relative rounded-lg border p-4 text-left transition ${form.role === role.key ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}>
                    {form.role === role.key && <Check className="absolute right-3 top-3 h-4 w-4 text-blue-600" />}
                    <p className="text-sm font-semibold text-[#1a2332]">{role.label}</p>
                    <p className="mt-1 text-xs text-[#6b7a8d]">{role.description}</p>
                    <p className="mt-2 text-xs font-semibold text-blue-700">{role.landingPath}</p>
                  </button>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-[#1a2332]">Permissions jo milenge</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {PERMISSION_ROWS.map(([, key, label]) => (
                    <label key={key} className="flex items-start gap-2 rounded-md bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-100">
                      <input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePermission(key)} className="mt-0.5" />
                      <span><b>{key}</b><br />{label}</span>
                    </label>
                  ))}
                </div>
                {errors.permissions && <p className="mt-2 text-xs text-red-600">{errors.permissions}</p>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">{initials(form.username)}</div>
                <div>
                  <p className="text-lg font-semibold text-[#1a2332]">{form.username}</p>
                  <p className="text-sm text-[#6b7a8d]">{form.username} {form.email ? `| ${form.email}` : ""}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Info label="Role" value={roleLabel(roles, form.role)} />
                <Info label="Landing page" value={form.landingPath} />
                <Info label="Department" value={form.department || "-"} />
                <Info label="Status" value={form.isActive ? "Active" : "Inactive"} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {form.permissions.map((permission) => <span key={permission} className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{permission}</span>)}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={() => step === 1 ? onClose() : setStep((current) => current - 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button type="button" onClick={next} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Next</button>
          ) : (
            <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Create user"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6b7a8d]">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6b7a8d]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#1a2332]">{value}</p>
    </div>
  );
}

export default function UserAccessPage({ onLogout, currentUser }) {
  const [roles, setRoles] = useState(ROLE_FALLBACKS);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalUser, setModalUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [highlightedUserId, setHighlightedUserId] = useState(null);
  const canEdit = canManage(currentUser);

  const load = async () => {
    setLoading(true);
    try {
      const [roleResponse, userResponse] = await Promise.all([getAuthRoles(), getAuthUsers()]);
      if (Array.isArray(roleResponse.data?.data) && roleResponse.data.data.length) setRoles(roleResponse.data.data);
      setUsers(Array.isArray(userResponse.data?.data) ? userResponse.data.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load user access");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const permissionRows = useMemo(() => PERMISSION_ROWS.map(([group, key, label]) => ({ group, key, label })), []);

  const handleSuccess = (user) => {
    toast.success(`User "${user.fullName || user.username}" saved`);
    load();
    setHighlightedUserId(user.id);
    window.setTimeout(() => setHighlightedUserId(null), 3000);
  };

  const toggleStatus = async (user) => {
    await toggleAuthUser(user.id);
    toast.success(user.isActive ? "User deactivated" : "User activated");
    load();
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Delete ${user.fullName || user.username}?`)) return;
    await deleteAuthUser(user.id);
    toast.success("User deleted");
    load();
  };

  const resetPassword = async (user) => {
    const password = window.prompt(`New password for ${user.username}`);
    if (!password) return;
    await resetAuthUserPassword(user.id, { password });
    toast.success("Password reset");
  };

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c8d8e8] bg-white px-5 py-4 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-[#1a2332]">User & Role Access</h1>
            <p className="mt-1 text-sm text-[#6b7a8d]">Create users, assign roles, and control exactly what each person can see.</p>
          </div>
          {canEdit && (
            <button type="button" onClick={() => { setModalUser(null); setModalOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              Create user
            </button>
          )}
        </div>

        <section className="grid gap-3 xl:grid-cols-5">
          {roles.map((role) => (
            <article key={role.key} className="rounded-lg border border-[#c8d8e8] bg-white p-4 shadow-sm">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_PILL_STYLES[role.key] || "bg-slate-100 text-slate-700"}`}>{role.label}</span>
              <p className="mt-3 min-h-[34px] text-xs leading-5 text-[#6b7a8d]">{role.description}</p>
              <p className="mt-3 text-xs font-semibold text-blue-700">{role.landingPath}</p>
              <p className="mt-2 text-xs text-slate-400">{role.permissions?.length || 0} permissions</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-lg border border-[#c8d8e8] bg-white shadow-sm">
          <div className="border-b border-[#d7e5f3] px-5 py-4">
            <h2 className="text-base font-semibold text-[#1a2332]">Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-[#eef5ff] text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6b7a8d]">
                <tr>
                  <th className="px-4 py-3"></th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Landing page</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading users...</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id} className={highlightedUserId === user.id ? "bg-emerald-50 transition-colors" : "hover:bg-slate-50"}>
                    <td className="px-4 py-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{initials(user.fullName || user.username)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1a2332]">{user.fullName || user.username}</p>
                      <p className="text-xs text-[#6b7a8d]">{user.username}{user.email ? ` | ${user.email}` : ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_PILL_STYLES[user.role] || "bg-slate-100 text-slate-700"}`}>
                        {user.roleLabel || roleLabel(roles, user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{user.landingPath}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button title="Edit" disabled={!canEdit} onClick={() => { setModalUser(user); setModalOpen(true); }} className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
                        <button title={isDefaultAdmin(user) ? "Default admin cannot be disabled" : "Activate / deactivate"} disabled={!canEdit || isDefaultAdmin(user)} onClick={() => toggleStatus(user)} className="rounded-md border border-slate-200 p-2 text-amber-600 hover:bg-amber-50 disabled:opacity-40"><Power className="h-4 w-4" /></button>
                        <button title="Reset password" disabled={!canEdit} onClick={() => resetPassword(user)} className="rounded-md border border-slate-200 p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-40"><RefreshCcw className="h-4 w-4" /></button>
                        <button title={isDefaultAdmin(user) ? "Default admin cannot be deleted" : "Delete"} disabled={!canEdit || isDefaultAdmin(user)} onClick={() => removeUser(user)} className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !users.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No users found</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#c8d8e8] bg-white shadow-sm">
          <div className="border-b border-[#d7e5f3] px-5 py-4">
            <h2 className="text-base font-semibold text-[#1a2332]">Access Matrix</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-[#eef5ff] text-[#6b7a8d]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em]">Area</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em]">Permission</th>
                  {roles.map((role) => <th key={role.key} className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.05em]">{role.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permissionRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 font-semibold text-[#1a2332]">{row.group}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{row.label}</p>
                      <p className="text-xs text-slate-400">{row.key}</p>
                    </td>
                    {roles.map((role) => {
                      const allowed = role.permissions?.includes(row.key);
                      const viewOnly = !allowed && row.key.endsWith(":manage") && role.permissions?.includes(row.key.replace(":manage", ":view"));
                      return (
                        <td key={`${role.key}-${row.key}`} className="px-4 py-3 text-center">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${allowed ? "bg-emerald-100 text-emerald-700" : viewOnly ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
                            {allowed ? <Check className="h-4 w-4" /> : viewOnly ? <Eye className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <CreateUserModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
        user={modalUser}
        roles={roles}
        currentUser={currentUser}
      />
    </AppLayout>
  );
}
