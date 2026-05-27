import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../components/common/Navbar";
import Sidebar from "../components/common/Sidebar";
import { getOperationMaster, getParts, getPlants } from "../services/api";
import { useSidebar } from "../context/SidebarContext";

const PLANT_NAMES = {
  "1002": "Gurugram Plant",
  "1008": "Bawal Plant",
};

const ALLOWED_PLANT_CODES = ["1002", "1008"];

const normalizePlant = (plant) => {
  const code = String(plant?.code || plant?.plant_code || "").trim();
  return {
    id: plant?.id || code,
    code,
    name: PLANT_NAMES[code] || plant?.name || `${code} Plant`,
  };
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
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
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
  const { collapsed } = useSidebar();
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState("");
  const [parts, setParts] = useState([]);
  const [selectedPart, setSelectedPart] = useState("");
  const [operations, setOperations] = useState([]);
  const [stats, setStats] = useState({ total: 0, types: 0, linked: 0, unlinked: 0 });
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    getPlants()
      .then((response) => {
        const list = (response.data.data || [])
          .map(normalizePlant)
          .filter((plant) => ALLOWED_PLANT_CODES.includes(plant.code))
          .sort((a, b) => ALLOWED_PLANT_CODES.indexOf(a.code) - ALLOWED_PLANT_CODES.indexOf(b.code));
        setPlants(list);
        setSelectedPlant(list[0]?.code || "");
      })
      .catch(() => {
        const fallback = ALLOWED_PLANT_CODES.map((code) => ({ id: code, code, name: PLANT_NAMES[code] }));
        setPlants(fallback);
        setSelectedPlant(fallback[0].code);
      });
  }, []);

  useEffect(() => {
    if (!selectedPlant) return;
    getParts({ plant: selectedPlant, limit: 9999 })
      .then((response) => {
        setParts(response.data.data || []);
        setSelectedPart("");
      })
      .catch(() => setParts([]));
  }, [selectedPlant]);

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

  const selectedPlantName = plants.find((plant) => plant.code === selectedPlant)?.name || selectedPlant;
  const selectedPartName = selectedPart
    ? parts.find((part) => part.material_code === selectedPart)?.description || selectedPart
    : "All Parts";
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const startRow = total === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, total);

  return (
    <div className="min-h-screen bg-[#f7f7fa] app-page">
      <Navbar onLogout={onLogout} currentUser={currentUser} />
      <Sidebar />

      <main className={`pt-[94px] transition-all duration-300 ease-in-out ${
        collapsed ? "lg:pl-[72px]" : "lg:pl-72"
      }`}>
        <div className="w-full p-4 sm:p-6">
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
            <h2 className="text-lg font-extrabold text-slate-950">Operation Master</h2>
            <p className="mt-2 max-w-5xl text-sm leading-relaxed text-slate-500">
              The operation master is a list of all the existing operations registered in the plant.
              The operations can be linked to a particular part. Each operation must have a unique
              reference, and the routing data below is mapped directly from the database.
            </p>

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
                  onChange={(event) => setSearch(event.target.value)}
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
                  ) : operations.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-20 text-center text-slate-400">
                        <BriefcaseIcon className="mx-auto h-10 w-10" />
                        <p className="mt-3 text-sm font-semibold">No operations found</p>
                        <p className="mt-1 text-xs">Try changing the plant or part filter</p>
                      </td>
                    </tr>
                  ) : (
                    operations.map((operation, index) => (
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
    </div>
  );
};

const BriefcaseIcon = ({ className = "h-5 w-5" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2" /></svg>;
const TagIcon = () => <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>;
const LinkIcon = () => <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
const UnlinkIcon = () => <svg className="h-5 w-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>;
const EyeIcon = () => <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

export default OperationsMasterPage;
