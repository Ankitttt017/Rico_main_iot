import React from "react";

const LineIllustration = () => (
  <svg viewBox="0 0 160 120" className="h-full w-full drop-shadow-sm" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="lineBody" x1="20" y1="20" x2="140" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3b82f6" />
        <stop offset="0.5" stopColor="#2563eb" />
        <stop offset="1" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <ellipse cx="80" cy="108" rx="60" ry="7" fill="#0f172a" opacity="0.07" />
    <rect x="18" y="72" width="124" height="16" rx="8" fill="url(#lineBody)" />
    <rect x="24" y="76" width="112" height="8" rx="4" fill="#1d4ed8" opacity="0.5" />
    {[30, 50, 70, 90, 110].map((x) => (
      <rect key={x} x={x} y="76" width="12" height="8" rx="2" fill="#60a5fa" opacity="0.4" />
    ))}
    <circle cx="26" cy="80" r="10" fill="#1e40af" />
    <circle cx="26" cy="80" r="6" fill="#3b82f6" />
    <circle cx="26" cy="80" r="2" fill="#bfdbfe" />
    <circle cx="134" cy="80" r="10" fill="#1e40af" />
    <circle cx="134" cy="80" r="6" fill="#3b82f6" />
    <circle cx="134" cy="80" r="2" fill="#bfdbfe" />
    <rect x="35" y="44" width="28" height="28" rx="4" fill="#1e40af" />
    <rect x="38" y="47" width="22" height="18" rx="2" fill="#3b82f6" />
    <circle cx="49" cy="56" r="6" fill="#93c5fd" />
    <rect x="75" y="38" width="28" height="34" rx="4" fill="#1e40af" />
    <rect x="78" y="41" width="22" height="20" rx="2" fill="#3b82f6" />
    <rect x="112" y="48" width="24" height="24" rx="4" fill="#1e40af" />
    <rect x="115" y="51" width="18" height="14" rx="2" fill="#3b82f6" />
  </svg>
);

export default LineIllustration;
