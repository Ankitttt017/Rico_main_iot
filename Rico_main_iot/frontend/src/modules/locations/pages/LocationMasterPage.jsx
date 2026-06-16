import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Building2, Pencil, Plus, Power, Save, Trash2 } from "lucide-react";
import AppLayout from "../../../components/common/AppLayout";
import { createLocation, deleteLocation, getLocations, updateLocation } from "../../../services/api";
import { sortBySearchRelevance } from "../../../utils/searchRelevance";

const emptyDraft = {
  code: "",
  name: "",
  location: "",
  is_active: true,
};

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50";

function isActive(value) {
  return value === true || value === 1 || value === "1";
}

export default function LocationMasterPage({ onLogout, currentUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [locations, setLocations] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");

  const load = async () => {
    setLoading(true);
    try {
      const response = await getLocations();
      setLocations(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load locations");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locations;
    const matches = locations.filter((item) =>
      String(item.code || "").toLowerCase().includes(q) ||
      String(item.name || "").toLowerCase().includes(q) ||
      String(item.location || "").toLowerCase().includes(q)
    );
    return sortBySearchRelevance(matches, q, (item) => [item.name, item.code, item.location]);
  }, [locations, search]);

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    if (!String(draft.code || "").trim() || !String(draft.name || "").trim()) {
      toast.error("Location code and name are required");
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await updateLocation(draft.id, { ...draft, is_active: isActive(draft.is_active) });
        toast.success("Location updated");
      } else {
        await createLocation({ ...draft, is_active: isActive(draft.is_active) });
        toast.success("Location created");
      }
      setDraft(emptyDraft);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save location");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (location) => {
    if (!window.confirm(`Delete ${location.name}? Lines and machines using this location will be detached from it.`)) return;
    setBusyId(location.id);
    try {
      await deleteLocation(location.id);
      toast.success("Location deleted");
      if (draft.id === location.id) setDraft(emptyDraft);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to delete location");
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (location) => {
    const nextActive = !isActive(location.is_active);
    setBusyId(location.id);
    try {
      await updateLocation(location.id, { is_active: nextActive });
      toast.success(nextActive ? "Location enabled" : "Location disabled");
      setLocations((current) =>
        current.map((item) => item.id === location.id ? { ...item, is_active: nextActive } : item)
      );
      if (draft.id === location.id) setDraft((current) => ({ ...current, is_active: nextActive }));
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update location status");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Master Setup / Plant Manager</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Plant Manager</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Create plants, shops or factory locations before adding production lines.</p>
          </div>
          <button
            type="button"
            onClick={() => setDraft(emptyDraft)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            New Plant
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
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Address / Area</span>
              <input className={inputClass} value={draft.location || ""} onChange={(event) => setField("location", event.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Status</span>
              <select className={inputClass} value={draft.is_active ? "1" : "0"} onChange={(event) => setField("is_active", event.target.value === "1")}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Plant"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-black text-slate-900">Configured Plants</h2>
            <input
              className="h-9 w-full max-w-xs rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
              placeholder="Search plants..."
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Plant</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-sm font-bold text-slate-400">Loading...</td></tr>
                ) : filtered.map((location) => {
                  const active = isActive(location.is_active);
                  const busy = busyId === location.id;
                  return (
                  <tr key={location.id} className={active ? "hover:bg-slate-50" : "bg-slate-50/60 text-slate-500 hover:bg-slate-50"}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-black text-slate-950">{location.name}</p>
                          <p className="text-xs font-bold text-slate-400">{location.location || "No address"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-black text-slate-800">{location.code}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => toggleStatus(location)} disabled={busy} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-black disabled:opacity-60 ${active ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                          <Power className="h-3.5 w-3.5" />
                          {active ? "Disable" : "Enable"}
                        </button>
                        <button type="button" onClick={() => setDraft({ ...location, is_active: active })} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60">
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button type="button" onClick={() => remove(location)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-60">
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                })}
                {!loading && !filtered.length && (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-sm font-bold text-slate-400">No plants configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
