import React, { useEffect, useState } from "react";
import SearchableSelect from "../../../components/common/SearchableSelect";
import {
  STATUS_OPTIONS,
  emptyLine,
} from "../constants";
import { ActionInput, Field } from "./FormControls";
import { getLinePlantCode } from "../utils/lineUtils";

const LineWorkspaceModal = ({ initialLine, plant, plantOptions, departmentOptions, onPlantChange, saving, onClose, onSave }) => {
  const [line, setLine] = useState(initialLine || emptyLine);
  const [localError, setLocalError] = useState("");
  const isEdit = Boolean(initialLine?.line_id);

  useEffect(() => {
    if (initialLine?.line_id && !line.line_id) {
      setLine((prev) => ({ ...prev, ...initialLine }));
    }
  }, [initialLine, line.line_id]);

  const resolvePlantInfo = (code) => {
    const value = String(code || "").trim() || plant.code;
    const option = plantOptions.find((item) => String(item.value) === value);
    if (!option) return { code: value, name: plant.name || value };
    const label = String(option.label || value).trim();
    const suffix = ` (${value})`;
    return {
      code: value,
      name: label.endsWith(suffix) ? label.slice(0, -suffix.length) : label,
    };
  };

  const linePlantCode = getLinePlantCode(line, plant.code);
  const setLineField = (key, value) => setLine((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!line.line_name || !linePlantCode || !line.division) {
      setLocalError("Plant, department, and line name are required before saving the line.");
      return;
    }

    const selectedPlantInfo = resolvePlantInfo(linePlantCode);
    const finalLine = {
      ...line,
      line_code: line.line_code || `LN-${Date.now()}`,
      plant: selectedPlantInfo.name,
      plant_code: selectedPlantInfo.code,
      is_active: Boolean(line.is_active),
    };

    try {
      setLocalError("");
      await onSave({
        line: finalLine,
        machines: [],
        deletedMachineIds: [],
      });
    } catch (err) {
      setLocalError(err.response?.data?.message || err.message || "Unable to save line.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950">{isEdit ? "Edit Line" : "Add Line"}</h3>
            <p className="mt-1 text-sm text-slate-500">Create only the production line here. Add machines from Machine Settings.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Close</button>
        </div>

        <form onSubmit={submit}>
          <div className="p-5">
            {localError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{localError}</div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4">
                <h4 className="text-sm font-extrabold text-slate-900">Line Information</h4>
                <p className="mt-1 text-xs font-medium text-slate-400">A line belongs to one location and one department.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <Field label="Location / Plant">
                    <SearchableSelect
                      value={linePlantCode}
                      options={plantOptions}
                      placeholder="Search plant..."
                      onChange={(value) => {
                        const selected = resolvePlantInfo(value);
                        setLine((prev) => ({ ...prev, plant: selected.name, plant_code: selected.code, division: "" }));
                        onPlantChange?.(selected.code);
                      }}
                    />
                  </Field>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <Field label="Department">
                    <SearchableSelect
                      value={line.division || ""}
                      options={departmentOptions}
                      placeholder="Search department..."
                      onChange={(value) => setLineField("division", value)}
                    />
                  </Field>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <Field label="Line Name">
                    <ActionInput required value={line.line_name || ""} onChange={(e) => setLineField("line_name", e.target.value)} placeholder="Leak Test Line 1" />
                  </Field>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <Field label="Status">
                    <SearchableSelect
                      value={line.is_active ? "1" : "0"}
                      options={STATUS_OPTIONS}
                      placeholder="Search status..."
                      onChange={(value) => setLineField("is_active", value === "1")}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60">
              {saving ? "Saving..." : "Save Line"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LineWorkspaceModal;
