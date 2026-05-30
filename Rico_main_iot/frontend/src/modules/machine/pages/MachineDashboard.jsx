import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "../../../components/common/AppLayout";
import Pagination from "../../../components/common/Pagination";
import { getMachines, getPlants } from "../../../services/api";
import MachineCard from "../components/MachineCard";

import MachineSelect from "../components/MachineSelect";
import MachineStats from "../components/MachineStats";
import { DEFAULT_PLANTS, MACHINE_TYPE_LABELS, PAGE_SIZE, REFRESH_INTERVAL_MS } from "../constants";
import { getDivision, getLineCode, getLineName, getMachineType } from "../utils/machineUtils";

const MachineDashboard = ({ onLogout, currentUser }) => {
  const [machines, setMachines]         = useState([]);
  const [plants, setPlants]             = useState(DEFAULT_PLANTS);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState("");
  const [page, setPage]                 = useState(1);
  const latestRequestRef                = useRef(0);
  const machinesRef                     = useRef([]);
  const lastSuccessfulPlantRef          = useRef("");

  // Filters
  const [plant, setPlant]               = useState("1002");
  const [division, setDivision]         = useState("");
  const [line, setLine]                 = useState("");
  const [search, setSearch]             = useState("");
  const [machineType, setMachineType]   = useState("");

  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  useEffect(() => {
    getPlants()
      .then((response) => {
        const rows = response.data?.data || [];
        const merged = [...rows, ...DEFAULT_PLANTS].reduce((map, plantRow) => {
          const code = String(plantRow?.code || plantRow?.value || "").trim();
          if (!code || map.has(code)) return map;
          map.set(code, {
            label: plantRow?.label || plantRow?.name || `${code} Plant`,
            value: code,
          });
          return map;
        }, new Map());
        const nextPlants = Array.from(merged.values())
          .filter((plantOption) => ["1002", "1008"].includes(plantOption.value));
        setPlants(nextPlants.length ? nextPlants : DEFAULT_PLANTS);
      })
      .catch(() => setPlants(DEFAULT_PLANTS));
  }, []);

  const fetchMachines = useCallback(async ({ silent = false } = {}) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    try {
      const response = await getMachines({ plant });
      const payload = Array.isArray(response.data) ? response.data : response.data?.data;
      if (requestId !== latestRequestRef.current) return;
      if (!Array.isArray(payload)) throw new Error("Invalid machine response");
      setMachines(payload);
      setError("");
      lastSuccessfulPlantRef.current = plant;
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      const hasCachedMachines = machinesRef.current.length > 0 && lastSuccessfulPlantRef.current === plant;
      if (!hasCachedMachines) {
        setError("Unable to load machine data. Is the backend running?");
      }
    } finally {
      if (requestId === latestRequestRef.current) {
        if (!silent) setLoading(false);
        if (silent) setRefreshing(false);
      }
    }
  }, [plant]);

  useEffect(() => {
    fetchMachines();
    const id = setInterval(() => {
      if (!document.hidden) fetchMachines({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMachines]);

  const enriched = useMemo(() =>
    machines.map(m => {
      const lineCode = getLineCode(m);
      return {
        ...m,
        _division: getDivision(m),
        _lineCode: lineCode,
        _lineName: getLineName(m, lineCode),
        _machineType: getMachineType(m),
      };
    }),
    [machines]
  );

  const divisionOptions = useMemo(() => {
    const divisions = Array.from(new Set(enriched.map((machine) => machine._division).filter(Boolean)));
    return [
      { label: "All Divisions", value: "" },
      ...divisions
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
    ];
  }, [enriched]);

  const lineOptions = useMemo(() => {
    const source = division
      ? enriched.filter((machine) => machine._division === division)
      : enriched;
    const lines = source.reduce((map, machine) => {
      if (!machine._lineCode) return map;
      if (!map.has(machine._lineCode)) {
        map.set(machine._lineCode, machine._lineName || machine._lineCode);
      }
      return map;
    }, new Map());

    return [
      { label: "All Lines", value: "" },
      ...Array.from(lines, ([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [division, enriched]);

  const machineTypeOptions = useMemo(() => {
    const source = enriched.filter((machine) =>
      (!division || machine._division === division) &&
      (!line || machine._lineCode === line)
    );
    const types = Array.from(new Set(source.map((machine) => machine._machineType).filter(Boolean)));
    return [
      { label: "All Types", value: "" },
      ...types
        .sort((a, b) => (MACHINE_TYPE_LABELS[a] || a).localeCompare(MACHINE_TYPE_LABELS[b] || b))
        .map((value) => ({ label: MACHINE_TYPE_LABELS[value] || value, value })),
    ];
  }, [division, enriched, line]);

  useEffect(() => {
    if (division && !divisionOptions.some((option) => option.value === division)) {
      setDivision("");
      setLine("");
      setMachineType("");
      setPage(1);
    }
  }, [division, divisionOptions]);

  useEffect(() => {
    if (line && !lineOptions.some((option) => option.value === line)) {
      setLine("");
      setMachineType("");
      setPage(1);
    }
  }, [line, lineOptions]);

  useEffect(() => {
    if (machineType && !machineTypeOptions.some((option) => option.value === machineType)) {
      setMachineType("");
      setPage(1);
    }
  }, [machineType, machineTypeOptions]);

  const handleDivisionChange = (val) => {
    setDivision(val);
    setLine("");
    setMachineType("");
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(m => {
      if (plant && m.plant_code && m.plant_code !== plant) return false;
      if (division && m._division !== division) return false;
      if (line && m._lineCode !== line)         return false;
      if (q && !`${m.name || ""} ${m.machine_code || ""} ${m.category || ""}`.toLowerCase().includes(q)) return false;
      if (machineType && m._machineType !== machineType) return false;
      return true;
    });
  }, [enriched, plant, division, line, search, machineType]);

  const pagedMachines = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const stats = useMemo(() => filtered.reduce(
    (a, m) => {
      const s = String(m.status || "IDLE").toUpperCase();
      a.total++;
      if (s === "RUNNING") a.running++;
      else if (s === "STOPPED") a.stopped++;
      else a.idle++;
      return a;
    },
    { total: 0, running: 0, stopped: 0, idle: 0 }
  ), [filtered]);

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>

          {/* Breadcrumb */}
          <div className="mb-5 flex items-center gap-2 text-sm">
            <span className="font-bold text-slate-900">Organisation Master</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-teal-700">Machines</span>
          </div>

          {/* Header card */}
          <div className="app-panel mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-5 flex flex-col gap-1">
              <h2 className="text-lg font-extrabold text-slate-950">Machine Master</h2>
              <p className="max-w-5xl text-sm leading-relaxed text-slate-500">
              Machine Master is a list of all the machines in factory. This is a single point from where the machine history can be tracked and data pertaining to a specific machine can be availed. Machine Master also enables you to view overall statistics of the selected machine.
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <MachineSelect
                label="Select Plant"
                value={plant}
                onChange={(value) => {
                  setPlant(value);
                  setDivision("");
                  setLine("");
                  setMachineType("");
                  setSearch("");
                  setPage(1);
                }}
                options={plants}
              />
              <MachineSelect
                label="Select Division"
                value={division}
                onChange={handleDivisionChange}
                options={divisionOptions}
              />
              <MachineSelect
                label="Select Lines"
                value={line}
                onChange={(value) => {
                  setLine(value);
                  setMachineType("");
                  setPage(1);
                }}
                options={lineOptions}
              />

              {/* Search */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search Machine</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search Machine..."
                    className="h-11 w-52 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 shadow-sm transition focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-50"
                  />
                </div>
              </div>

              <MachineSelect
                label="Select Machine Type"
                value={machineType}
                onChange={(value) => { setMachineType(value); setPage(1); }}
                options={machineTypeOptions}
              />
            </div>
          </div>

          <MachineStats stats={stats} />

          <p className="text-xs text-gray-400 mb-4">
            Showing {filtered.length} of {machines.length} machines
            {refreshing && <span className="ml-2 text-teal-600">Refreshing...</span>}
          </p>

          {/* Error */}
          {error && machines.length === 0 && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-gray-400">Loading machines...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <p className="text-base font-medium">No machines found for selected filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {pagedMachines.map(machine => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  division={machine._division}
                  line={machine._lineName}
                />
              ))}
            </div>
          )}

          {!loading && filtered.length > PAGE_SIZE && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              label="machines"
              onPageChange={setPage}
            />
          )}
    </AppLayout>
  );
};

export default MachineDashboard;

