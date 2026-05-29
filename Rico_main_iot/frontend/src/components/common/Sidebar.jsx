import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import BrandLogo from "./BrandLogo";
import { getStats } from "../../services/api";
import { useSidebar } from "../../context/SidebarContext";

const iconClass = "h-5 w-5";

const ricoOrganisationItems = [
  { label: "Line Master", to: "/lines", icon: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18", countKey: "lines" },
  { label: "Machine Master", to: "/machines", icon: "M4 7h16M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2m-9 4h4m-7 8h10a3 3 0 003-3v-5H4v5a3 3 0 003 3z", countKey: "machines" },
  { label: "Part Master", to: "/parts", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", countKey: "parts" },
  { label: "Operation Master", to: "/operations", icon: "M9 5H7a2 2 0 00-2 2v12h14V7a2 2 0 00-2-2h-2m-6 0a3 3 0 016 0m-6 0h6m-7 7h8m-8 4h5", exact: true },
];

const productionItems = [
  { label: "Digital Workstation", to: "/operator-workstation", icon: "M4 6h16M4 10h16M7 14h10m-8 4h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", countKey: "lines", newTab: true },
  { label: "Real Time Monitor", to: "/plc-monitor", icon: "M4 7h16M6 7v10a2 2 0 002 2h8a2 2 0 002-2V7M9 11h2m2 0h2M9 15h6M8 3h8a2 2 0 012 2v2H6V5a2 2 0 012-2z" },
  { label: "My Report", to: "/plc-report", icon: "M8 7h8M8 11h8M8 15h4M6 3h9l3 3v15H6a2 2 0 01-2-2V5a2 2 0 012-2zm9 0v4h4" },
];

const externalApps = [
  {
    label: "Traceability",
    href: "http://192.168.100.137:9090",
    icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  },
];

const isItemActive = (item, location) => {
  const [pathname, search = ""] = item.to.split("?");
  const searchStr = search ? "?" + search : "";
  if (searchStr) return location.pathname === pathname && location.search === searchStr;
  if (item.exact) return location.pathname === pathname && !location.search;
  return location.pathname === pathname;
};

const NavRow = ({ item, count, collapsed }) => {
  const location = useLocation();
  const { setMobileOpen } = useSidebar();
  const active = isItemActive(item, location);

  return (
    <NavLink
      to={item.to}
      title={item.label}
      target={item.newTab ? "_blank" : undefined}
      rel={item.newTab ? "noreferrer" : undefined}
      onClick={() => setMobileOpen(false)}
      className={
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 " +
        (collapsed ? "justify-center " : "") +
        (active
          ? "bg-[#1976b8] text-white shadow-lg shadow-[#061a2e]/35"
          : "text-[#b7c8dc] hover:bg-white/8 hover:text-white")
      }
    >
      <span
        className={
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors " +
          (active ? "bg-white/20 text-white" : "text-[#b7c8dc] group-hover:text-white")
        }
      >
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={item.icon} />
        </svg>
      </span>

      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {typeof count === "number" && count > 0 && (
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-bold " +
                (active ? "bg-white/20 text-white" : "bg-white/10 text-[#b7c8dc]")
              }
            >
              {count}
            </span>
          )}
        </>
      )}

      {collapsed && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg bg-[#092641] px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
          {item.label}
        </span>
      )}
    </NavLink>
  );
};

const Section = ({ title, items, counts, collapsed }) => {
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const hasActive = items.some((item) => isItemActive(item, location));

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div className={collapsed ? "px-2" : "px-3"}>
      {!collapsed && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-1.5"
        >
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#7f9bb7]">{title}</p>
          <svg
            className={"h-3 w-3 text-[#7f9bb7] transition-transform " + (open ? "rotate-180" : "")}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      {collapsed && <div className="my-2 border-t border-white/10" />}
      {(open || collapsed) && (
        <div className="mt-1 space-y-1">
          {items.map((item) => (
            <NavRow
              key={item.label}
              item={item}
              count={counts[item.countKey]}
              collapsed={collapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar = () => {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const [counts, setCounts] = useState({ parts: 0, machines: 0, operations: 0, lines: 0 });

  useEffect(() => {
    let active = true;
    getStats({ plant: "1002" })
      .then((response) => {
        if (!active) return;
        const stats = response.data?.data || {};
        setCounts({
          parts: Number(stats?.total_parts || 0),
          machines: Number(stats?.total_machines || 0),
          operations: 0,
          lines: Number(stats?.total_lines || 0),
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const formattedCounts = useMemo(() => counts, [counts]);

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={
          "app-sidebar fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/10 transition-all duration-300 ease-in-out " +
          (collapsed ? "w-[72px] " : "w-72 ") +
          (mobileOpen ? "translate-x-0 " : "-translate-x-full ") +
          "lg:translate-x-0"
        }
      >
        {/* Header */}
        <div
          className={
            "flex h-[78px] items-center border-b border-white/10 " +
            (collapsed ? "justify-center px-3" : "justify-between gap-3 px-4")
          }
        >
          {!collapsed && (
            <div className="flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white px-4 shadow-lg shadow-black/10">
              <BrandLogo wordmark />
            </div>
          )}
          <button
            type="button"
            title={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#9ec7ec] transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"}
              />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-3">
          <Section title="Organisation" items={ricoOrganisationItems} counts={formattedCounts} collapsed={collapsed} />
          <Section title="Production" items={productionItems} counts={formattedCounts} collapsed={collapsed} />

          {/* External Apps */}
          <div className={collapsed ? "px-2" : "px-3"}>
            {!collapsed && (
              <div className="flex w-full items-center justify-between px-3 py-1.5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#7f9bb7]">
                  External Apps
                </p>
              </div>
            )}
            {collapsed && <div className="my-2 border-t border-white/10" />}
            <div className="mt-1 space-y-1">
              {externalApps.map((app) => (
                <a
                  key={app.label}
                  href={app.href}
                  target="_blank"
                  rel="noreferrer"
                  title={app.label}
                  onClick={() => setMobileOpen(false)}
                  className={
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-[#b7c8dc] hover:bg-white/8 hover:text-white " +
                    (collapsed ? "justify-center" : "")
                  }
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#b7c8dc] group-hover:text-white">
                    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={app.icon} />
                    </svg>
                  </span>
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1 truncate">{app.label}</span>
                      <svg className="h-3.5 w-3.5 text-[#7f9bb7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </>
                  )}
                  {collapsed && (
                    <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg bg-[#092641] px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                      {app.label}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
