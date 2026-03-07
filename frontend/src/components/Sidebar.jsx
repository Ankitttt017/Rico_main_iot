import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Factory,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  QrCode,
  UserCog,
  Wrench,
  Boxes,
  SlidersHorizontal,
  Settings2,
  Activity,
  Package,
  Cpu,
  ScanLine,
  Wifi,
  Clock3,
  Regex,
  Users,
  FileText,
} from "lucide-react";
import { APP_ROUTES } from "../constants/routes";
import { roleAccessApi } from "../api/services";
import { getUserRole } from "../utils/authStorage";
import { canAccessModule, getRoleAccessSettings, saveRoleAccessSettings } from "../utils/roleAccess";

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [masterOpen, setMasterOpen] = useState(true);
  const [roleAccessSettings, setRoleAccessSettings] = useState(() => getRoleAccessSettings());
  const location = useLocation();
  const userRole = getUserRole();

  const topNavigation = useMemo(
    () => [
      { name: "Dashboard", path: APP_ROUTES.dashboard, icon: LayoutDashboard, moduleKey: "dashboard" },
      { name: "Operator View", path: APP_ROUTES.operatorView, icon: UserCog, moduleKey: "operator_view" },
      { name: "I/O Monitor", path: APP_ROUTES.ioMonitor, icon: Activity, moduleKey: "io_monitor" },
      { name: "Scanner Monitor", path: APP_ROUTES.scannerMonitor, icon: Wifi, moduleKey: "scanners" },
      { name: "Part Journey", path: APP_ROUTES.partJourney, icon: Wrench, moduleKey: "part_journey" },
      { name: "Production", path: APP_ROUTES.production, icon: Factory, moduleKey: "production" },
      { name: "Packing", path: APP_ROUTES.packing, icon: Boxes, moduleKey: "packing" },
    ],
    []
  );

  const masterNavigation = useMemo(
    () => [
      { name: "Master Overview", path: APP_ROUTES.masterSettings, icon: SlidersHorizontal, moduleKey: "master_settings" },
      { name: "Station Controls", path: APP_ROUTES.stationControls, icon: Settings2, moduleKey: "master_settings" },
      { name: "Master Reports", path: APP_ROUTES.masterReports, icon: FileText, moduleKey: "master_settings" },
      { name: "Machine Manager", path: APP_ROUTES.machines, icon: Package, moduleKey: "machines" },
      { name: "PLC Manager", path: APP_ROUTES.plcConfig, icon: Cpu, moduleKey: "plc_config" },
      { name: "Scanner Manager", path: APP_ROUTES.scanners, icon: ScanLine, moduleKey: "scanners" },
      { name: "Shift Manager", path: APP_ROUTES.shifts, icon: Clock3, moduleKey: "shifts" },
      { name: "QR Manager", path: APP_ROUTES.qrRules, icon: Regex, moduleKey: "qr_rules" },
      { name: "Packing Management", path: APP_ROUTES.packingManagement, icon: Boxes, moduleKey: "packing_management" },
      { name: "User Management", path: APP_ROUTES.users, icon: Users, moduleKey: "users" },
    ],
    []
  );

  const visibleTopNavigation = useMemo(
    () => topNavigation.filter((entry) => canAccessModule(userRole, entry.moduleKey, roleAccessSettings)),
    [roleAccessSettings, topNavigation, userRole]
  );

  const visibleMasterNavigation = useMemo(
    () => masterNavigation.filter((entry) => canAccessModule(userRole, entry.moduleKey, roleAccessSettings)),
    [masterNavigation, roleAccessSettings, userRole]
  );

  const isMasterActive = useMemo(
    () => visibleMasterNavigation.some((item) => location.pathname.startsWith(item.path)),
    [location.pathname, visibleMasterNavigation]
  );

  useEffect(() => {
    let cancelled = false;
    roleAccessApi
      .list()
      .then((data) => {
        if (cancelled || !data) {
          return;
        }
        saveRoleAccessSettings(data);
        setRoleAccessSettings(getRoleAccessSettings());
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  const renderNavItem = (item, nested = false) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) =>
          `flex items-center ${collapsed ? "justify-center" : "space-x-3"} px-3 py-3 rounded-lg transition-all ${nested && !collapsed ? "ml-3 mr-1" : ""
          } ${isActive
            ? "bg-gradient-to-r from-primary/20 to-transparent text-primary border-l-4 border-primary"
            : "text-text-muted hover:bg-bg-card/80 hover:text-text-main"
          }`
        }
      >
        <Icon size={18} />
        {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
      </NavLink>
    );
  };

  return (
    <aside
      className={`${collapsed ? "w-20" : "w-64"
        } bg-bg-card/50 backdrop-blur-xl border-r border-border/50 flex flex-col overflow-hidden transition-all duration-300`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-border/50">
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
              <QrCode className="text-primary" size={24} />
            </div>
            <span className="font-bold text-xl tracking-tight text-text-main font-outfit">
              Indus<span className="text-primary">Trace</span>
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mx-auto border border-primary/20">
            <QrCode className="text-primary" size={24} />
          </div>
        )}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="p-1 hover:bg-bg-dark rounded-lg transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto py-6">
        <div className="space-y-1 px-3">
          {visibleTopNavigation.map((item) => renderNavItem(item))}

          {visibleMasterNavigation.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setMasterOpen((prev) => !prev)}
                className={`w-full flex items-center ${collapsed ? "justify-center" : "justify-between"
                  } px-3 py-3 rounded-lg transition-all ${isMasterActive
                    ? "bg-gradient-to-r from-primary/20 to-transparent text-primary border-l-4 border-primary"
                    : "text-text-muted hover:bg-bg-card/80 hover:text-text-main"
                  }`}
              >
                <span className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
                  <SlidersHorizontal size={18} />
                  {!collapsed && <span className="text-sm font-medium">Settings</span>}
                </span>
                {!collapsed ? (
                  <ChevronDown size={16} className={`transition-transform ${masterOpen ? "rotate-180" : ""}`} />
                ) : null}
              </button>

              {!collapsed && masterOpen && (
                <div className="mt-1 space-y-1">
                  {visibleMasterNavigation.map((item) => renderNavItem(item, true))}
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
