import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import AppLayout from "../../../components/common/AppLayout";
import Pagination from "../../../components/common/Pagination";
import {
  createMachine,
  deleteMachine,
  getDepartments,
  getLines,
  getMachines,
  getPlants,
  getPlcMachineConfigs,
  deletePlcMachineConfig,
  savePlcMachineConfig,
  testPlcMachineConfig,
  updateMachine,
} from "../../../services/api";
import MachineCard from "../components/MachineCard";

import MachineSelect from "../components/MachineSelect";
import MachineStats from "../components/MachineStats";
import { DEFAULT_PLANTS, MACHINE_TYPE_LABELS, PAGE_SIZE, REFRESH_INTERVAL_MS } from "../constants";
import { getDivision, getLineCode, getLineName, getMachineType } from "../utils/machineUtils";
import { sortBySearchRelevance } from "../../../utils/searchRelevance";
import {
  DEFAULT_PLC_DRAFT,
  MachineForm as PlcMachineForm,
  RegisterConfigTable,
  getDefaultRegisters,
  getMachineType as getPlcMachineType,
  inferAssetType,
  keyFromMachine,
  profileForType,
  withRegisterDefaults,
} from "../../plc-machines/UbeMachineSetupPage";

const makeMachineCode = (draft = {}) => {
  const base = String(draft.machine_code || draft.name || draft.asset || "MACHINE")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `MACHINE-${Date.now()}`;
};

const MachineDashboard = ({ onLogout, currentUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [machines, setMachines]         = useState([]);
  const [plants, setPlants]             = useState(DEFAULT_PLANTS);
  const [departments, setDepartments]   = useState([]);
  const [lines, setLines]               = useState([]);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [machineDraft, setMachineDraft] = useState(null);
  const [plcConfigs, setPlcConfigs]     = useState([]);
  const [plcDraft, setPlcDraft]         = useState(DEFAULT_PLC_DRAFT);
  const [registerTemplates, setRegisterTemplates] = useState([]);
  const [defaultRegistersByType, setDefaultRegistersByType] = useState({ ube: [], leaktest: [] });
  const [plcTesting, setPlcTesting]     = useState(false);
  const [plcTestResult, setPlcTestResult] = useState(null);
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
  const [search, setSearch]             = useState(searchParams.get("search") || "");
  const [machineType, setMachineType]   = useState("");

  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);

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
        const nextPlants = Array.from(merged.values());
        setPlants(nextPlants.length ? nextPlants : DEFAULT_PLANTS);
      })
      .catch(() => setPlants(DEFAULT_PLANTS));
  }, []);

  useEffect(() => {
    getDepartments({ active: 1, plant, _: Date.now() })
      .then((response) => setDepartments(Array.isArray(response.data?.data) ? response.data.data : []))
      .catch(() => setDepartments([]));
  }, [plant]);

  useEffect(() => {
    getLines({ plant })
      .then((response) => setLines(Array.isArray(response.data?.data) ? response.data.data : []))
      .catch(() => setLines([]));
  }, [plant]);

  const loadPlcSetup = useCallback(async () => {
    const response = await getPlcMachineConfigs();
    const defaults = response.data?.default_registers_by_type || { ube: response.data?.default_registers || [], leaktest: [] };
    const templates = Array.isArray(response.data?.register_templates) ? response.data.register_templates : [];
    setPlcConfigs(Array.isArray(response.data?.data) ? response.data.data : []);
    setDefaultRegistersByType(defaults);
    setRegisterTemplates(templates);
    return { defaults, templates, configs: Array.isArray(response.data?.data) ? response.data.data : [] };
  }, []);

  useEffect(() => {
    loadPlcSetup().catch(() => {
      setPlcConfigs([]);
      setRegisterTemplates([]);
      setDefaultRegistersByType({ ube: [], leaktest: [] });
    });
  }, [loadPlcSetup]);

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

  const enriched = useMemo(() => {
    const linkedConfigIds = new Set();
    const linkedKeys = new Set();
    const masterMachines = machines.map(m => {
      const lineCode = getLineCode(m);
      const machineKey = keyFromMachine(m);
      const plcConfig = plcConfigs.find((config) =>
        String(config.machine_id || "") === String(m.id || "") ||
        (machineKey && String(config.machine_key || "") === machineKey)
      );
      if (plcConfig?.id) linkedConfigIds.add(String(plcConfig.id));
      if (plcConfig?.machine_key) linkedKeys.add(String(plcConfig.machine_key));
      return {
        ...m,
        _division: getDivision(m),
        _lineCode: lineCode,
        _lineName: getLineName(m, lineCode),
        _machineType: getMachineType(m),
        _plcConfig: plcConfig || null,
        _plcOnly: false,
      };
    });

    const plcOnlyMachines = plcConfigs
      .filter((config) =>
        String(config.plant_code || "") === String(plant || "") &&
        !linkedConfigIds.has(String(config.id || "")) &&
        !linkedKeys.has(String(config.machine_key || ""))
      )
      .map((config) => ({
        id: config.machine_id ? String(config.machine_id) : `plc-${config.id}`,
        machine_code: config.machine_key || "",
        name: config.machine_name || config.machine_key || "PLC Machine",
        category: config.machine_type === "leaktest" ? "Leak Test" : "PLC Config",
        plant_code: config.plant_code || "",
        line_id: "",
        line_code: "",
        line_name: "",
        line_division: "",
        asset: config.machine_type === "leaktest" ? "Leak Test" : "Die Casting / PLC",
        cost_center: "",
        is_active: config.is_active !== false,
        status: config.is_active === false ? "IDLE" : "RUNNING",
        part: "PLC config pending machine link",
        assigned_operation_count: 0,
        _division: "Needs line link",
        _lineCode: "",
        _lineName: "Assign department and line",
        _machineType: config.machine_type || "general",
        _plcConfig: config,
        _plcOnly: true,
        _linkedOutsideCurrentPlant: Boolean(config.machine_id),
      }));

    return [...masterMachines, ...plcOnlyMachines];
  }, [machines, plcConfigs, plant]);

  const baseDepartmentRows = useMemo(() => {
    const plantSpecific = departments.filter((department) =>
      department.plant_code &&
      String(department.plant_code).toUpperCase() === String(plant).toUpperCase()
    );
    return plantSpecific.length
      ? plantSpecific
      : departments.filter((department) => !department.plant_code);
  }, [departments, plant]);

  const divisionOptions = useMemo(() => {
    const divisions = Array.from(new Set(baseDepartmentRows.map((department) => department.name).filter(Boolean)));
    return [
      { label: "All Departments", value: "" },
      ...divisions
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
    ];
  }, [baseDepartmentRows]);

  const lineOptions = useMemo(() => {
    const source = division
      ? lines.filter((lineRow) => String(lineRow.division || "") === String(division))
      : lines;

    return [
      { label: "All Lines", value: "" },
      ...source.map((lineRow) => ({
        value: String(lineRow.line_id),
        label: lineRow.line_name || lineRow.line_code || `Line ${lineRow.line_id}`,
      }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [division, lines]);

  const machineTypeOptions = useMemo(() => {
    const source = enriched.filter((machine) =>
      (!division || machine._division === division) &&
      (!line || String(machine.line_id || "") === String(line))
    );
    const types = Array.from(new Set(source.map((machine) => machine._machineType).filter(Boolean)));
    return [
      { label: "All Types", value: "" },
      ...types
        .sort((a, b) => (MACHINE_TYPE_LABELS[a] || a).localeCompare(MACHINE_TYPE_LABELS[b] || b))
        .map((value) => ({ label: MACHINE_TYPE_LABELS[value] || value, value })),
    ];
  }, [division, enriched, line]);

  const departmentOptions = useMemo(() => [
    { label: "Select Department", value: "" },
    ...baseDepartmentRows.map((department) => ({ label: department.name, value: department.name })),
  ], [baseDepartmentRows]);

  const assignLineOptions = useMemo(() => {
    const selectedDepartment = machineDraft?.category || "";
    const source = selectedDepartment
      ? lines.filter((lineRow) => String(lineRow.division || "") === String(selectedDepartment))
      : lines;
    return [
      { label: "Select Line", value: "" },
      ...source.map((lineRow) => ({
        label: lineRow.line_name || lineRow.line_code || `Line ${lineRow.line_id}`,
        value: String(lineRow.line_id),
      })),
    ];
  }, [lines, machineDraft?.category]);

  const getSelectedLine = useCallback((lineId) =>
    lines.find((lineRow) => String(lineRow.line_id) === String(lineId)) || null,
  [lines]);

  const applyLineToDraft = useCallback((lineId) => {
    const selectedLine = getSelectedLine(lineId);
    setMachineDraft((current) => ({
      ...current,
      line_id: lineId,
      plant_code: selectedLine?.plant_code || current.plant_code,
      category: selectedLine?.division || current.category || "",
    }));
  }, [getSelectedLine]);

  const buildPlcDraftForMachine = useCallback((machine, configs = plcConfigs, defaults = defaultRegistersByType, templates = registerTemplates) => {
    const existing = configs.find((config) => String(config.machine_id || "") === String(machine?.id || ""));
    if (existing) return withRegisterDefaults(existing, defaults);

    const type = inferAssetType(machine);
    const template = templates.find((item) => item.machine_type === type && item.is_active !== false);
    return {
      ...DEFAULT_PLC_DRAFT,
      machine_id: machine?.id || null,
      machine_key: keyFromMachine(machine),
      machine_name: machine?.name || machine?.machine_code || "",
      plant_code: machine?.plant_code || plant,
      machine_type: type,
      register_profile_key: template?.template_key || profileForType(type),
      register_config: template?.register_config || getDefaultRegisters(defaults, type),
    };
  }, [defaultRegistersByType, plant, plcConfigs, registerTemplates]);

  const openCreateMachine = () => {
    const availableLines = division
      ? lines.filter((lineRow) => String(lineRow.division || "") === String(division))
      : lines;
    const firstLine = lines.find((lineRow) => String(lineRow.line_id) === String(line)) || availableLines[0] || null;
    setMachineDraft({
      machine_code: "",
      name: "",
      category: firstLine?.division || division || "",
      plant_code: firstLine?.plant_code || plant,
      line_id: firstLine?.line_id ? String(firstLine.line_id) : "",
      asset: "",
      cost_center: "",
      is_active: true,
    });
    setPlcDraft(buildPlcDraftForMachine({
      id: null,
      machine_code: "",
      name: "",
      asset: "",
      category: firstLine?.division || division || "",
    }));
    setPlcTestResult(null);
    setMachineModalOpen(true);
  };

  const openEditMachine = async (machine) => {
    if (machine?._plcOnly) {
      const setup = await loadPlcSetup().catch(() => ({
        configs: plcConfigs,
        defaults: defaultRegistersByType,
        templates: registerTemplates,
      }));
      const config = setup.configs.find((item) => String(item.id || "") === String(machine._plcConfig?.id || "")) || machine._plcConfig;
      const type = getPlcMachineType(config);
      setMachineDraft({
        id: config?.machine_id || null,
        machine_code: config?.machine_key || "",
        name: config?.machine_name || machine.name || "",
        category: "",
        plant_code: config?.plant_code || plant,
        line_id: "",
        asset: type === "leaktest" ? "Leak Test" : "Die Casting / PLC",
        cost_center: "",
        is_active: config?.is_active !== false,
      });
      setPlcDraft(withRegisterDefaults(config, setup.defaults));
      setPlcTestResult(null);
      setMachineModalOpen(true);
      return;
    }

    setMachineDraft({
      id: machine.id,
      machine_code: machine.machine_code || "",
      name: machine.name || "",
      category: machine.category || machine.line_division || "",
      plant_code: machine.plant_code || plant,
      line_id: machine.line_id ? String(machine.line_id) : "",
      asset: machine.asset || "",
      cost_center: machine.cost_center || "",
      is_active: machine.is_active !== false,
    });
    const setup = await loadPlcSetup().catch(() => ({
      configs: plcConfigs,
      defaults: defaultRegistersByType,
      templates: registerTemplates,
    }));
    setPlcDraft(buildPlcDraftForMachine(machine, setup.configs, setup.defaults, setup.templates));
    setPlcTestResult(null);
    setMachineModalOpen(true);
  };

  const saveMachine = async () => {
    try {
      if (!machineDraft.line_id) {
        toast.error("Machine save karne se pehle line select karo");
        return;
      }
      const selectedLine = getSelectedLine(machineDraft.line_id);
      const payload = {
        ...machineDraft,
        machine_code: makeMachineCode(machineDraft),
        plant_code: selectedLine?.plant_code || machineDraft.plant_code,
        category: machineDraft.category || selectedLine?.division || "",
        line_id: machineDraft.line_id,
      };
      const type = getPlcMachineType(plcDraft);
      const hasExistingPlcConfig = Boolean(plcDraft.id);
      const hasPlcInput = Boolean(
        String(plcDraft.ip_address || "").trim() ||
        String(plcDraft.port || "").trim() ||
        String(plcDraft.notes || "").trim() ||
        hasExistingPlcConfig
      );
      if (hasPlcInput && !String(plcDraft.ip_address || "").trim()) {
        toast.error("PLC config save karne ke liye PLC IP address required hai");
        return;
      }

      let machineId = payload.id;
      if (payload.id) {
        await updateMachine(payload.id, payload);
        toast.success("Machine updated");
      } else {
        const response = await createMachine(payload);
        machineId = response.data?.id;
        toast.success("Machine created");
      }
      if (hasPlcInput) {
        await savePlcMachineConfig({
          ...plcDraft,
          id: plcDraft.id || null,
          machine_id: machineId,
          machine_key: keyFromMachine({ ...payload, id: machineId }),
          machine_name: payload.name,
          plant_code: payload.plant_code,
          machine_type: type,
          register_profile_key: plcDraft.register_profile_key || profileForType(type),
          port: Number(plcDraft.port || 5002),
          register_config: plcDraft.register_config || getDefaultRegisters(defaultRegistersByType, type),
        });
        toast.success("PLC config saved");
        await loadPlcSetup();
      }
      setMachineModalOpen(false);
      setMachineDraft(null);
      setPlcDraft(DEFAULT_PLC_DRAFT);
      setPlcTestResult(null);
      fetchMachines();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save machine");
    }
  };

  const testPlcDraft = async () => {
    setPlcTesting(true);
    setPlcTestResult(null);
    try {
      const response = await testPlcMachineConfig({ ...plcDraft, port: Number(plcDraft.port || 5002) });
      setPlcTestResult(response.data);
      toast.success(response.data?.message || "Connection successful");
    } catch (error) {
      const payload = error.response?.data || { connected: false, message: error.message };
      setPlcTestResult(payload);
      toast.error(payload.message || "Connection failed");
    } finally {
      setPlcTesting(false);
    }
  };

  const deleteMachineEverywhere = async (machine) => {
    const configId = machine?._plcConfig?.id || plcDraft?.id;
    const machineId = machine?.id || machineDraft?.id;
    const machineName = machine?.name || machineDraft?.name || "this machine";
    const isSyntheticPlcOnly = String(machineId || "").startsWith("plc-");

    if (!machineId && !configId) return toast.error("Machine id missing. Refresh and try again.");
    if (!window.confirm(`Delete ${machineName}? This will remove it from Machine Manager, PLC Config / Tags and IoT monitor.`)) return;

    try {
      if (configId) await deletePlcMachineConfig(configId);
      if (machineId && !isSyntheticPlcOnly) await deleteMachine(machineId);
      toast.success("Machine deleted");
      setMachineModalOpen(false);
      setMachineDraft(null);
      setPlcDraft(DEFAULT_PLC_DRAFT);
      await loadPlcSetup();
      fetchMachines();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to delete machine");
    }
  };

  const removeMachine = async () => {
    await deleteMachineEverywhere({ ...machineDraft, _plcConfig: plcDraft });
  };

  const toggleMachineActive = async (machine) => {
    try {
      await updateMachine(machine.id, { is_active: machine.is_active === false });
      toast.success(`Machine ${machine.is_active === false ? "enabled" : "disabled"}`);
      fetchMachines({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update machine status");
    }
  };

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
    const matches = enriched.filter(m => {
      const machinePlant = m._plcConfig?.plant_code || m.plant_code || "";
      if (plant && String(machinePlant || "") !== String(plant)) return false;
      if (division && m._division !== division) return false;
      if (line && String(m.line_id || "") !== String(line)) return false;
      if (q && !`${m.name || ""} ${m.machine_code || ""} ${m.category || ""}`.toLowerCase().includes(q)) return false;
      if (machineType && m._machineType !== machineType) return false;
      return true;
    });
    return sortBySearchRelevance(matches, q, (machine) => [
      machine.name,
      machine.machine_code,
      machine.category,
      machine._division,
      getLineName(machine),
      machine.plant_code,
    ]);
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
          {machineModalOpen && machineDraft && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
              <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">{machineDraft.id ? "Edit Machine" : "Add Machine"}</h3>
                    <p className="mt-1 text-sm text-slate-500">Machine will be linked to the selected plant, department and line. PLC config below is saved against this machine.</p>
                  </div>
                  <button type="button" onClick={() => {
                    setMachineModalOpen(false);
                    setPlcTestResult(null);
                  }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Close</button>
                </div>
                <div className="max-h-[calc(92vh-137px)] overflow-y-auto">
                  <div className="grid gap-4 p-5 md:grid-cols-2">
                    <MachineSelect
                      label="Location / Plant"
                      value={machineDraft.plant_code}
                      onChange={(value) => {
                        setPlant(value);
                        setMachineDraft((current) => ({ ...current, plant_code: value, category: "", line_id: "" }));
                      }}
                      options={plants}
                    />
                    <MachineSelect
                      label="Department"
                      value={machineDraft.category}
                      onChange={(value) => setMachineDraft((current) => ({ ...current, category: value, line_id: "" }))}
                      options={departmentOptions}
                    />
                    <MachineSelect
                      label="Line"
                      value={machineDraft.line_id || ""}
                      onChange={applyLineToDraft}
                      options={assignLineOptions}
                    />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Machine Type / Asset Type</span>
                      <input value={machineDraft.asset || ""} onChange={(event) => {
                        const asset = event.target.value;
                        setMachineDraft((current) => ({ ...current, asset }));
                        const nextType = inferAssetType({ ...machineDraft, asset });
                        setPlcDraft((current) => ({
                          ...current,
                          machine_type: nextType,
                          register_profile_key: current.register_profile_key || profileForType(nextType),
                        }));
                      }} placeholder="Die Casting / CNC / Leak Test" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Machine Name</span>
                      <input value={machineDraft.name || ""} onChange={(event) => {
                        const name = event.target.value;
                        setMachineDraft((current) => ({ ...current, name }));
                        setPlcDraft((current) => ({
                          ...current,
                          machine_name: name,
                          machine_key: current.id ? current.machine_key : keyFromMachine({ ...machineDraft, name }),
                        }));
                      }} placeholder="UBE 850T-1" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50" />
                    </label>
                    <MachineSelect
                      label="Status"
                      value={machineDraft.is_active === false ? "0" : "1"}
                      onChange={(value) => setMachineDraft((current) => ({ ...current, is_active: value === "1" }))}
                      options={[
                        { label: "Active", value: "1" },
                        { label: "Inactive", value: "0" },
                      ]}
                    />
                  </div>
                  <div className="border-t border-slate-100 p-5">
                    <PlcMachineForm
                      draft={plcDraft}
                      setDraft={setPlcDraft}
                      onTest={testPlcDraft}
                      saving={false}
                      testing={plcTesting}
                      testResult={plcTestResult}
                      defaultRegistersByType={defaultRegistersByType}
                      registerTemplates={registerTemplates}
                      showMachineSelector={false}
                      showActions={false}
                      title="PLC Config / Tags"
                      description="Optional: add PLC IP, protocol and registers now. This config will be linked to the machine after Machine Master save."
                      onImportRegisters={(imported) => setPlcDraft((current) => ({ ...current, register_config: imported }))}
                    />
                    <div className="mt-4">
                      <RegisterConfigTable
                        registers={plcDraft.register_config || getDefaultRegisters(defaultRegistersByType, getPlcMachineType(plcDraft))}
                        setRegisters={(updater) => setPlcDraft((current) => ({
                          ...current,
                          register_config: typeof updater === "function"
                            ? updater(current.register_config || getDefaultRegisters(defaultRegistersByType, getPlcMachineType(current)))
                            : updater,
                        }))}
                        maxHeightClass="max-h-[260px]"
                      />
                    </div>
                    {plcTestResult && (
                      <p className={`mt-3 inline-flex rounded-lg px-3 py-2 text-sm font-bold ${plcTestResult.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {plcTestResult.message}{plcTestResult.latency_ms ? ` (${plcTestResult.latency_ms}ms)` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                  <div>
                    {machineDraft.id && (
                      <button type="button" onClick={removeMachine} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Delete</button>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={testPlcDraft} disabled={plcTesting} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      {plcTesting ? "Testing..." : "Test PLC Connection"}
                    </button>
                    <button type="button" onClick={saveMachine} className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
                      Save Machine
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-5 flex items-center gap-2 text-sm">
            <span className="font-bold text-slate-900">Machine Manager</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-teal-700">Master Setup / Machine Manager</span>
          </div>

          {/* Header card */}
          <div className="app-panel mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
              <h2 className="text-lg font-extrabold text-slate-950">Machine Manager</h2>
              <p className="max-w-5xl text-sm leading-relaxed text-slate-500">
              Add machines under the selected plant, department and line. PLC IP, protocol and tags are configured in PLC Config / Tags.
              </p>
              </div>
              <button type="button" onClick={openCreateMachine} className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700">
                Add Machine
              </button>
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
                label="Select Department"
                value={division}
                onChange={handleDivisionChange}
                options={divisionOptions}
              />
              <MachineSelect
                label="Select Line"
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
                    onChange={e => {
                      const value = e.target.value;
                      setSearch(value);
                      setPage(1);
                      if (value) setSearchParams({ search: value });
                      else setSearchParams({});
                    }}
                    placeholder="Search Machine..."
                    className="h-11 w-52 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 shadow-sm transition focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-50"
                  />
                </div>
              </div>

              <MachineSelect
                label="Machine Type"
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
                  plcConfig={machine._plcConfig}
                  onEdit={openEditMachine}
                  onToggle={toggleMachineActive}
                  onDelete={deleteMachineEverywhere}
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

