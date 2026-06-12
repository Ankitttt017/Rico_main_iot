import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Save, X } from "lucide-react";
import AppLayout from "../../../components/common/AppLayout";
import { createOperation, getOperationMaster, getParts, getPlants } from "../../../services/api";
import { DEFAULT_PLANTS } from "../../parts/constants";
import { normalizePlants } from "../../parts/utils/plantUtils";
import { sortBySearchRelevance } from "../../../utils/searchRelevance";

const emptyOperationDraft = {
  part_code: "",
  operation_no: "",
  operation_name: "",
};

const StatCard = ({ value, label, icon, color = "text-blue-600", accent = "border-t-blue-600" }) => (
  <div className={`flex min-h-[104px] items-center rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm ${accent} border-t-[3px]`}>
    <div className="w-full">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-600">{label}</p>
        <span className="text-slate-300">{icon}</span>
      </div>
      <span className={`mt-4 block text-4xl font-black leading-none ${color}`}>{value}</span>
    </div>
  </div>
);

const TypeBadge = ({ type }) => {
  const key = String(type || "").toUpperCase();
  const classes = {
    CASTING: "bg-teal-50 text-teal-700",
    MACHINING: "bg-blue-50 text-blue-700",
    INSPECTION: "bg-emerald-50 text-emerald-700",
    ASSEMBLY: "bg-purple-50 text-purple-700",
    PAINTING: "bg-pink-50 text-pink-700",
    RECORDED: "bg-slate-100 text-slate-600",
  };

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-extrabold ${classes[key] || "bg-slate-100 text-slate-600"}`}>
      {type || "-"}
    </span>
  );
};

const Dropdown = ({ label, value, options, onChange, placeholder, searchable = false }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = searchable
    ? sortBySearchRelevance(
        options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())),
        query,
        (option) => [option.label, option.value]
      )
    : options;

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="relative w-56">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="app-field flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-4 focus:ring-teal-50"
        >
          <span className="truncate">{selected?.label || placeholder}</span>
          <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            {searchable && (
              <div className="border-b p-2">
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:outline-none"
                  placeholder="Search..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">No results</p>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value || "all"}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      option.value === value ? "app-selected font-semibold" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block truncate">{option.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
    </div>
  );
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const OperationsMasterPage = ({ onLogout, currentUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState("");
  const [parts, setParts] = useState([]);
  const [selectedPart, setSelectedPart] = useState("");
  const [operations, setOperations] = useState([]);
  const [stats, setStats] = useState({ total: 0, types: 0, linked: 0, unlinked: 0 });
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [operationDraft, setOperationDraft] = useState(emptyOperationDraft);
  const [savingOperation, setSavingOperation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    getPlants()
      .then((response) => {
        const list = normalizePlants(response.data.data || []);
        setPlants(list);
        setSelectedPlant(list[0]?.code || "");
      })
      .catch(() => {
        const fallback = normalizePlants(DEFAULT_PLANTS);
        setPlants(fallback);
        setSelectedPlant(fallback[0]?.code || "");
      });
  }, []);

  useEffect(() => {
    if (!selectedPlant) return;
    getParts({ plant: selectedPlant, limit: 9999 })
      .then((response) => {
        setParts(response.data.data || []);
        setSelectedPart("");
        setOperationDraft((current) => ({ ...current, part_code: "" }));
      })
      .catch(() => setParts([]));
  }, [selectedPlant]);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);

  const handleSearchChange = (value) => {
    setSearch(value);
    if (value.trim()) setSearchParams({ search: value });
    else setSearchParams({});
  };

  const fetchOperations = useCallback(() => {
    if (!selectedPlant) return;
    setLoading(true);
    getOperationMaster({
      plant: selectedPlant,
      part: selectedPart || undefined,
      search: search || undefined,
      page,
      limit: rowsPerPage,
    })
      .then((response) => {
        setOperations(response.data.data || []);
        setStats(response.data.stats || { total: 0, types: 0, linked: 0, unlinked: 0 });
        setTotal(response.data.total || 0);
      })
      .catch(() => {
        setOperations([]);
        setStats({ total: 0, types: 0, linked: 0, unlinked: 0 });
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [page, search, selectedPart, selectedPlant]);

  useEffect(() => {
    const timer = setTimeout(fetchOperations, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [fetchOperations, search]);

  useEffect(() => setPage(1), [selectedPlant, selectedPart, search]);

  const plantOptions = plants.map((plant) => ({ value: plant.code, label: plant.name }));
  const partOptions = useMemo(() => [
    { value: "", label: "All Parts" },
    ...parts.map((part) => ({ value: part.material_code, label: part.description || part.material_code })),
  ], [parts]);

  const addPartOptions = useMemo(() => parts.map((part) => ({
    value: part.material_code,
    label: part.description || part.material_code,
  })), [parts]);

  const openOperationModal = () => {
    setOperationDraft({
      ...emptyOperationDraft,
      part_code: selectedPart || parts[0]?.material_code || "",
    });
    setOperationModalOpen(true);
  };

  const saveOperation = async () => {
    if (!operationDraft.part_code || !operationDraft.operation_no.trim() || !operationDraft.operation_name.trim()) {
      toast.error("Part, operation number aur operation name required hai");
      return;
    }

    setSavingOperation(true);
    try {
      await createOperation(operationDraft);
      setOperationModalOpen(false);
      setOperationDraft(emptyOperationDraft);
      toast.success("Operation created");
      fetchOperations();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save operation");
    } finally {
      setSavingOperation(false);
    }
  };

  const selectedPlantName = plants.find((plant) => plant.code === selectedPlant)?.name || selectedPlant;
  const selectedPartName = selectedPart
    ? parts.find((part) => part.material_code === selectedPart)?.description || selectedPart
    : "All Parts";
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const startRow = total === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, total);
  const visibleOperations = useMemo(
    () => sortBySearchRelevance(operations, search, (operation) => [
      operation.operation_name,
      operation.operation_id,
      operation.part_code,
      operation.linked_part,
      operation.type,
    ]),
    [operations, search]
  );

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      {operationModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-950">Add Operation</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Select part and enter operation details.</p>
              </div>
              <button
                type="button"
                onClick={() => setOperationModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Part</span>
                <select
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                  value={operationDraft.part_code}
                  onChange={(event) => setOperationDraft((current) => ({ ...current, part_code: event.target.value }))}
                >
                  <option value="">Select part</option>
                  {addPartOptions.map((part) => (
                    <option key={part.value} value={part.value}>{part.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Operation No.</span>
                <input
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                  value={operationDraft.operation_no}
                  onChange={(event) => setOperationDraft((current) => ({ ...current, operation_no: event.target.value.toUpperCase() }))}
                  placeholder="OP-10"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Operation Name</span>
                <input
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                  value={operationDraft.operation_name}
                  onChange={(event) => setOperationDraft((current) => ({ ...current, operation_name: event.target.value }))}
                  placeholder="Machining / Inspection"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={() => setOperationModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={saveOperation} disabled={savingOperation} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
                <Save className="h-4 w-4" />
                {savingOperation ? "Saving..." : "Save Operation"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main>
        <div className="w-full">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-950">Organisation Master</h1>
            <span className="text-slate-300">|</span>
            <nav className="flex items-center gap-1 text-sm text-slate-500">
              <span className="app-brand-text font-medium">Part & Operations</span>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium text-gray-600">Operation Master</span>
            </nav>
          </div>

          <section className="app-panel mb-6 w-full rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">Operation Master</h2>
                <p className="mt-2 max-w-5xl text-sm leading-relaxed text-slate-500">
                  Create operations against a selected part.
                </p>
              </div>
              <button
                type="button"
                onClick={openOperationModal}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" />
                Add Operation
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-4">
              <Dropdown
                label="Select Plant"
                value={selectedPlant}
                options={plantOptions}
                onChange={setSelectedPlant}
                placeholder="Select plant..."
              />
              <Dropdown
                label="Select Part"
                value={selectedPart}
                options={partOptions}
                onChange={setSelectedPart}
                placeholder="All Parts"
                searchable
              />
            </div>

            <h3 className="mt-5 text-base font-bold text-slate-700">Overall Statistics</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              This section gives an overall summary of registered operations for the selected plant and part.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard value={stats.total} label="Operations Registered" icon={<BriefcaseIcon />} />
              <StatCard value={stats.types} label="Operations Types" color="text-orange-600" accent="border-t-orange-500" icon={<TagIcon />} />
              <StatCard value={stats.linked} label="Operations Linked" color="text-emerald-600" accent="border-t-emerald-500" icon={<LinkIcon />} />
              <StatCard value={stats.unlinked} label="Operations Unlinked" color="text-red-600" accent="border-t-red-500" icon={<UnlinkIcon />} />
            </div>

            <p className="mt-4 text-xs font-semibold text-[#7667ff]">
              {selectedPlantName} &gt; {selectedPartName}
            </p>
          </section>

          <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Show</span>
                <span className="rounded-md border border-slate-200 px-3 py-2 font-semibold text-slate-700">10</span>
                <span>entries</span>
              </div>
              <label className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  className="app-field h-10 w-64 rounded-lg border bg-slate-50 pl-9 pr-3 text-sm focus:outline-none focus:ring-4 focus:ring-teal-50"
                  placeholder="Search operations..."
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1280px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">SR. NO.</th>
                    <th className="px-4 py-3">Operation No.</th>
                    <th className="px-4 py-3">Operation Name</th>
                    <th className="px-4 py-3">OPS</th>
                    <th className="px-4 py-3">Tools</th>
                    <th className="px-4 py-3">Inspection</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Linked Part</th>
                    <th className="px-4 py-3">Modified</th>
                    <th className="px-4 py-3">Rework</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="py-20 text-center">
                        <svg className="mx-auto h-8 w-8 animate-spin text-[#7667ff]" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="mt-3 text-xs text-slate-400">Loading operations...</p>
                      </td>
                    </tr>
                  ) : visibleOperations.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-20 text-center text-slate-400">
                        <BriefcaseIcon className="mx-auto h-10 w-10" />
                        <p className="mt-3 text-sm font-semibold">No operations found</p>
                        <p className="mt-1 text-xs">Try changing the plant or part filter</p>
                      </td>
                    </tr>
                  ) : (
                    visibleOperations.map((operation, index) => (
                      <tr key={operation.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-500">{startRow + index}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-[#7667ff]">{operation.operation_id || "-"}</span>
                        </td>
                        <td className="max-w-[360px] px-4 py-3 font-medium text-slate-700">
                          <p className="truncate" title={operation.operation_name}>{operation.operation_name || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-500">Not Available</td>
                        <td className="px-4 py-3 text-slate-500">{operation.machine_count > 0 ? `${operation.machine_count} Machine` : "Not Linked"}</td>
                        <td className="px-4 py-3 text-slate-500">0</td>
                        <td className="px-4 py-3"><TypeBadge type={operation.type} /></td>
                        <td className="max-w-[220px] px-4 py-3">
                          <div className="flex items-center gap-2 text-[#7667ff]">
                            <EyeIcon />
                            <span className="truncate" title={operation.linked_part || operation.part_code}>
                              {operation.linked_part || operation.part_code || "-"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(operation.modified_at)}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {operation.rework && operation.rework !== "No rework assigned" ? operation.rework : <span className="italic text-slate-400">No rework assigned</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-400">
              <span>Showing {startRow} to {endRow} of {total} entries</span>
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1} className="rounded-full px-3 py-1 text-slate-500 hover:bg-white disabled:opacity-30">
                  ‹
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                  const value = Math.max(1, Math.min(page - 2, totalPages - 4)) + index;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPage(value)}
                      className={`h-8 min-w-8 rounded-full px-2 font-semibold ${value === page ? "bg-[#7667ff] text-white" : "text-slate-600 hover:bg-white"}`}
                    >
                      {value}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page === totalPages} className="rounded-full px-3 py-1 text-slate-500 hover:bg-white disabled:opacity-30">
                  ›
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};

const BriefcaseIcon = ({ className = "h-5 w-5" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2" /></svg>;
const TagIcon = () => <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>;
const LinkIcon = () => <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
const UnlinkIcon = () => <svg className="h-5 w-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>;
const EyeIcon = () => <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

export default OperationsMasterPage;
