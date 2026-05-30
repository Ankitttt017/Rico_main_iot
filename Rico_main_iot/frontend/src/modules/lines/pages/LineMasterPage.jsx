import React, { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "../../../components/common/AppLayout";
import Pagination from "../../../components/common/Pagination";
import SearchableSelect from "../../../components/common/SearchableSelect";
import {
  createLine,
  createLineMachine,
  deleteLine,
  getLineMachines,
  getLineOperations,
  getLines,
  removeLineMachine,
  updateLine,
  updateLineMachine,
} from "../../../services/api";
import {
  FALLBACK_OPERATIONS,
  FILTER_DIVISION_OPTIONS,
  FILTER_PROTOCOL_OPTIONS,
  FILTER_STATUS_OPTIONS,
  PAGE_SIZE,
  PLANT_OPTIONS,
  PLANTS,
} from "../constants";
import { Field } from "../components/FormControls";
import LineCard from "../components/LineCard";
import LineWorkspaceModal from "../components/LineWorkspaceModal";
import StatBox from "../components/StatBox";
import {
  divisionMatches,
  getPlantByCode,
  lineMatchesProtocol,
} from "../utils/lineUtils";

const LineMasterPage = ({ onLogout, currentUser }) => {
  const [selectedPlant, setSelectedPlant] = useState(PLANTS[0]);
  const [operations, setOperations] = useState(FALLBACK_OPERATIONS);
  const [lines, setLines] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [workspaceMachines, setWorkspaceMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [page, setPage] = useState(1);

  const loadLines = useCallback(() => {
    setLoading(true);
    setError("");
    getLines({
      plant: selectedPlant.code,
      division: divisionFilter || undefined,
      status: statusFilter || undefined,
      protocol: protocolFilter || undefined,
    })
      .then((res) => setLines(Array.isArray(res.data?.data) ? res.data.data : []))
      .catch(() => setError("Unable to load lines. Please check backend connection."))
      .finally(() => setLoading(false));
  }, [divisionFilter, protocolFilter, selectedPlant.code, statusFilter]);

  useEffect(() => {
    getLineOperations()
      .then((res) => {
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        if (rows.length) setOperations(rows);
      })
      .catch(() => setOperations(FALLBACK_OPERATIONS));
  }, []);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  useEffect(() => {
    setPage(1);
  }, [divisionFilter, protocolFilter, search, selectedPlant.code, statusFilter]);

  const openWorkspace = async (line = null) => {
    setWorkspace(line || "new");
    setWorkspaceMachines([]);
    if (!line?.line_id) return;
    setWorkspaceLoading(true);
    try {
      const res = await getLineMachines(line.line_id);
      setWorkspaceMachines(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setWorkspaceMachines([]);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const saveWorkspace = async ({ line, machines, deletedMachineIds, keepOpen }) => {
    setSaving(true);
    setError("");
    try {
      let lineId = line.line_id;
      let finalLine = line;
      if (lineId) {
        await updateLine(lineId, line);
      } else {
        const res = await createLine(line);
        lineId = res.data?.line_id;
        finalLine = { ...line, line_id: lineId };
      }

      for (const machineId of deletedMachineIds) {
        await removeLineMachine(lineId, machineId, { mode: "delete" });
      }

      const persistedMachines = [];
      for (const machine of machines) {
        if (machine.id) {
          await updateLineMachine(lineId, machine.id, machine);
          persistedMachines.push(machine);
        } else {
          const res = await createLineMachine(lineId, machine);
          persistedMachines.push({ ...machine, id: res.data?.id || machine.id });
        }
      }

      if (!keepOpen) {
        setWorkspace(null);
        setWorkspaceMachines([]);
      } else {
        setWorkspace(finalLine);
        setWorkspaceMachines(persistedMachines);
      }
      loadLines();
      return { line: finalLine, machines: persistedMachines };
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save line setup.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteLine = async (line) => {
    if (!window.confirm(`Delete ${line.line_name}? Machines will be detached from this line.`)) return;
    setSaving(true);
    try {
      await deleteLine(line.line_id);
      loadLines();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete line.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) =>
      divisionMatches(line.division, divisionFilter) &&
      (!statusFilter || Boolean(line.is_active) === (statusFilter === "1")) &&
      lineMatchesProtocol(line, protocolFilter) &&
      (!q ||
        String(line.line_name || "").toLowerCase().includes(q) ||
        String(line.line_code || "").toLowerCase().includes(q) ||
        String(line.division || "").toLowerCase().includes(q))
    );
  }, [divisionFilter, lines, protocolFilter, search, statusFilter]);

  const pagedLines = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalMachines = filtered.reduce((sum, line) => sum + (line.total_machines || 0), 0);
  const activeLines = filtered.filter((line) => line.is_active).length;

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      {workspace && !workspaceLoading && (
        <LineWorkspaceModal
          initialLine={workspace === "new" ? null : workspace}
          initialMachines={workspaceMachines}
          plant={selectedPlant}
          operations={operations}
          saving={saving}
          onClose={() => setWorkspace(null)}
          onSave={saveWorkspace}
        />
      )}
      {workspaceLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40">
          <div className="rounded-xl bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-xl">Loading line setup...</div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-extrabold text-slate-950">Production Lines</h1>
          <span className="text-slate-300">|</span>
          <nav className="flex items-center gap-1 text-sm text-slate-500">
            <span className="app-brand-text font-medium">Organisation</span>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-gray-600">Line Master</span>
          </nav>
        </div>
        <button onClick={() => openWorkspace()} className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700">
          Add Line
        </button>
      </div>

      <div className="app-panel mb-6 w-full rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-5 flex flex-col gap-1">
          <h2 className="text-lg font-extrabold text-slate-950"></h2>
          <p className="max-w-4xl text-sm leading-relaxed text-slate-500">
            Manage one line with multiple machines, and assign one operation to every machine from the operation list.
          </p>
        </div>

        <div className="mb-5 grid gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Select Plant">
            <SearchableSelect
              value={selectedPlant.code}
              options={PLANT_OPTIONS}
              placeholder="Search plant..."
              onChange={(value) => setSelectedPlant(getPlantByCode(value))}
            />
          </Field>
          <Field label="Division">
            <SearchableSelect
              value={divisionFilter}
              options={FILTER_DIVISION_OPTIONS}
              placeholder="All divisions"
              onChange={setDivisionFilter}
            />
          </Field>
          <Field label="Status">
            <SearchableSelect
              value={statusFilter}
              options={FILTER_STATUS_OPTIONS}
              placeholder="All status"
              onChange={setStatusFilter}
            />
          </Field>
          <Field label="Protocol">
            <SearchableSelect
              value={protocolFilter}
              options={FILTER_PROTOCOL_OPTIONS}
              placeholder="All protocols"
              onChange={setProtocolFilter}
            />
          </Field>
          <Field label="Search Lines">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="app-field h-11 w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50"
                placeholder="Search by name, code or division..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <p className="mb-4 text-xs text-gray-400">Showing {filtered.length} of {lines.length} loaded lines for {selectedPlant.name}</p>
        <div className="border-t border-slate-100 pt-5">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Overall Statistics</h3>
          <p className="mb-4 text-xs text-slate-400">Summary of production lines and mapped machines for the selected plant.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatBox value={filtered.length} label="Total Lines" />
            <StatBox value={activeLines} label="Active Lines" />
            <StatBox value={totalMachines} label="Total Machines" />
            <StatBox value={operations.length} label="Operation Options" />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <svg className="h-8 w-8 animate-spin text-teal-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-400">Loading lines...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-24 text-gray-400">
          <p className="text-base font-bold">No lines found</p>
          <p className="mt-1 text-sm">Use the Add Line button at the top-right to create a new line.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {pagedLines.map((line) => (
            <LineCard key={line.line_id} line={line} onEdit={openWorkspace} onDelete={confirmDeleteLine} />
          ))}
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="lines" onPageChange={setPage} />
      )}
    </AppLayout>
  );
};

export default LineMasterPage;

