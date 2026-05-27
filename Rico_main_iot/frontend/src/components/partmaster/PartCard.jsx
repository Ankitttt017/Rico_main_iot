import React from "react";
import { useNavigate } from "react-router-dom";

const RicoPartIcon = () => (
  <svg viewBox="0 0 80 80" className="w-full h-full" fill="none">
    <circle cx="40" cy="40" r="38" fill="#8B0000" />
    <circle cx="40" cy="40" r="30" fill="#A00000" />
    {/* Stylized gear/part shape */}
    <path d="M40 15 L45 25 L55 22 L52 32 L62 37 L52 42 L55 52 L45 49 L40 59 L35 49 L25 52 L28 42 L18 37 L28 32 L25 22 L35 25 Z" fill="#cc0000" opacity="0.6"/>
    <circle cx="40" cy="37" r="12" fill="#8B0000" />
    <circle cx="40" cy="37" r="6" fill="#600000" />
  </svg>
);

const PartCard = ({ part }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/part/${part.id}`)}
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-teal-300 hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-2 app-panel"
    >
      {/* Part Image */}
      <div className="w-full aspect-square rounded-md flex items-center justify-center overflow-hidden app-part-visual">
        <div className="w-14 h-14">
          <RicoPartIcon />
        </div>
      </div>

      {/* Part Info */}
      <div>
        <p className="text-xs font-semibold app-part-title leading-tight line-clamp-2 min-h-[2.5rem]">
          {part.shortName}
          <br />
          <span className="text-gray-500 font-normal">{part.id}</span>
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs border-t border-gray-100 pt-2">
        <div className="text-center">
          <p className="font-bold text-gray-800">{part.operationCount}</p>
          <p className="text-gray-400 text-[10px]">Operations</p>
        </div>
        <div className="h-6 w-px bg-gray-200"></div>
        <div className="text-center flex-1">
          <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
            part.operationCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}>
            {part.operationCount > 0 ? "Linked" : "Unlinked"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PartCard;
