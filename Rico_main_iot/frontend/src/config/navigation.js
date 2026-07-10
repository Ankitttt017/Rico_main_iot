export const overviewItems = [
  { label: "Dashboard", to: "/dashboard", icon: "M4 19V5m5 14V9m5 10V7m5 12V3M4 19h17", permission: "reports:view" },
];

export const factorySetupItems = [
  { label: "Plant Manager", to: "/settings/locations", icon: "M3 21h18M5 21V7l8-4 6 3v15M9 9h1m-1 4h1m4-4h1m-1 4h1M8 21v-4h6v4", countKey: "locations", permission: "master:manage" },
  { label: "Department Manager", to: "/settings/departments", icon: "M4 21V7a2 2 0 012-2h3V3h6v2h3a2 2 0 012 2v14M8 10h2m-2 4h2m4-4h2m-2 4h2M9 21v-3h6v3", permission: "master:manage" },
  { label: "Line / Cell Manager", to: "/lines", icon: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18", countKey: "lines", permission: "master:manage" },
];

export const assetSetupItems = [
  { label: "Machine & PLC Manager", to: "/machines", icon: "M4 7h16v10H4V7zm3 10v3m10-3v3M8 21h8M8 11h3m2 0h3", countKey: "machines", permission: "master:manage" },
];

export const processSetupItems = [
  { label: "Part Manager", to: "/parts", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", countKey: "parts", permission: "master:manage" },
  { label: "Operation Manager", to: "/operations", icon: "M9 5H7a2 2 0 00-2 2v12h14V7a2 2 0 00-2-2h-2m-6 0a3 3 0 016 0m-6 0h6m-7 7h8m-8 4h5", permission: "master:manage", exact: true },
];

export const masterDataItems = [
  ...factorySetupItems,
  ...assetSetupItems,
  ...processSetupItems,
];

export const shopfloorItems = [
  { label: "Digital Workstation", to: "/operator-workstation", icon: "M4 6h16M4 10h16M7 14h10m-8 4h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", countKey: "lines", permission: "workstation:view", newTab: true },
  { label: "Real Time Monitor", to: "/plc-monitor", icon: "M4 7h16M6 7v10a2 2 0 002 2h8a2 2 0 002-2V7M9 11h2m2 0h2M9 15h6M8 3h8a2 2 0 012 2v2H6V5a2 2 0 012-2z", permission: "plc:view" },
];

export const reportItems = [
  { label: "Production Reports", to: "/plc-report", icon: "M8 7h8M8 11h8M8 15h4M6 3h9l3 3v15H6a2 2 0 01-2-2V5a2 2 0 012-2zm9 0v4h4", permission: "reports:view" },
];

export const administrationItems = [
  { label: "User & Role Access", to: "/access-control", icon: "M16 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 11a4 4 0 100-8 4 4 0 000 8zm7.5-1l2 2 4-4", permission: "roles:manage" },
];

export const navigationSections = [
  { title: "Overview", items: overviewItems },
  { title: "Master Setup", items: masterDataItems },
  { title: "Shopfloor Control", items: shopfloorItems },
  { title: "Reports & Analysis", items: reportItems },
  { title: "Administration", items: administrationItems },
];

export const masterSetupItems = masterDataItems;
export const productionItems = [...shopfloorItems, ...reportItems];

export const factoryStructureItems = masterSetupItems.slice(0, 2);
export const productProcessItems = processSetupItems;
export const resourceControlItems = masterSetupItems.filter((item) =>
  ["Line / Cell Manager", "Machine & PLC Manager"].includes(item.label)
);
export const organisationItems = masterSetupItems;
export const processItems = productProcessItems;
export const ricoOrganisationItems = organisationItems;

export const externalApps = [
  {
    label: "Traceability",
    href: "http://192.168.100.136:9090",
    icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
    permission: "traceability:view",
  },
  {
    label: "Live Machine View",
    href: "http://192.168.100.136:3000",
    icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 6h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z",
    permission: "camera:view",
  },
];
