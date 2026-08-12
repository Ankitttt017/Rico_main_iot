import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";

const pageMeta = {
  "/dashboard": { title: "Dashboard Overview", subtitle: "IoT production health and setup readiness", hideSearch: true },
  "/alerts": { title: "Alerts", subtitle: "Production alerts and notifications", hideSearch: true },
  "/settings/locations": { title: "Plant Manager", subtitle: "Plant and factory location setup", searchPlaceholder: "Search plant...", searchPath: "/settings/locations" },
  "/settings/departments": { title: "Department Manager", subtitle: "Department and division setup", searchPlaceholder: "Search department...", searchPath: "/settings/departments" },
  "/lines": { title: "Line Manager", subtitle: "Production line and shopfloor setup", searchPlaceholder: "Search line...", searchPath: "/lines" },
  "/parts": { title: "Part Manager", subtitle: "Part master, material and process configuration", searchPlaceholder: "Search part...", searchPath: "/parts" },
  "/operations": { title: "Operation Manager", subtitle: "Part routing, process steps and logs", searchPlaceholder: "Search operation...", searchPath: "/operations" },
  "/machines": { title: "Machine Manager", subtitle: "Machine assets and production setup", searchPlaceholder: "Search machine...", searchPath: "/machines" },
  "/operator-workstation": { title: "Operator View", subtitle: "Operator production screen and downtime entry", searchPlaceholder: "Search workstation...", searchPath: "/operator-workstation" },
  "/downtime-tracker": { title: "Downtime Tracker", subtitle: "Downtime events and loss tracking", hideSearch: true },
  "/plc-monitor": { title: "Real Time Monitor", subtitle: "", hideSearch: true },
  "/machine-plc-setup": { title: "PLC Config / Tags", subtitle: "PLC connection, register mapping and limits", searchPlaceholder: "Search PLC tag...", searchPath: "/machine-plc-setup" },
  "/ube-machine-setup": { title: "PLC Config / Tags", subtitle: "PLC connection, register mapping and limits", searchPlaceholder: "Search UBE tag...", searchPath: "/ube-machine-setup" },
  "/plc-report": { title: "Production Reports", subtitle: "Machine production history and exports", hideSearch: true },
  "/access-control": { title: "User & Role Access", subtitle: "Role wise screen access and traceability permissions", hideSearch: true },
  "/shift-management": { title: "Shift Management", subtitle: "Configure plant shifts, operating timings and break rules", hideSearch: true },
  "/system-settings": { title: "System Settings", subtitle: "Application configuration and preferences", hideSearch: true },
};

const Navbar = ({ onLogout, currentUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, hovered, setMobileOpen } = useSidebar();
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const meta = useMemo(() => {
    if (location.pathname.startsWith("/part/")) {
      return { title: "Part Profile", subtitle: "Configuration, operations and document control", searchPlaceholder: "Search part...", searchPath: "/parts" };
    }
    if (location.pathname.startsWith("/machine/")) {
      return { title: "Machine Profile", subtitle: "Live state, configuration and maintenance view", searchPlaceholder: "Search machine...", searchPath: "/machines" };
    }
    return pageMeta[location.pathname] || pageMeta["/lines"];
  }, [location.pathname]);

  const user = currentUser || { name: "Admin", role: "Administrator" };
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AD";

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("rico-theme", "light");
  }, []);

  useEffect(() => {
    setSearch(new URLSearchParams(location.search).get("search") || "");
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const value = search.trim();
    const searchPath = meta.searchPath || location.pathname || "/dashboard";
    navigate(value ? `${searchPath}?search=${encodeURIComponent(value)}` : searchPath);
  };

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearch(value);
    const params = new URLSearchParams(location.search);
    if (value.trim()) params.set("search", value);
    else params.delete("search");
    const query = params.toString();
    navigate(query ? `${location.pathname}?${query}` : location.pathname, { replace: true });
  };

  return (
    <header className={`app-topbar fixed left-0 right-0 top-0 z-50 h-[78px] border-b px-3 backdrop-blur transition-all duration-300 ease-in-out sm:px-4 xl:px-6 ${collapsed && !hovered ? "xl:left-[60px]" : "xl:left-[220px]"}`}>
      <div className="flex h-full items-center justify-between gap-4">

        {/* Left Side */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">

            {/* Hamburger - Mobile/Tablet Only */}
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white xl:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <span className="hidden h-9 w-1 rounded-full bg-[#007cba] sm:block" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold text-slate-950 sm:text-xl">{meta.title}</h1>
              {meta.subtitle && <p className="hidden truncate text-sm text-slate-500 md:block">{meta.subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Right Side */}
        <div className="flex shrink-0 items-center gap-2.5">
          {!meta.hideSearch && (
          <form onSubmit={handleSearchSubmit} className="relative hidden md:block">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={handleSearchChange}
              className="h-10 w-64 rounded-lg border border-[#cfdded] bg-[#f8fbff] pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#007cba] focus:bg-white focus:ring-4 focus:ring-[#007cba]/10"
              placeholder={meta.searchPlaceholder || "Search..."}
            />
          </form>
          )}

          <div className="relative border-l border-slate-200 pl-3" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              className={`flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors focus:outline-none focus:ring-4 focus:ring-[#007cba]/10 ${profileOpen ? "bg-[#eaf5ff]" : "hover:bg-[#f5f9fd]"}`}
            >
              <div className="hidden text-right leading-tight md:block">
                <p className="text-sm font-bold capitalize text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-500">{user.role}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#092641] text-sm font-bold text-white ring-4 ring-[#eaf5ff]">
                {initials}
              </div>
              <svg className={`hidden h-4 w-4 text-slate-400 transition-transform md:block ${profileOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-extrabold capitalize text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.role}</p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
