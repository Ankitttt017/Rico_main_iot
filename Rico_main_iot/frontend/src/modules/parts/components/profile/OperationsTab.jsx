import React, { useRef, useState } from "react";
import { deleteOperation, getOperations, getPartSheetDownloadUrl, updateOperation, uploadSheet } from "../../../../services/api";
import { useI18n } from "../../../../context/I18nContext";

const OperationsTab = ({ part, partId, onOperationsChange, onSheetsChange }) => {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const refreshOperations = async () => {
    const res = await getOperations(partId);
    onOperationsChange?.(res.data.data || []);
  };

  const startEdit = (op) => {
    setEditingId(op.id);
    setDraft({
      sr_no: op.sr_no || "",
      name: op.name || "",
      type: op.type || "",
      label: op.label || "",
      rework: op.rework || "",
    });
  };

  const saveOperation = async (operationId) => {
    setSavingId(operationId);
    try {
      await updateOperation(partId, operationId, draft);
      await refreshOperations();
      setEditingId(null);
      setDraft(null);
    } finally {
      setSavingId(null);
    }
  };

  const removeOperation = async (operationId) => {
    if (!window.confirm("Remove this operation from the part routing?")) return;
    setSavingId(operationId);
    try {
      await deleteOperation(partId, operationId);
      await refreshOperations();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{t("partOperationsTitle")}</h2>
        <p className="text-sm text-gray-500 mb-4">
          {t("partOperationsDescription")}{" "}
          <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded font-medium">{t("rework")}</span>{" "}
          {t("operationsSeparate")}
        </p>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[t("sr"), t("name"), t("type"), t("label"), t("reworkLabel"), t("actions")].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {part.operations.length > 0 ? (
                part.operations.map((op) => {
                  const isEditing = editingId === op.id;
                  return (
                    <tr key={op.id || `${op.sr_no}-${op.label}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 font-medium">
                        {isEditing ? (
                          <input
                            value={draft.sr_no}
                            onChange={(event) => setDraft((prev) => ({ ...prev, sr_no: event.target.value }))}
                            className="w-14 rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-100"
                          />
                        ) : (
                          op.sr_no || op.sr
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium max-w-xs">
                        {isEditing ? (
                          <input
                            value={draft.name}
                            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-100"
                          />
                        ) : (
                          <>
                            <p className="truncate">{op.name}</p>
                            {op.machines?.length > 0 && (
                              <p className="mt-1 truncate text-[11px] font-medium text-slate-400">
                                Machine: {op.machines.map((machine) => machine.name).join(", ")}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.type}
                            onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                            className="w-28 rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-100"
                          />
                        ) : (
                          <span className="app-badge text-xs font-semibold px-2 py-1 rounded">{op.type}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                        {isEditing ? (
                          <input
                            value={draft.label}
                            onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                            className="w-24 rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-100"
                          />
                        ) : (
                          op.label
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.rework}
                            onChange={(event) => setDraft((prev) => ({ ...prev, rework: event.target.value }))}
                            className="w-36 rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-100"
                          />
                        ) : op.rework === "No rework assigned" ? (
                          <span className="text-gray-400 text-xs italic">{t("noReworkAssigned")}</span>
                        ) : (
                          <span className="bg-orange-50 text-orange-700 text-xs font-medium px-2 py-1 rounded">{op.rework}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={savingId === op.id}
                              onClick={() => saveOperation(op.id)}
                              className="rounded bg-teal-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {savingId === op.id ? "..." : t("save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingId(null); setDraft(null); }}
                              className="text-xs font-medium text-slate-500 hover:text-slate-700"
                            >
                              {t("cancel")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(op)}
                              className="text-teal-600 hover:text-teal-700 transition-colors"
                              title={t("edit")}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              disabled={savingId === op.id}
                              onClick={() => removeOperation(op.id)}
                              className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-60"
                              title={t("delete")}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-gray-500">{t("operationsUnavailable")}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      No rows found in MySQL operations for part code {partId}.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SheetSection
        title={t("processFlowDiagram")}
        actionLabel={t("processFlowDiagramSheet")}
        type="processFlow"
        partId={partId}
        data={part.processFlowDiagram}
        emptyMsg={t("noProcessFlowUploaded")}
        onSheetsChange={onSheetsChange}
      />

      <SheetSection
        title={t("finalInspectionSheet")}
        actionLabel={t("uploadInspectionSheet")}
        type="inspection"
        partId={partId}
        data={part.finalInspectionSheet}
        emptyMsg={t("noInspectionUploaded")}
        onSheetsChange={onSheetsChange}
      />

      <SheetSection
        title={t("controlPlanChart")}
        actionLabel={t("controlPlanDiagramSheet")}
        type="controlPlan"
        partId={partId}
        data={part.controlPlanChart}
        emptyMsg={t("noControlPlanUploaded")}
        onSheetsChange={onSheetsChange}
      />
    </div>
  );
};

const SheetSection = ({ title, actionLabel, type, partId, data, emptyMsg, onSheetsChange }) => {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileData = await readFile(file);
      const nextVersion = `V${(data?.length || 0) + 1}`;
      const res = await uploadSheet(partId, type, {
        fileName: file.name,
        fileData,
        version: nextVersion,
        updatedBy: "Admin",
      });
      onSheetsChange((prev) => ({ ...prev, [type]: res.data.data }));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,.png,.jpg,.jpeg"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 transition-colors disabled:opacity-60"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {uploading ? t("uploading") : actionLabel}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-3">{t("operationDescription")}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {[t("uploadDate"), t("version"), t("fileName"), t("updatedBy")].map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-5 text-center text-red-500 text-sm font-medium">{emptyMsg}</td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{row.uploadDate}</td>
                  <td className="px-4 py-3 text-gray-600">{row.version}</td>
                  <td className="px-4 py-3">
                    {row.filePath ? (
                      <a
                        className="text-teal-700 hover:underline"
                        href={getPartSheetDownloadUrl(partId, type, row.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.fileName}
                      </a>
                    ) : (
                      <span className="text-teal-700">{row.fileName}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.updatedBy}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OperationsTab;
