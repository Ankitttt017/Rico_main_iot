import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../components/common/AppLayout";
import Pagination from "../components/common/Pagination";
import { getPlants, getParts } from "../services/api";
import { useI18n } from "../context/I18nContext";

const ALLOWED_PLANT_CODES = ["1002", "1008"];
const PAGE_SIZE = 50;

const DEFAULT_PLANTS = [
  { id: "fallback-bawal", name: "Bawal Plant", code: "1008", location: "Bawal, Haryana" },
  { id: "fallback-gurugram", name: "Gurugram Plant", code: "1002", location: "Gurugram, Haryana" },
];

const normalizePlants = (rows = []) => {
  const merged = [...rows, ...DEFAULT_PLANTS].reduce((map, plant) => {
    const code = String(plant?.code || plant?.plant_code || "").trim().toUpperCase();
    if (!code || map.has(code)) return map;
    map.set(code, {
      id: plant.id || code,
      code,
      name: code === "1002" ? "Gurugram Plant" : code === "1008" ? "Bawal Plant" : plant.name || `${code} Plant`,
      location: code === "1002" ? "Gurugram, Haryana" : code === "1008" ? "Bawal, Haryana" : plant.location || "",
    });
    return map;
  }, new Map());

  return Array.from(merged.values())
    .filter((plant) => ALLOWED_PLANT_CODES.includes(plant.code))
    .sort((a, b) => ALLOWED_PLANT_CODES.indexOf(a.code) - ALLOWED_PLANT_CODES.indexOf(b.code));
};

const PartIllustration = () => (
  <svg viewBox="0 0 160 120" className="h-full w-full drop-shadow-sm" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="partBody" x1="36" y1="20" x2="128" y2="98" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f33f46" />
        <stop offset="0.48" stopColor="#c70d17" />
        <stop offset="1" stopColor="#7f0710" />
      </linearGradient>
      <linearGradient id="partEdge" x1="30" y1="78" x2="133" y2="90" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7c0710" />
        <stop offset="1" stopColor="#e11d2e" />
      </linearGradient>
      <radialGradient id="partHighlight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(66 38) rotate(55) scale(48 25)">
        <stop stopColor="#ff8a8e" stopOpacity="0.9" />
        <stop offset="1" stopColor="#ff8a8e" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="83" cy="101" rx="58" ry="8" fill="#0f172a" opacity="0.08" />
    <path d="M35 83c8-35 22-58 42-68 7-4 15-1 19 6l23 41c5 9 0 20-10 23L48 99c-10 2-16-6-13-16z" fill="url(#partBody)" />
    <path d="M44 91l67-14 13 13-78 17c-13 3-17-12-2-16z" fill="url(#partEdge)" />
    <path d="M55 76c8-19 16-34 30-51 6 14 13 27 22 43-16 2-34 6-52 8z" fill="url(#partHighlight)" />
    <path d="M48 87c17-3 42-8 65-14" stroke="#47070b" strokeWidth="4" strokeLinecap="round" opacity="0.45" />
    <path d="M51 93c20-4 49-10 75-16" stroke="#f87171" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    <g transform="translate(96 22)">
      <ellipse cx="20" cy="26" rx="18" ry="28" fill="#7f0710" />
      <ellipse cx="24" cy="26" rx="15" ry="25" fill="#d20f1b" />
      <ellipse cx="29" cy="26" rx="8" ry="17" fill="#7f0710" />
      <ellipse cx="31" cy="26" rx="5" ry="12" fill="#2b070a" opacity="0.9" />
      <path d="M16 4c7 5 11 14 12 28" stroke="#ff7a7f" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
    </g>
    <g transform="translate(42 43)">
      <circle cx="16" cy="18" r="12" fill="#7f0710" />
      <circle cx="16" cy="18" r="8" fill="#e11d2e" />
      <circle cx="16" cy="18" r="4" fill="#2b070a" />
      <path d="M7 15c2-5 6-8 12-8" stroke="#ff7a7f" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </g>
    <path d="M41 82c7 5 23 4 39-1" stroke="#4c0510" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
  </svg>
);

const PartCard = ({ part, t }) => {
  const navigate = useNavigate();
  const opCount = part.operation_count || 0;
  const openPart = () => navigate(`/part/${part.material_code}`);
  const handleCardClick = (event) => {
    const selection = window.getSelection?.().toString().trim();
    if (selection || event.defaultPrevented) return;
    openPart();
  };

  const handleCardKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPart();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`Open ${part.description || "part"} details`}
      className="group flex h-full min-h-[220px] cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-slate-200/80 focus:outline-none focus:ring-4 focus:ring-teal-100"
    >
      <div className="mb-2 flex aspect-[1.3] w-full items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(145deg,_#f8fafc_0%,_#eef5f4_100%)] p-2 ring-1 ring-slate-100">
        <div className="h-full max-h-16 w-full transition-transform duration-200 group-hover:scale-105">
          <PartIllustration />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 min-h-[2rem] cursor-text select-text break-words text-[11px] font-extrabold leading-snug text-slate-950" title={part.description || ""}>
          {part.description || "Unnamed Part"}
        </p>
        <p className="mt-0.5 cursor-text select-text truncate font-mono text-[9px] font-semibold text-slate-400" title={part.material_code}>
          {part.material_code}
        </p>
        {part.manufacturing_type && (
          <span className="mt-1.5 inline-flex max-w-full truncate rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">
            {part.manufacturing_type}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-2 border-t border-slate-100 pt-3 text-xs">
        <div>
          <p className="text-base font-extrabold leading-none text-slate-950">{opCount}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("operations")}</p>
        </div>
        <div className="flex min-w-0 justify-end">
          <span className={`max-w-full truncate rounded-full px-2 py-1 text-[10px] font-bold ${opCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {opCount > 0 ? t("linked") : t("unlinked")}
          </span>
        </div>
      </div>
    </div>
  );
};

const PartMasterPage = ({ onLogout, currentUser }) => {
  const { t } = useI18n();
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

  const filteredPlants = plants.filter(p => {
    const query = plantSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      p.code.toLowerCase().includes(query) ||
      p.location.toLowerCase().includes(query)
    );
  });

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

          {/* Breadcrumb */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-950">Parts & Operations</h1>
            <span className="text-slate-300">|</span>
            <nav className="flex items-center gap-1 text-sm text-slate-500">
              <span className="app-brand-text font-medium">Master Data</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium text-gray-600">{t("partMaster")}</span>
            </nav>
          </div>

          {/* Main Card — full width */}
          <div className="app-panel mb-6 w-full rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-5 flex flex-col gap-1">
              <h2 className="text-lg font-extrabold text-slate-950">{t("partMasterTitle")}</h2>
              <p className="max-w-4xl text-sm leading-relaxed text-slate-500">
                {t("partMasterDescription")}
              </p>
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

          {/* Grid */}
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
              {parts.map(part => (
                <PartCard key={part.material_code} part={part} t={t} />
              ))}
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
