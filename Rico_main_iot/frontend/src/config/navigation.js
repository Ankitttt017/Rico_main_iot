export const ricoOrganisationItems = [
  { label: "Line Master", to: "/lines", icon: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18", countKey: "lines" },
  { label: "Machine Master", to: "/machines", icon: "M4 7h16M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2m-9 4h4m-7 8h10a3 3 0 003-3v-5H4v5a3 3 0 003 3z", countKey: "machines" },
  { label: "Part Master", to: "/parts", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", countKey: "parts" },
  { label: "Operation Master", to: "/operations", icon: "M9 5H7a2 2 0 00-2 2v12h14V7a2 2 0 00-2-2h-2m-6 0a3 3 0 016 0m-6 0h6m-7 7h8m-8 4h5", exact: true },
];

export const productionItems = [
  { label: "Digital Workstation", to: "/operator-workstation", icon: "M4 6h16M4 10h16M7 14h10m-8 4h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", countKey: "lines", newTab: true },
  { label: "Real Time Monitor", to: "/plc-monitor", icon: "M4 7h16M6 7v10a2 2 0 002 2h8a2 2 0 002-2V7M9 11h2m2 0h2M9 15h6M8 3h8a2 2 0 012 2v2H6V5a2 2 0 012-2z" },
  { label: "Add Machine", to: "/ube-machine-setup", icon: "M4 7h16M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2m-8 5h6m-8 4h10M6 21h12a2 2 0 002-2V9H4v10a2 2 0 002 2z" },
  { label: "My Report", to: "/plc-report", icon: "M8 7h8M8 11h8M8 15h4M6 3h9l3 3v15H6a2 2 0 01-2-2V5a2 2 0 012-2zm9 0v4h4" },
];

export const externalApps = [
  {
    label: "Traceability",
    href: "http://192.168.100.137:9090",
    icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  },
];
