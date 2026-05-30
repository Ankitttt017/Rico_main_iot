import React from "react";

const StatBox = ({ value, label }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
    <p className="text-2xl font-extrabold leading-none text-slate-950">{value}</p>
    <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
  </div>
);

export default StatBox;
