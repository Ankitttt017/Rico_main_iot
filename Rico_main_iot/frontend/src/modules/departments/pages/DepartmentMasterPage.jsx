import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Factory, Pencil, Plus, Power, Save, Trash2 } from "lucide-react";
import AppLayout from "../../../components/common/AppLayout";
import SearchableSelect from "../../../components/common/SearchableSelect";
import { sortBySearchRelevance } from "../../../utils/searchRelevance";
import {
  createDepartment,
  deleteDepartment,
  getDepartments,
  getLocations,
  updateDepartment,
} from "../../../services/api";

const emptyDraft = { code: "", name: "", plant_code: "", description: "", is_active: true };
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50";

function isActive(value) {
  return value === true || value === 1 || value === "1";
}

export default function DepartmentMasterPage({ onLogout, currentUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");

  const load = async () => {
    setLoading(true);
    try {
      const [departmentResponse, locationResponse] = await Promise.all([getDepartments(), getLocations({ active: 1 })]);
      setDepartments(Array.isArray(departmentResponse.data?.data) ? departmentResponse.data.data : []);
      setLocations(Array.isArray(locationResponse.data?.data) ? locationResponse.data.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);

  const handleSearchChange = (value) => {
    setSearch(value);
    if (value.trim()) setSearchParams({ search: value });
    else setSearchParams({});
  };

  const locationOptions = useMemo(() => [
    { value: "", label: "All Locations", description: "Available for every plant" },
    ...locations.map((location) => ({
      value: location.code,
      label: `${location.name} (${location.code})`,
      description: location.location || location.name,
      keywords: `${location.name} ${location.code} ${location.location || ""}`,
    })),
  ], [locations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    const matches = departments.filter((item) =>
      String(item.code || "").toLowerCase().includes(q) ||
      String(item.name || "").toLowerCase().includes(q) ||
      String(item.description || "").toLowerCase().includes(q)
    );
    return sortBySearchRelevance(matches, q, (item) => [item.name, item.code, item.description, item.plant_code]);
  }, [departments, search]);

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    if (!String(draft.code || "").trim() || !String(draft.name || "").trim()) {
      toast.error("Department code and name are required");
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await updateDepartment(draft.id, { ...draft, is_active: isActive(draft.is_active) });
        toast.success("Department updated");
      } else {
        await createDepartment({ ...draft, is_active: isActive(draft.is_active) });
        toast.success("Department created");
      }
      setDraft(emptyDraft);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save department");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (department) => {
    if (!window.confirm(`Delete ${department.name}? Lines using this department will be detached from it.`)) return;
    setBusyId(department.id);
    try {
      await deleteDepartment(department.id);
      toast.success("Department deleted");
      if (draft.id === department.id) setDraft(emptyDraft);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to delete department");
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (department) => {
    const nextActive = !isActive(department.is_active);
    setBusyId(department.id);
    try {
      await updateDepartment(department.id, { is_active: nextActive });
      toast.success(nextActive ? "Department enabled" : "Department disabled");
      setDepartments((current) =>
        current.map((item) => item.id === department.id ? { ...item, is_active: nextActive } : item)
      );
      if (draft.id === department.id) setDraft((current) => ({ ...current, is_active: nextActive }));
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update department status");
    } finally {
      setBusyId(null);
    }
  };

  const locationName = (code) => locations.find((location) => location.code === code)?.name || "All Locations";

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Master Setup / Department Manager</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Department Manager</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Create departments such as HPDC, Machining, Assembly or Paint Shop for line filtering.</p>
          </div>
          <button type="button" onClick={() => setDraft(emptyDraft)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            <Plus className="h-4 w-4" />
            New Department
          </button>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-4 p-5 md:grid-cols-4">
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Code</span>
              <input className={inputClass} value={draft.code || ""} onChange={(event) => setField("code", event.target.value.toUpperCase())} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Name</span>
              <input className={inputClass} value={draft.name || ""} onChange={(event) => setField("name", event.target.value)} />
            </label>
            <div>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Location Scope</span>
              <SearchableSelect value={draft.plant_code || ""} options={locationOptions} placeholder="All Locations" onChange={(value) => setField("plant_code", value)} />
            </div>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Status</span>
              <select className={inputClass} value={draft.is_active ? "1" : "0"} onChange={(event) => setField("is_active", event.target.value === "1")}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end border-t border-slate-100 px-5 py-4">
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Department"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-black text-slate-900">Configured Departments</h2>
            <input className="h-9 w-full max-w-xs rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" placeholder="Search departments..." value={search} onChange={(event) => handleSearchChange(event.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-sm font-bold text-slate-400">Loading...</td></tr>
                ) : filtered.map((department) => {
                  const active = isActive(department.is_active);
                  const busy = busyId === department.id;
                  return (
                  <tr key={department.id} className={active ? "hover:bg-slate-50" : "bg-slate-50/60 text-slate-500 hover:bg-slate-50"}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400"}`}><Factory className="h-4 w-4" /></span>
                        <div>
                          <p className="font-black text-slate-950">{department.name}</p>
                          <p className="text-xs font-bold text-slate-400">{department.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{locationName(department.plant_code)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{active ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => toggleStatus(department)} disabled={busy} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-black disabled:opacity-60 ${active ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                          <Power className="h-3.5 w-3.5" />
                          {active ? "Disable" : "Enable"}
                        </button>
                        <button type="button" onClick={() => setDraft({ ...department, is_active: active })} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60"><Pencil className="h-3.5 w-3.5" />Edit</button>
                        <button type="button" onClick={() => remove(department)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {!loading && !filtered.length && <tr><td colSpan="4" className="px-4 py-8 text-center text-sm font-bold text-slate-400">No departments configured</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
