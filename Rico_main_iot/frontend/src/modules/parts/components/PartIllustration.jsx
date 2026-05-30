import React from "react";

const PartIllustration = () => (
  <svg viewBox="0 0 160 120" className="h-full w-full drop-shadow-sm" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="partBody" x1="36" y1="20" x2="128" y2="98" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f33f46" />
        <stop offset="0.48" stopColor="#c70d17" />
        <stop offset="1" stopColor="#7f0710" />
      </linearGradient>
      <linearGradient id="partEdge" x1="30" y1="78" x2="133" y2="90" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7c0710" />
        <stop offset="1" stopColor="#e11d2e" />
      </linearGradient>
      <radialGradient id="partHighlight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(66 38) rotate(55) scale(48 25)">
        <stop stopColor="#ff8a8e" stopOpacity="0.9" />
        <stop offset="1" stopColor="#ff8a8e" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="83" cy="101" rx="58" ry="8" fill="#0f172a" opacity="0.08" />
    <path d="M35 83c8-35 22-58 42-68 7-4 15-1 19 6l23 41c5 9 0 20-10 23L48 99c-10 2-16-6-13-16z" fill="url(#partBody)" />
    <path d="M44 91l67-14 13 13-78 17c-13 3-17-12-2-16z" fill="url(#partEdge)" />
    <path d="M55 76c8-19 16-34 30-51 6 14 13 27 22 43-16 2-34 6-52 8z" fill="url(#partHighlight)" />
    <path d="M48 87c17-3 42-8 65-14" stroke="#47070b" strokeWidth="4" strokeLinecap="round" opacity="0.45" />
    <path d="M51 93c20-4 49-10 75-16" stroke="#f87171" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    <g transform="translate(96 22)">
      <ellipse cx="20" cy="26" rx="18" ry="28" fill="#7f0710" />
      <ellipse cx="24" cy="26" rx="15" ry="25" fill="#d20f1b" />
      <ellipse cx="29" cy="26" rx="8" ry="17" fill="#7f0710" />
      <ellipse cx="31" cy="26" rx="5" ry="12" fill="#2b070a" opacity="0.9" />
      <path d="M16 4c7 5 11 14 12 28" stroke="#ff7a7f" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
    </g>
    <g transform="translate(42 43)">
      <circle cx="16" cy="18" r="12" fill="#7f0710" />
      <circle cx="16" cy="18" r="8" fill="#e11d2e" />
      <circle cx="16" cy="18" r="4" fill="#2b070a" />
      <path d="M7 15c2-5 6-8 12-8" stroke="#ff7a7f" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </g>
    <path d="M41 82c7 5 23 4 39-1" stroke="#4c0510" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
  </svg>
);

export default PartIllustration;
