import React, { useState, useEffect, useMemo } from "react";
import AppLayout from "../../../components/common/AppLayout";
import {
  Clock,
  Plus,
  Search,
  CheckCircle2,
  Edit2,
  Trash2,
  RefreshCw,
  Coffee,
  Sun,
  Moon,
  Sunset,
  AlertCircle,
  Timer,
  Calendar,
  Check,
  X,
  Utensils,
  Wrench,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function ShiftManagementPage({ onLogout, currentUser }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeShift, setActiveShift] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    shift_code: "",
    shift_name: "",
    start_time: "06:00",
    end_time: "14:00",
    breaks: [
      { id: 1, name: "Tea Break 1", start_time: "09:00", end_time: "09:15", type: "tea" },
      { id: 2, name: "Lunch Break", start_time: "11:30", end_time: "12:00", type: "meal" },
    ],
    grace_period_mins: 10,
    overtime_allowed: true,
    is_active: true,
  });

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/shifts`);
      const data = await response.json();
      if (data.success) {
        setShifts(data.data || []);
        setActiveShift(data.activeShift || null);
      } else {
        toast.error(data.message || "Failed to load shifts");
      }
    } catch (error) {
      console.error("Fetch shifts error:", error);
      toast.error("Network error while loading shifts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
    const interval = setInterval(fetchShifts, 30000); // refresh every 30 sec for live status
    return () => clearInterval(interval);
  }, []);

  const openCreateModal = () => {
    setEditingShift(null);
    setFormData({
      shift_code: `SHIFT_${String.fromCharCode(65 + shifts.length)}`,
      shift_name: `Shift ${String.fromCharCode(65 + shifts.length)}`,
      start_time: "06:00",
      end_time: "14:00",
      breaks: [
        { id: Date.now(), name: "Tea Break", start_time: "09:00", end_time: "09:15", type: "tea" },
        { id: Date.now() + 1, name: "Lunch Break", start_time: "11:30", end_time: "12:00", type: "meal" },
      ],
      grace_period_mins: 10,
      overtime_allowed: true,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (shift) => {
    setEditingShift(shift);
    let initialBreaks = [];
    if (Array.isArray(shift.breaks) && shift.breaks.length > 0) {
      initialBreaks = shift.breaks.map((b, i) => ({ ...b, id: b.id || Date.now() + i }));
    } else {
      if (shift.break_1_name) {
        initialBreaks.push({
          id: Date.now(),
          name: shift.break_1_name,
          start_time: shift.break_1_start || "09:00",
          end_time: shift.break_1_end || "09:15",
          type: "tea",
        });
      }
      if (shift.break_2_name) {
        initialBreaks.push({
          id: Date.now() + 1,
          name: shift.break_2_name,
          start_time: shift.break_2_start || "11:30",
          end_time: shift.break_2_end || "12:00",
          type: "meal",
        });
      }
    }

    setFormData({
      shift_code: shift.shift_code || "",
      shift_name: shift.shift_name || "",
      start_time: shift.start_time || "06:00",
      end_time: shift.end_time || "14:00",
      breaks: initialBreaks,
      grace_period_mins: shift.grace_period_mins ?? 10,
      overtime_allowed: Boolean(shift.overtime_allowed),
      is_active: Boolean(shift.is_active),
    });
    setIsModalOpen(true);
  };

  // Dynamic Breaks Management
  const handleAddBreak = () => {
    setFormData((prev) => ({
      ...prev,
      breaks: [
        ...prev.breaks,
        {
          id: Date.now(),
          name: `Break ${prev.breaks.length + 1}`,
          start_time: "10:00",
          end_time: "10:15",
          type: "tea",
        },
      ],
    }));
  };

  const handleUpdateBreak = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.breaks];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, breaks: updated };
    });
  };

  const handleRemoveBreak = (index) => {
    setFormData((prev) => ({
      ...prev,
      breaks: prev.breaks.filter((_, i) => i !== index),
    }));
  };

  const handleSaveShift = async (e) => {
    e.preventDefault();
    if (!formData.shift_code || !formData.shift_name || !formData.start_time || !formData.end_time) {
      toast.error("Please fill in all required fields (Code, Name, Start & End Time)");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingShift ? `${API_BASE_URL}/shifts/${editingShift.id}` : `${API_BASE_URL}/shifts`;
      const method = editingShift ? "PUT" : "POST";

      const payload = {
        ...formData,
        break_1_name: formData.breaks[0]?.name || null,
        break_1_start: formData.breaks[0]?.start_time || null,
        break_1_end: formData.breaks[0]?.end_time || null,
        break_2_name: formData.breaks[1]?.name || null,
        break_2_start: formData.breaks[1]?.start_time || null,
        break_2_end: formData.breaks[1]?.end_time || null,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(editingShift ? "Shift updated successfully!" : "New shift created successfully!");
        setIsModalOpen(false);
        fetchShifts();
      } else {
        toast.error(data.message || "Failed to save shift");
      }
    } catch (error) {
      console.error("Save shift error:", error);
      toast.error("Network error while saving shift");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (shift) => {
    try {
      const response = await fetch(`${API_BASE_URL}/shifts/${shift.id}/toggle`, {
        method: "PATCH",
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Shift status changed to ${shift.is_active ? "Inactive" : "Active"}`);
        fetchShifts();
      } else {
        toast.error(data.message || "Failed to toggle status");
      }
    } catch (error) {
      toast.error("Error updating shift status");
    }
  };

  const handleDeleteShift = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/shifts/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Shift deleted successfully!");
        setDeleteTarget(null);
        fetchShifts();
      } else {
        toast.error(data.message || "Failed to delete shift");
      }
    } catch (error) {
      toast.error("Error deleting shift");
    } finally {
      setDeleting(false);
    }
  };

  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      const matchesSearch =
        shift.shift_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shift.shift_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
          ? shift.is_active
          : !shift.is_active;
      return matchesSearch && matchesStatus;
    });
  }, [shifts, searchQuery, statusFilter]);

  const getShiftIcon = (code, start) => {
    const sH = Number(start?.split(":")[0] || 0);
    if (sH >= 5 && sH < 12) return <Sun className="h-5 w-5 text-amber-500" />;
    if (sH >= 12 && sH < 18) return <Sunset className="h-5 w-5 text-orange-500" />;
    return <Moon className="h-5 w-5 text-indigo-500" />;
  };

  return (
    <AppLayout currentUser={currentUser} onLogout={onLogout}>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-blue-700">
                <Clock className="h-3.5 w-3.5" /> Administration
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Shift Management</h1>
            <p className="text-xs font-semibold text-slate-500">
              Configure production shifts, working hours, customizable break schedules & grace timings.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchShifts}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              title="Refresh Shift Status"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-600" : "text-slate-400"}`} />
              Refresh
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-95"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              Add New Shift
            </button>
          </div>
        </div>

        {/* Current Live Shift Banner */}
        {activeShift ? (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 text-white shadow-xl shadow-blue-950/20">
            <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-emerald-300 backdrop-blur-md">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Currently Running Shift
                </div>
                <h2 className="text-2xl font-black text-white">{activeShift.shift_name} ({activeShift.shift_code})</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-md">
                    <Clock className="h-3.5 w-3.5 text-blue-400" />
                    {activeShift.start_time} - {activeShift.end_time} ({activeShift.duration})
                  </span>
                  <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-md">
                    <Timer className="h-3.5 w-3.5 text-emerald-400" />
                    Grace Period: {activeShift.grace_period_mins} mins
                  </span>
                  {Array.isArray(activeShift.breaks) && activeShift.breaks.length > 0 && (
                    <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-md">
                      <Coffee className="h-3.5 w-3.5 text-amber-400" />
                      {activeShift.breaks.length} Configured Breaks
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-md min-w-[140px]">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Duration</p>
                  <p className="text-xl font-black text-emerald-400">{activeShift.duration}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-md min-w-[140px]">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Status</p>
                  <p className="text-xl font-black text-blue-400">ON TRACK</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-amber-800 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-xs font-bold">
              No active shift detected for the current time. Verify your shift start & end timings below.
            </p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Total Configured Shifts</span>
              <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <Calendar className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{shifts.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Active Production Shifts</span>
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {shifts.filter((s) => s.is_active).length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">24-Hour Coverage</span>
              <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">24.0 Hrs</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Default Grace Period</span>
              <span className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <Timer className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">10 Mins</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by shift name or code..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-xs font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Shifts Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 font-black uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Shift Info</th>
                  <th className="px-4 py-3.5">Operating Hours</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">Breaks & Schedules</th>
                  <th className="px-4 py-3.5 text-center">Grace Period</th>
                  <th className="px-4 py-3.5 text-center">Overtime</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredShifts.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-slate-400 font-bold">
                      {loading ? "Loading shifts data..." : "No shifts found matching your criteria."}
                    </td>
                  </tr>
                ) : (
                  filteredShifts.map((shift) => (
                    <tr
                      key={shift.id}
                      className={`transition hover:bg-slate-50/80 ${
                        shift.is_current ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            {getShiftIcon(shift.shift_code, shift.start_time)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 text-sm">{shift.shift_name}</span>
                              {shift.is_current && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                                  LIVE NOW
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[11px] font-bold text-slate-400">
                              {shift.shift_code}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md">
                          <Clock className="h-3.5 w-3.5 text-slate-500" />
                          {shift.start_time} - {shift.end_time}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-700">
                        {shift.duration}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1.5">
                          {Array.isArray(shift.breaks) && shift.breaks.length > 0 ? (
                            shift.breaks.map((b, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-700 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-md w-fit">
                                {b.type === "meal" ? (
                                  <Utensils className="h-3 w-3 text-orange-500" />
                                ) : b.type === "maintenance" ? (
                                  <Wrench className="h-3 w-3 text-blue-500" />
                                ) : (
                                  <Coffee className="h-3 w-3 text-amber-500" />
                                )}
                                <span className="font-bold">{b.name}:</span>
                                <span className="font-mono">{b.start_time} - {b.end_time}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No break scheduled</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-700">
                        {shift.grace_period_mins} mins
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                            shift.overtime_allowed ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {shift.overtime_allowed ? "ALLOWED" : "NO"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => handleToggleStatus(shift)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black transition ${
                            shift.is_active
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {shift.is_active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {shift.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(shift)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                            title="Edit Shift"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(shift)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                            title="Delete Shift"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Expanded Widescreen Modal for Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 sm:p-6 backdrop-blur-md">
          <div className="w-full max-w-4xl lg:max-w-5xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto border border-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {editingShift ? "Edit Shift Configuration" : "Create New Production Shift"}
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    Configure shift code, operating timings, customizable breaks, and overtime parameters.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="space-y-6">
              {/* Basic Information */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-blue-600" /> Basic Shift Details
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">Shift Code *</label>
                    <input
                      type="text"
                      required
                      value={formData.shift_code}
                      onChange={(e) => setFormData({ ...formData, shift_code: e.target.value.toUpperCase() })}
                      placeholder="e.g. SHIFT_A"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">Shift Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.shift_name}
                      onChange={(e) => setFormData({ ...formData, shift_name: e.target.value })}
                      placeholder="e.g. Shift A (Morning)"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">Start Time (24h) *</label>
                    <input
                      type="time"
                      required
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">End Time (24h) *</label>
                    <input
                      type="time"
                      required
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Break Schedules Section */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Coffee className="h-4 w-4 text-amber-500" /> Break Schedules ({formData.breaks.length})
                    </h4>
                    <p className="text-[11px] font-medium text-slate-400">
                      Add, modify, or delete break schedules (Tea Breaks, Lunch, Maintenance, Handovers).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBreak}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition border border-blue-200/60"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[3]" /> Add Break Schedule
                  </button>
                </div>

                {formData.breaks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-400 bg-white">
                    <p className="text-xs font-bold">No breaks configured for this shift.</p>
                    <button
                      type="button"
                      onClick={handleAddBreak}
                      className="mt-2 text-xs font-bold text-blue-600 underline hover:text-blue-700"
                    >
                      + Add a Break
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.breaks.map((b, index) => (
                      <div
                        key={b.id || index}
                        className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-2 font-bold text-xs text-slate-400 w-8">
                          #{index + 1}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 flex-1">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">Break Name</label>
                            <input
                              type="text"
                              required
                              value={b.name}
                              onChange={(e) => handleUpdateBreak(index, "name", e.target.value)}
                              placeholder="e.g. Tea Break 1"
                              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">Type</label>
                            <select
                              value={b.type || "tea"}
                              onChange={(e) => handleUpdateBreak(index, "type", e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold focus:border-blue-500 focus:outline-none bg-white"
                            >
                              <option value="tea">Tea Break</option>
                              <option value="meal">Meal / Lunch</option>
                              <option value="maintenance">Maintenance Check</option>
                              <option value="general">General Break</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">Start Time</label>
                            <input
                              type="time"
                              required
                              value={b.start_time}
                              onChange={(e) => handleUpdateBreak(index, "start_time", e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">End Time</label>
                            <input
                              type="time"
                              required
                              value={b.end_time}
                              onChange={(e) => handleUpdateBreak(index, "end_time", e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveBreak(index)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition shrink-0 self-end sm:self-center"
                          title="Delete this Break"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Operational Controls & Rules */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Timer className="h-4 w-4 text-emerald-600" /> Shift Rules & Status
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">Grace Period (Minutes)</label>
                    <input
                      type="number"
                      value={formData.grace_period_mins}
                      onChange={(e) => setFormData({ ...formData, grace_period_mins: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-blue-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-5">
                    <label className="flex items-center gap-2.5 text-xs font-extrabold text-slate-700 cursor-pointer bg-white border border-slate-200 px-4 py-2.5 rounded-xl w-full">
                      <input
                        type="checkbox"
                        checked={formData.overtime_allowed}
                        onChange={(e) => setFormData({ ...formData, overtime_allowed: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Overtime Allowed
                    </label>
                  </div>
                  <div className="flex items-center gap-3 pt-5">
                    <label className="flex items-center gap-2.5 text-xs font-extrabold text-slate-700 cursor-pointer bg-white border border-slate-200 px-4 py-2.5 rounded-xl w-full">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Active Shift
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition"
                >
                  {submitting ? "Saving..." : editingShift ? "Save Changes" : "Create Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-center border border-slate-100">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-black text-slate-900">Delete Shift</h3>
            <p className="text-xs font-bold text-slate-500">
              Are you sure you want to delete <span className="text-slate-900 font-extrabold">{deleteTarget.shift_name}</span> ({deleteTarget.shift_code})? This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteShift}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-700"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
