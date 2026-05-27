import React from "react";
import { useI18n } from "../../context/I18nContext";

const EmptyState = ({ title, description }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-6m3 6V7m3 10v-4m3 7H6a2 2 0 01-2-2V6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-base font-semibold text-gray-600 mb-1">{title}</h3>
    <p className="text-sm text-gray-400">{description}</p>
  </div>
);

export const ProductionOrdersTab = () => {
  const { t } = useI18n();
  return <EmptyState title={t("productionOrders")} description={t("noProductionOrders")} />;
};

export const ProductionLogTab = () => {
  const { t } = useI18n();
  return <EmptyState title={t("productionLog")} description={t("noProductionLogs")} />;
};
