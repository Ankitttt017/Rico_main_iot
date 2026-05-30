import React from "react";
import { useNavigate } from "react-router-dom";
import PartIllustration from "./PartIllustration";

const PartCard = ({ part, t }) => {
  const navigate = useNavigate();
  const opCount = part.operation_count || 0;
  const openPart = () => navigate(`/part/${part.material_code}`);

  const handleCardClick = (event) => {
    const selection = window.getSelection?.().toString().trim();
    if (selection || event.defaultPrevented) return;
    openPart();
  };

  const handleCardKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPart();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`Open ${part.description || "part"} details`}
      className="group flex h-full min-h-[220px] cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-slate-200/80 focus:outline-none focus:ring-4 focus:ring-teal-100"
    >
      <div className="mb-2 flex aspect-[1.3] w-full items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(145deg,_#f8fafc_0%,_#eef5f4_100%)] p-2 ring-1 ring-slate-100">
        <div className="h-full max-h-16 w-full transition-transform duration-200 group-hover:scale-105">
          <PartIllustration />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 min-h-[2rem] cursor-text select-text break-words text-[11px] font-extrabold leading-snug text-slate-950" title={part.description || ""}>
          {part.description || "Unnamed Part"}
        </p>
        <p className="mt-0.5 cursor-text select-text truncate font-mono text-[9px] font-semibold text-slate-400" title={part.material_code}>
          {part.material_code}
        </p>
        {part.manufacturing_type && (
          <span className="mt-1.5 inline-flex max-w-full truncate rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">
            {part.manufacturing_type}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-2 border-t border-slate-100 pt-3 text-xs">
        <div>
          <p className="text-base font-extrabold leading-none text-slate-950">{opCount}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("operations")}</p>
        </div>
        <div className="flex min-w-0 justify-end">
          <span className={`max-w-full truncate rounded-full px-2 py-1 text-[10px] font-bold ${opCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {opCount > 0 ? t("linked") : t("unlinked")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PartCard;
