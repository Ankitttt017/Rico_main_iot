import React, { useEffect, useState } from "react";
import { getPartById, updateConfig } from "../../services/api";
import { useI18n } from "../../context/I18nContext";

const ConfigField = ({ label, value, onSave }) => {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  useEffect(() => setVal(value), [value]);

  const handleSave = () => { onSave(val); setEditing(false); };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-600 w-40">{label}</span>
      <div className="flex items-center gap-3 flex-1">
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="border rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-teal-100 app-field"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              autoFocus
            />
            <button onClick={handleSave} className="text-xs bg-teal-700 text-white px-3 py-1 rounded hover:bg-teal-800 transition-colors">{t("save")}</button>
            <button onClick={() => { setVal(value); setEditing(false); }} className="text-xs text-gray-500 hover:text-gray-700">{t("cancel")}</button>
          </div>
        ) : (
          <>
            <span className="text-sm text-gray-800 flex-1">{val || <span className="text-gray-400 italic">{t("notSet")}</span>}</span>
            <button onClick={() => setEditing(true)} className="text-teal-600 hover:text-teal-700 transition-colors" title={t("edit")}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const ConfigurationTab = ({ part, partId, onConfigChange, onPartChange }) => {
  const { t } = useI18n();
  const [config, setConfig] = useState(part.configuration);

  const updateField = async (field, value) => {
    const nextConfig = { ...config, [field]: value };
    if (field === "hourlyTarget") {
      const target = Number(value);
      nextConfig.cycletime = target > 0 ? Math.round(3600 / target) : 0;
    }
    await updateConfig(partId, nextConfig);
    const savedConfig = {
      ...nextConfig,
      hourlyTarget: nextConfig.cycletime ? Math.floor(3600 / Number(nextConfig.cycletime)) : 0,
    };
    setConfig(savedConfig);
    onConfigChange?.(savedConfig);

    const partRes = await getPartById(partId);
    onPartChange?.(partRes.data.data);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">{t("configuration")}</h2>
      <p className="text-sm text-gray-500 mb-6">{t("configurationDescription")}</p>

      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {/* Left Column */}
          <div className="p-4 sm:border-r border-gray-100">
            <ConfigField label={t("hourlyTarget")} value={config.hourlyTarget} onSave={(v) => updateField("hourlyTarget", v)} />
            <ConfigField label={t("boxQuantity")} value={config.boxQuantity} onSave={(v) => updateField("boxQuantity", v)} />
          </div>
          {/* Right Column */}
          <div className="p-4">
            <ConfigField label={t("cycletime")} value={config.cycletime} onSave={(v) => updateField("cycletime", v)} />
            <ConfigField label={t("manufacturingType")} value={config.manufacturingType} onSave={(v) => updateField("manufacturingType", v)} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationTab;
