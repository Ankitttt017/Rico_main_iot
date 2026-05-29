import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import Sidebar from "../components/common/Sidebar";
import OperationsTab from "../components/partprofile/OperationsTab";
import ConfigurationTab from "../components/partprofile/ConfigurationTab";
import { ProductionOrdersTab, ProductionLogTab } from "../components/partprofile/LockedTabs";
import { getPartById, getOperations, getConfig, getSheets, updatePart } from "../services/api";
import { useI18n } from "../context/I18nContext";
import { useSidebar } from "../context/SidebarContext";

const RicoIcon = () => (
  <svg viewBox="0 0 80 80" className="w-full h-full" fill="none">
    <circle cx="40" cy="40" r="38" fill="#8B0000" />
    <circle cx="40" cy="40" r="28" fill="#A00000" />
    <circle cx="40" cy="40" r="10" fill="#600000" />
    <circle cx="40" cy="40" r="5" fill="#3a0000" />
  </svg>
);

const EditableInfoRow = ({ label, value, editable, onSave, saveLabel, cancelLabel }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value || ""), [value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</span>
        {editable && (
          <button onClick={() => setEditing(true)} className="p-0.5 hover:bg-gray-100 rounded text-teal-600 hover:text-teal-700 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1 flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-100 app-field"
            autoFocus
          />
          <button onClick={handleSave} disabled={saving} className="text-[10px] bg-teal-700 text-white px-2 py-1 rounded disabled:opacity-60">
            {saving ? "..." : saveLabel}
          </button>
          <button onClick={() => { setDraft(value || ""); setEditing(false); }} className="text-[10px] text-gray-500 hover:text-gray-700">{cancelLabel}</button>
        </div>
      ) : (
        <p className={`text-sm mt-0.5 font-semibold ${value ? "app-part-title" : "text-gray-300 italic"}`}>{value || "-"}</p>
      )}
    </div>
  );
};

const tabIcons = {
  operations: "M4 19V5m5 14V9m5 10V7m5 12v-8",
  configuration: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  "production-orders": "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10",
  "production-log": "M9 17v-2m3 2v-6m3 6v-4m3 8H6a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z",
};

const LockedIcon = () => (
  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const PartProfilePage = ({ onLogout, currentUser }) => {
  const { t } = useI18n();
  const { collapsed } = useSidebar();
  const { id } = useParams();
  const navigate = useNavigate();
  const tabs = [
    { key: "operations", label: t("operations") },
    { key: "configuration", label: t("configuration") },
    { key: "production-orders", label: t("productionOrders") },
    { key: "production-log", label: t("productionLog") },
  ];

  const [activeTab, setActiveTab] = useState("operations");
  const [part, setPart] = useState(null);
  const [operations, setOperations] = useState([]);
  const [config, setConfig] = useState(null);
  const [sheets, setSheets] = useState({ processFlow: [], inspection: [], controlPlan: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([getPartById(id), getOperations(id), getConfig(id), getSheets(id)])
      .then(([pRes, oRes, cRes, sRes]) => {
        setPart(pRes.data.data);
        setOperations(oRes.data.data);
        setConfig(cRes.data.data);
        setSheets(sRes.data.data);
      })
      .catch(() => setError(t("loadPartError")))
      .finally(() => setLoading(false));
  }, [id, t]);

  const savePartField = async (field, value) => {
    const res = await updatePart(id, { [field]: value });
    setPart(res.data.data);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-10 h-10 animate-spin app-brand-text" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-400 text-sm">{t("loadingPartDetails")}</p>
        </div>
      </div>
    );
  }

  if (error || !part) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-600 mb-2">{error || t("partNotFound")}</h2>
          <button onClick={() => navigate("/parts")} className="app-brand-text hover:underline text-sm">&larr; {t("backToPartMaster")}</button>
        </div>
      </div>
    );
  }

  const partData = {
    ...part,
    operations,
    processFlowDiagram: sheets.processFlow || [],
    finalInspectionSheet: sheets.inspection || [],
    controlPlanChart: sheets.controlPlan || [],
    configuration: config || { hourlyTarget: 0, cycletime: 0, boxQuantity: 0, manufacturingType: "" },
  };

  return (
    <div className="min-h-screen app-page">
      <Navbar onLogout={onLogout} currentUser={currentUser} />
      <Sidebar />

      <main className={`pt-[94px] transition-all duration-300 ease-in-out ${
        collapsed ? "lg:pl-[72px]" : "lg:pl-72"
      }`}>
        <div className="p-4 sm:p-6 max-w-[1540px] mx-auto">
          <div className="flex items-center gap-1.5 mb-4 text-sm text-gray-500">
            <button onClick={() => navigate("/parts")} className="app-brand-text font-semibold hover:underline">{t("partMaster")}</button>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-500 font-medium truncate max-w-xs">{id}</span>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <div className="w-full flex-shrink-0">
              <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="h-20 w-20 rounded-md border border-slate-100 bg-slate-50 p-3">
                    <RicoIcon />
                  </div>
                </div>

                <div className="mt-5 text-center">
                  <h2 className="text-lg font-bold leading-tight text-[#0b2f68]">{part.description}</h2>
                  {part.material_group && (
                    <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                      {part.material_group}
                    </span>
                  )}
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <EditableInfoRow
                    label="Final Operation New"
                    value={part.final_opn_code || part.opn_number || `${part.description || part.material_code}`}
                    editable
                    onSave={(v) => savePartField("final_opn_code", v)}
                    saveLabel={t("save")}
                    cancelLabel={t("cancel")}
                  />
                  <EditableInfoRow
                    label={t("customer")}
                    value={part.customer}
                    editable
                    onSave={(v) => savePartField("customer", v)}
                    saveLabel={t("save")}
                    cancelLabel={t("cancel")}
                  />
                  <EditableInfoRow
                    label={t("plant")}
                    value={part.plant_code}
                    editable
                    onSave={(v) => savePartField("plant_code", v)}
                    saveLabel={t("save")}
                    cancelLabel={t("cancel")}
                  />
                  <InfoBlock label={t("totalProduced")} value={String(part.total_produced || 0)} />
                  <InfoBlock label={t("version")} value={part.version} />
                  <InfoBlock label={t("registeredOn")} value={part.registered_on || formatDate(part.created_at)} />
                  <InfoBlock label={t("registeredBy")} value={part.registered_by} />
                  <InfoBlock label={t("revisionDate")} value={part.revision_date} />
                  <InfoBlock label={t("revisedBy")} value={part.revised_by} />
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4 space-y-0.5">
                  <EditableInfoRow label={t("materialCode")} value={part.material_code} editable={false} saveLabel={t("save")} cancelLabel={t("cancel")} />
                  <EditableInfoRow label={t("finalOpnCode")} value={part.final_opn_code} editable onSave={(v) => savePartField("final_opn_code", v)} saveLabel={t("save")} cancelLabel={t("cancel")} />
                  <EditableInfoRow label={t("opnNumber")} value={part.opn_number} editable onSave={(v) => savePartField("opn_number", v)} saveLabel={t("save")} cancelLabel={t("cancel")} />
                  <EditableInfoRow label={t("customer")} value={part.customer} editable onSave={(v) => savePartField("customer", v)} saveLabel={t("save")} cancelLabel={t("cancel")} />
                  <EditableInfoRow label={t("plant")} value={part.plant_code} editable onSave={(v) => savePartField("plant_code", v)} saveLabel={t("save")} cancelLabel={t("cancel")} />
                  <EditableInfoRow label={t("unitOfMeasure")} value={part.unit_of_measure} saveLabel={t("save")} cancelLabel={t("cancel")} />
                  <EditableInfoRow label={t("cycleTimeSec")} value={part.cycle_time_sec ? `${part.cycle_time_sec}s` : null} saveLabel={t("save")} cancelLabel={t("cancel")} />
                  <EditableInfoRow label={t("manufacturingType")} value={part.manufacturing_type} editable onSave={(v) => savePartField("manufacturing_type", v)} saveLabel={t("save")} cancelLabel={t("cancel")} />
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="responsive-scroll border-b border-slate-100">
                  <div className="grid min-w-[660px] grid-cols-4 sm:min-w-[760px] lg:min-w-0">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center justify-center gap-2 border-b-2 px-5 py-4 text-sm font-semibold transition-colors whitespace-nowrap ${
                          activeTab === tab.key ? "border-[#173b78] text-[#173b78]" : "border-transparent text-[#8291ad] hover:text-[#0b2f68]"
                        }`}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={tabIcons[tab.key]} />
                        </svg>
                        {tab.label}
                        {["production-orders", "production-log"].includes(tab.key) && <LockedIcon />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6 sm:p-8">
                  {activeTab === "operations" && (
                    <OperationsTab
                      part={partData}
                      partId={id}
                      onOperationsChange={setOperations}
                      onSheetsChange={setSheets}
                    />
                  )}
                  {activeTab === "configuration" && <ConfigurationTab part={partData} partId={id} onConfigChange={setConfig} onPartChange={setPart} />}
                  {activeTab === "production-orders" && <ProductionOrdersTab />}
                  {activeTab === "production-log" && <ProductionLogTab />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const InfoBlock = ({ label, value, editable }) => (
  <div className="group mb-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-[15px] font-semibold text-[#0b2f68]">{label}</p>
      {editable && (
        <svg className="h-4 w-4 shrink-0 text-[#173b78] opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )}
    </div>
    <p className={`mt-2 text-sm font-semibold leading-5 ${value ? "text-[#173b78]" : "text-slate-400"}`}>
      {value || "-"}
    </p>
  </div>
);

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default PartProfilePage;
