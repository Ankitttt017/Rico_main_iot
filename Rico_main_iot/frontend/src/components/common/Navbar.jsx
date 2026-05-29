import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../../context/I18nContext";
import { useSidebar } from "../../context/SidebarContext";

const pageMeta = {
  "/lines": { title: "Line Master", subtitle: "Production line, machine and part grouping" },
  "/operator-workstation": { title: "Digital Workstation", subtitle: "Read-only saved line and machine view" },
  "/parts": { title: "Part Master", subtitle: "Material and process master data" },
  "/machines": { title: "Machine Tracking", subtitle: "Live machine state and active operation view" },
  "/operations": { title: "Operation Master", subtitle: "Part routing, process steps and logs" },
  "/plc-monitor": { title: "Real Time Monitor", subtitle: "" },
  "/plc-report": { title: "My Report", subtitle: "Machine production history and exports" },
};

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const DatePicker = ({ selectedDate, onChange, onClose }) => {
  const today = new Date();
  const [view, setView] = useState({
    year: selectedDate ? selectedDate.getFullYear() : today.getFullYear(),
    month: selectedDate ? selectedDate.getMonth() : today.getMonth(),
  });

  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  const prevMonth = () => setView((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const nextMonth = () => setView((v) => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });
  const selectDay = (day) => { onChange(new Date(view.year, view.month, day)); onClose(); };

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-72 select-none rounded-xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/40">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-bold text-slate-800">{MONTHS[view.month]} {view.year}</span>
        <button type="button" onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {DAYS.map((day) => <span key={day} className="py-1 text-center text-[10px] font-semibold text-slate-400">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} />;
          const selected = selectedDate && selectedDate.getFullYear() === view.year && selectedDate.getMonth() === view.month && selectedDate.getDate() === day;
          const current = today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day;
          return (
            <button key={day} type="button" onClick={() => selectDay(day)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${selected ? "bg-[#134b8f] text-white" : current ? "border border-[#007cba] text-[#134b8f] hover:bg-[#eaf5ff]" : "text-slate-700 hover:bg-slate-100"}`}>
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <button type="button" onClick={() => { onChange(new Date()); onClose(); }} className="text-xs font-semibold text-[#134b8f] hover:underline">Today</button>
        <button type="button" onClick={() => { onChange(null); onClose(); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
      </div>
    </div>
  );
};

const Navbar = ({ onLogout, currentUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, t } = useI18n();
  const { collapsed, setMobileOpen } = useSidebar();
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const pickerRef = useRef(null);
  const profileRef = useRef(null);

  const meta = useMemo(() => {
    if (location.pathname.startsWith("/part/")) return { title: "Part Profile", subtitle: "Configuration, operations and document control" };
    if (location.pathname.startsWith("/machine/")) return { title: "Machine Profile", subtitle: "Live state, configuration and maintenance view" };
    return pageMeta[location.pathname] || pageMeta["/parts"];
  }, [location.pathname]);

  const displayDate = useMemo(() => {
    const date = selectedDate || new Date();
    return date.toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }, [selectedDate, locale]);

  const user = currentUser || { name: "Admin", role: "Administrator" };
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AD";

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("rico-theme", "light");
  }, []);

  useEffect(() => {
    if (!pickerOpen && !profileOpen) return;
    const handler = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) setPickerOpen(false);
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen, profileOpen]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const value = search.trim();
    navigate(value ? `/parts?search=${encodeURIComponent(value)}` : "/parts");
  };

  return (
    <header className={`app-topbar fixed left-0 right-0 top-0 z-50 h-[78px] border-b px-4 backdrop-blur transition-all duration-300 ease-in-out lg:px-6 ${collapsed ? "lg:left-[72px]" : "lg:left-72"}`}>
      <div className="flex h-full items-center justify-between gap-4">

        {/* Left Side */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">

            {/* Hamburger - Mobile/Tablet Only */}
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white lg:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <span className="hidden h-9 w-1 rounded-full bg-[#007cba] sm:block" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold text-slate-950">{meta.title}</h1>
              {meta.subtitle && <p className="hidden truncate text-sm text-slate-500 md:block">{meta.subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Right Side */}
        <div className="flex shrink-0 items-center gap-2.5">
          <form onSubmit={handleSearchSubmit} className="relative hidden md:block">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-64 rounded-lg border border-[#cfdded] bg-[#f8fbff] pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#007cba] focus:bg-white focus:ring-4 focus:ring-[#007cba]/10"
              placeholder={t("searchPartPlaceholder")}
            />
          </form>

          <div className="relative hidden sm:block" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((prev) => !prev)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-4 focus:ring-[#007cba]/10 ${pickerOpen ? "border-[#007cba] bg-[#eaf5ff] text-[#134b8f]" : "border-[#cfdded] bg-[#f8fbff] text-slate-700 hover:border-[#9fb8d2] hover:bg-white"}`}
            >
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="hidden lg:inline">{displayDate}</span>
            </button>
            {pickerOpen && <DatePicker selectedDate={selectedDate} onChange={setSelectedDate} onClose={() => setPickerOpen(false)} />}
          </div>

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
