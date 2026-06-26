import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Monitor,
  Settings,
  Wrench,
  Users,
  FileText,
  Map,
} from "lucide-react";
import BrandLogo from "./BrandLogo";
import { getStats } from "../../services/api";
import { useSidebar } from "../../context/SidebarContext";

const badgeStyles = {
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
};

const navSections = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "reports:view" },
      { label: "Alerts", to: "/alerts", icon: Bell, badge: { text: "3", type: "amber" }, permission: "reports:view" },
      { label: "Digital Workstation", to: "/operator-workstation", icon: Monitor, badgeKey: "workstations", badgeType: "gray", permission: "workstation:view" },
      { label: "Real Time Monitor", to: "/plc-monitor", icon: Activity, badge: { text: "Live", type: "green" }, permission: "plc:view" },
      { label: "Downtime Tracker", to: "/downtime-tracker", icon: AlertTriangle, permission: "downtime:view" },
      { label: "My Report", to: "/plc-report", icon: FileText, permission: "reports:view" },
    ],
  },
  {
    title: "Master Setup",
    items: [
      { label: "Plant Manager", to: "/settings/locations", icon: Building2, permission: "master:manage" },
      { label: "Department Manager", to: "/settings/departments", icon: Building, permission: "master:manage" },
      { label: "Line Manager", to: "/lines", icon: LayoutGrid, badgeKey: "lines", badgeType: "gray", permission: "master:manage" },
      { label: "Machine Manager", to: "/machines", activePaths: ["/machine"], icon: Cpu, badgeKey: "machines", badgeType: "blue", permission: "master:manage" },
      { label: "Part Manager", to: "/parts", activePaths: ["/part"], icon: Wrench, badgeKey: "parts", badgeType: "gray", permission: "master:manage" },
      { label: "Operation Manager", to: "/operations", icon: ListChecks, permission: "master:manage" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "User & Role Access", to: "/access-control", icon: Users, permission: "roles:manage" },
      { label: "System Settings", to: "/system-settings", icon: Settings, permission: "system:config" },
    ],
  },
  {
    title: "External Apps",
    items: [
      { label: "Traceability", href: "http://192.168.100.136:9090", icon: Map, permission: "traceability:view", external: true },
    ],
  },
];

function hasPermission(user, permission) {
  if (!permission) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const managePermission = permission.replace(":view", ":manage");
  return permissions.includes(permission) || permissions.includes(managePermission) || permissions.includes("roles:manage");
}

function isActivePath(item, location) {
  if (!item.to) return false;
  if (item.activePaths?.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) return true;
  if (item.to === "/dashboard") return location.pathname === "/dashboard";
  return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
}

function Badge({ badge }) {
  if (!badge) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeStyles[badge.type] || badgeStyles.gray}`}>
      {badge.text}
    </span>
  );
}

function NavItem({ item, badge, collapsed }) {
  const location = useLocation();
  const { setMobileOpen } = useSidebar();
  const Icon = item.icon;
  const active = isActivePath(item, location);
  const baseClass = `group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
    collapsed ? "justify-center" : ""
  }`;
  const stateClass = item.disabled
    ? "cursor-not-allowed text-gray-300"
    : active
      ? "bg-blue-50 font-medium text-blue-700"
      : "text-gray-600 hover:bg-gray-100";
  const iconClass = active ? "text-blue-600" : item.disabled ? "text-gray-300" : "text-gray-500";
  const content = (
    <>
      <Icon size={18} className={`shrink-0 ${iconClass}`} strokeWidth={1.8} />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          <Badge badge={badge} />
        </>
      )}
      {collapsed && (
        <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {item.label}
        </span>
      )}
    </>
  );

  if (item.external && item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        title={collapsed ? item.label : ""}
        onClick={() => setMobileOpen(false)}
        className={`${baseClass} ${stateClass}`}
      >
        {content}
      </a>
    );
  }

  if (item.disabled || !item.to) {
    return (
      <button type="button" title={collapsed ? item.label : ""} disabled className={`${baseClass} ${stateClass}`}>
        {content}
      </button>
    );
  }

  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : ""}
      target={item.newTab ? "_blank" : undefined}
      rel={item.newTab ? "noreferrer" : undefined}
      onClick={() => setMobileOpen(false)}
      className={`${baseClass} ${stateClass}`}
    >
      {content}
    </NavLink>
  );
}

export default function Sidebar({ currentUser }) {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen, hovered, setHovered } = useSidebar();
  const [counts, setCounts] = useState({ lines: 25, machines: 1012, parts: 1129, workstations: 25 });

  useEffect(() => {
    let active = true;
    getStats()
      .then((response) => {
        if (!active) return;
        const stats = response.data?.data || {};
        setCounts((current) => ({
          ...current,
          lines: Number(stats.total_lines || current.lines),
          machines: Number(stats.total_machines || current.machines),
          parts: Number(stats.total_parts || current.parts),
          workstations: Number(stats.total_lines || current.workstations),
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const visibleSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => hasPermission(currentUser, item.permission)),
        }))
        .filter((section) => section.items.length),
    [currentUser]
  );

  const visualCollapsed = !mobileOpen && collapsed && !hovered;
  const widthClass = visualCollapsed ? "w-[60px]" : "w-[220px]";

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`fixed left-0 top-0 z-[60] flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200 ${widthClass} ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex h-[78px] items-center justify-between border-b border-gray-100 px-4 py-4">
          {!visualCollapsed && (
            <div className="flex min-w-0 flex-col">
              <BrandLogo wordmark />
              <p className="mt-0.5 truncate text-[9px] font-extrabold uppercase leading-none tracking-[0.08em] text-[#0b4f86]">
                Intelligence Manufacturing
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100"
            title={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
          >
            {visualCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
          {visibleSections.map((section) => (
            <div key={section.title}>
              {!visualCollapsed && (
                <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const badge = item.badge || (item.badgeKey ? { text: counts[item.badgeKey], type: item.badgeType || "gray" } : null);
                  return <NavItem key={item.label} item={item} badge={badge} collapsed={visualCollapsed} />;
                })}
              </div>
            </div>
          ))}
        </nav>

        {!visualCollapsed && (
          <div className="border-t border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-bold capitalize text-gray-800">{currentUser?.name || "Administrator"}</p>
            <p className="truncate text-xs font-medium text-gray-400">{currentUser?.role || "Administrator"}</p>
          </div>
        )}
      </aside>
    </>
  );
}
