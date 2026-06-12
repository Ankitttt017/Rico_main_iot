import React from "react";
import { AlertTriangle, Construction, Settings } from "lucide-react";
import AppLayout from "../components/common/AppLayout";

const iconMap = {
  alerts: AlertTriangle,
  downtime: Construction,
  settings: Settings,
};

export default function UnderDevelopmentPage({
  onLogout,
  currentUser,
  title = "Page",
  subtitle = "This module is currently under development.",
  type = "settings",
}) {
  const Icon = iconMap[type] || Construction;

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
        <section className="w-full max-w-xl rounded-lg border border-[#c8d8e8] bg-white px-6 py-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Icon className="h-7 w-7" strokeWidth={1.8} />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-[#1a2332]">{title}</h1>
          <p className="mt-2 text-sm font-normal leading-6 text-[#6b7a8d]">{subtitle}</p>
          <div className="mt-5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Under Development
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
