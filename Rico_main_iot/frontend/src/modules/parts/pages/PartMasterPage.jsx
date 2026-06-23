import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Save, X } from "lucide-react";
import AppLayout from "../../../components/common/AppLayout";
import Pagination from "../../../components/common/Pagination";
import { createPart, getPlants, getParts } from "../../../services/api";
import { useI18n } from "../../../context/I18nContext";
import { DEFAULT_PLANTS, PAGE_SIZE } from "../constants";
import { normalizePlants } from "../utils/plantUtils";
import { sortBySearchRelevance } from "../../../utils/searchRelevance";

const emptyPartDraft = {
  material_code: "",
  description: "",
  plant_code: "",
  material_group: "",
  unit_of_measure: "EA",
};

const inputClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-50";

const PartMasterPage = ({ onLogout, currentUser }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [parts, setParts] = useState([]);
  const [partGroups, setPartGroups] = useState([]);
  const [stats, setStats] = useState({ part_types: 0, linked: 0, unlinked: 0 });
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [plantSearch, setPlantSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [partDraft, setPartDraft] = useState(emptyPartDraft);
  const [savingPart, setSavingPart] = useState(false);
  const [error, setError] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);

  // Load plants on mount
  useEffect(() => {
    getPlants()
      .then(r => {
        const plantList = normalizePlants(r.data.data || []);
        setPlants(plantList);
        if (plantList.length > 0) setSelectedPlant(plantList[0]);
      })
      .catch(() => {
        const plantList = normalizePlants(DEFAULT_PLANTS);
        setPlants(plantList);
        setSelectedPlant(plantList[0]);
        setError(t("loadPlantsError"));
      });
  }, [t]);

  // Load parts whenever plant/search/group changes
  const fetchParts = useCallback(() => {
    if (!selectedPlant) return;
    setLoading(true);
    setError("");
    getParts({ plant: selectedPlant.code, search, group: groupFilter, page, limit: PAGE_SIZE })
      .then(r => {
        setParts(r.data.data);
        setStats(r.data.stats || {});
        setPartGroups(Array.isArray(r.data.groups) ? r.data.groups : []);
        setTotal(r.data.total || 0);
      })
      .catch(() => setError(t("loadPartsError")))
      .finally(() => setLoading(false));
  }, [selectedPlant, search, groupFilter, page, t]);

  useEffect(() => {
    const timer = setTimeout(fetchParts, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchParts]);

  useEffect(() => {
    const querySearch = searchParams.get("search") || "";
    setSearch(querySearch);
  }, [searchParams]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
    if (value) {
      setSearchParams({ search: value });
    } else {
      setSearchParams({});
    }
  };

  const handleSelectPlant = (plant) => {
    setSelectedPlant(plant);
    setGroupFilter("");
    setPage(1);
    setDropdownOpen(false);
    setPlantSearch("");
  };

  const openPartModal = () => {
    setPartDraft({
      ...emptyPartDraft,
      plant_code: selectedPlant?.code || plants[0]?.code || "",
    });
    setPartModalOpen(true);
  };

  const setPartField = (field, value) => {
    setPartDraft((current) => ({ ...current, [field]: value }));
  };

  const savePart = async () => {
    if (!partDraft.material_code.trim() || !partDraft.description.trim() || !partDraft.plant_code) {
      toast.error("Part code, part name, and location are required.");
      return;
    }

    setSavingPart(true);
    try {
      await createPart({
        ...partDraft,
        registered_by: currentUser?.name || currentUser?.username || "Admin",
      });
      const nextPlant = plants.find((plant) => plant.code === partDraft.plant_code);
      const shouldFetchCurrentPlant = !nextPlant || nextPlant.code === selectedPlant?.code;
      if (nextPlant && nextPlant.code !== selectedPlant?.code) setSelectedPlant(nextPlant);
      setSearch("");
      setGroupFilter("");
      setPage(1);
      setSearchParams({});
      setPartModalOpen(false);
      setPartDraft(emptyPartDraft);
      toast.success("Part saved");
      if (shouldFetchCurrentPlant) setTimeout(fetchParts, 0);
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to save part");
    } finally {
      setSavingPart(false);
    }
  };

  const filteredPlants = sortBySearchRelevance(plants.filter(p => {
    const query = plantSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      p.code.toLowerCase().includes(query) ||
      p.location.toLowerCase().includes(query)
    );
  }), plantSearch, (plant) => [plant.name, plant.code, plant.location]);

  const visibleParts = sortBySearchRelevance(parts, search, (part) => [
    part.description,
    part.material_code,
    part.material_group,
    part.manufacturing_type,
    part.plant_code,
  ]);

  const groupOptions = [
    { label: t("all"), value: "" },
    ...partGroups.map((group) => ({
      label: `${group.value}${group.total ? ` (${group.total})` : ""}`,
      value: group.value,
    })),
  ];
  const selectedGroup = groupOptions.find(f => f.value === groupFilter) || groupOptions[0];

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
          {partModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
              <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">Add Part</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">Select location, enter part code and name.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPartModalOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Location / Plant</span>
                    <select className={inputClass} value={partDraft.plant_code} onChange={(event) => setPartField("plant_code", event.target.value)}>
                      <option value="">Select location</option>
                      {plants.map((plant) => (
                        <option key={plant.code} value={plant.code}>
                          {plant.name} ({plant.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Material Code</span>
                    <input className={inputClass} value={partDraft.material_code} onChange={(event) => setPartField("material_code", event.target.value.toUpperCase())} placeholder="80000123" />
                  </label>
                  <label className="md:col-span-2">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Part Name</span>
                    <input className={inputClass} value={partDraft.description} onChange={(event) => setPartField("description", event.target.value)} placeholder="Brake Drum / Adapter Cover" />
                  </label>
                  <label className="md:col-span-2">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Part Type / Group</span>
                    <input className={inputClass} value={partDraft.material_group} onChange={(event) => setPartField("material_group", event.target.value)} placeholder="FG / Casting / Machining" />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
                  <button type="button" onClick={() => setPartModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="button" onClick={savePart} disabled={savingPart} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
                    <Save className="h-4 w-4" />
                    {savingPart ? "Saving..." : "Save Part"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Breadcrumb */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-950">Part Manager</h1>
            <span className="text-slate-300">|</span>
            <nav className="flex items-center gap-1 text-sm text-slate-500">
              <span className="app-brand-text font-medium">Master Setup</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium text-gray-600">Part Manager</span>
            </nav>
          </div>

          {/* Main Card — full width */}
          <div className="app-panel mb-6 w-full rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{t("partMasterTitle")}</h2>
                <p className="max-w-4xl text-sm leading-relaxed text-slate-500">
                  {t("partMasterDescription")}
                </p>
              </div>
              <button
                type="button"
                onClick={openPartModal}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" />
                Add Part
              </button>
            </div>

            {/* Filters */}
            <div className="mb-5 flex flex-wrap items-end gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">

              {/* ── Plant selector ── */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("selectPlant")}
                </label>
                <div className="relative w-72">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(prev => !prev)}
                    className="app-field flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-4 focus:ring-teal-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">
                        {selectedPlant ? selectedPlant.name : `${t("selectPlant")}...`}
                      </span>
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-1 ${dropdownOpen ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <div className="p-2 border-b">
                        <input
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:outline-none"
                          placeholder={t("searchPlant")}
                          value={plantSearch}
                          onChange={e => setPlantSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto py-1">
                        {filteredPlants.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-3">No plants found</p>
                        ) : (
                          filteredPlants.map(plant => (
                            <button
                              key={plant.id}
                              type="button"
                              onClick={() => handleSelectPlant(plant)}
                              className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${plant.code === selectedPlant?.code
                                ? "app-selected font-semibold"
                                : "text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                              <span className="block truncate font-semibold">{plant.name}</span>
                              {plant.location && (
                                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                  {plant.location}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Search */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("searchPart")}
                </label>
                <div className="relative w-64">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    className="app-field w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-4 focus:ring-teal-50"
                    placeholder={t("enterPartName")}
                    value={search}
                    onChange={e => handleSearchChange(e.target.value)}
                  />
                </div>
              </div>

              {/*   type filter */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("partType")}
                </label>
                <div className="relative w-52">
                  <button
                    type="button"
                    onClick={() => setGroupDropdownOpen(prev => !prev)}
                    className="app-field flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-4 focus:ring-teal-50"
                  >
                    <span className="text-gray-700">{selectedGroup.label}</span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${groupDropdownOpen ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {groupDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden py-1">
                      {groupOptions.map(filter => (
                        <button
                          key={filter.label}
                          type="button"
                          onClick={() => { setGroupFilter(filter.value); setPage(1); setGroupDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${groupFilter === filter.value ? "app-selected font-semibold" : "text-gray-700 hover:bg-gray-50"
                            }`}
                        >
                          <span>{filter.label}</span>
                          {groupFilter === filter.value && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats — Overall Statistics like reference design */}
            <p className="text-xs text-gray-400 mb-4">
              {t("showingPartsForPlant", { shown: parts.length, total, plant: selectedPlant?.name || "" })}
            </p>
            <div className="border-t border-slate-100 pt-5">
              <h3 className="mb-1 text-sm font-bold text-slate-800">Overall Statistics</h3>
              <p className="mb-4 text-xs text-slate-400">
                This section gives you an overall summary of the plant. The plant utilisation, machine utilisation, operator efficiency and idle time is depicted over the interval selected for the current period.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatBox value={total} label="Part Registered" Icon={PeopleIcon} />
                <StatBox value={stats.part_types || 0} label={t("partTypes")} Icon={ClipIcon} />
                <StatBox value={stats.linked || 0} label={t("partLinked")} Icon={LinkIcon} />
                <StatBox value={stats.unlinked || 0} label={t("partUnlinked")} Icon={UnlinkIcon} />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Parts table */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 animate-spin app-brand-text" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-gray-400 text-sm">{t("loadingParts")}</p>
              </div>
            </div>
          ) : parts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-base font-medium">{t("noPartsFound")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-950">Registered Parts</h3>
                  <p className="text-xs font-medium text-slate-500">Open a part to configure operations, documents and production settings.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  Showing {parts.length} of {total}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Part Code</th>
                      <th className="px-4 py-3">Part Name</th>
                      <th className="px-4 py-3">Plant</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Operations</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleParts.map((part) => {
                      const opCount = Number(part.operation_count || 0);
                      return (
                        <tr key={part.material_code} className="group hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => navigate(`/part/${part.material_code}`)}
                              className="font-mono text-xs font-extrabold text-[#0b73bd] hover:underline"
                            >
                              {part.material_code}
                            </button>
                          </td>
                          <td className="max-w-md px-4 py-3">
                            <p className="truncate font-extrabold text-slate-950" title={part.description || ""}>
                              {part.description || "Unnamed Part"}
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-slate-400">{part.customer || part.unit_of_measure || "-"}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{part.plant_code || "-"}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                              {part.manufacturing_type || part.material_group || "General"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-lg font-extrabold text-slate-950">{opCount}</span>
                            <span className="ml-1 text-xs font-semibold uppercase text-slate-400">ops</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${opCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {opCount > 0 ? "Linked" : "Needs setup"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => navigate(`/part/${part.material_code}`)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#0b73bd] hover:text-[#0b73bd]"
                            >
                              Configure
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!loading && total > PAGE_SIZE && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              label="parts"
              onPageChange={setPage}
            />
          )}

      {(dropdownOpen || groupDropdownOpen) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => { setDropdownOpen(false); setGroupDropdownOpen(false); }}
        />
      )}
    </AppLayout>
  );
};

const StatBox = ({ value, label, Icon }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
    <div>
      <p className="text-2xl font-extrabold leading-none text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
    <Icon />
  </div>
);

const PeopleIcon = () => <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const ClipIcon = () => <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>;
const LinkIcon = () => <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
const UnlinkIcon = () => <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>;

export default PartMasterPage;
