import React, { Suspense, lazy, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { I18nProvider } from "./context/I18nContext";
import { SidebarProvider } from "./context/SidebarContext";

// ─── Rico IoT Pages ────────────────────────────────────────────────
const LoginPage = lazy(() => import("./pages/LoginPage"));
const LineMasterPage = lazy(() => import("./pages/LineMasterPage"));
const OperatorWorkstationPage = lazy(() => import("./pages/OperatorWorkstationPage"));
const IotDashboardPage = lazy(() => import("./pages/IotDashboardPage"));
const LocationMasterPage = lazy(() => import("./modules/locations/pages/LocationMasterPage"));
const DepartmentMasterPage = lazy(() => import("./modules/departments/pages/DepartmentMasterPage"));
const MachineDashboard = lazy(() => import("./modules/machine/MachineDashboard"));
const MachineProfilePage = lazy(() => import("./modules/machine/MachineProfilePage"));
const PartMasterPage = lazy(() => import("./pages/PartMasterPage"));
const PartProfilePage = lazy(() => import("./pages/PartProfilePage"));
const OperationsMasterPage = lazy(() => import("./pages/OperationsMasterPage"));
const PlcMonitorPage = lazy(() => import("./modules/plc-monitor/PlcMonitorPage"));
const PlcReportPage = lazy(() => import("./modules/plc-report/PlcReportPage"));
const UserAccessPage = lazy(() => import("./modules/access/pages/UserAccessPage"));
const UnderDevelopmentPage = lazy(() => import("./pages/UnderDevelopmentPage"));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-bold text-slate-600">
    Loading...
  </div>
);

const hasPermission = (user, permission) => {
  if (!permission) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const managePermission = permission.replace(":view", ":manage");
  return permissions.includes(permission) || permissions.includes(managePermission) || permissions.includes("roles:manage");
};

// ─── Auth Helpers ──────────────────────────────────────────────────
function getSavedUser() {
  try {
    const saved = sessionStorage.getItem("rico_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    sessionStorage.removeItem("rico_user");
    return null;
  }
}

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => sessionStorage.getItem("rico_auth") === "true"
  );
  const [currentUser, setCurrentUser] = useState(() => getSavedUser());
  const [workstationUser, setWorkstationUser] = useState(
    () => sessionStorage.getItem("rico_workstation_user") || ""
  );

  const handleLogin = (username) => {
    const user = typeof username === "object"
      ? username
      : {
          name: username?.trim() || "Admin",
          role: username?.trim()?.toLowerCase() === "operator" ? "Operator" : "Administrator",
          role_key: username?.trim()?.toLowerCase() === "operator" ? "OPERATOR" : "SYSTEM_ADMIN",
          permissions: username?.trim()?.toLowerCase() === "operator"
            ? ["workstation:view", "workstation:operate"]
            : ["master:manage", "master:view", "plc:manage", "plc:view", "reports:view", "reports:export", "workstation:view", "workstation:operate", "downtime:view", "downtime:manage", "traceability:view", "ng:view", "roles:manage", "system:config"],
          landingPath: username?.trim()?.toLowerCase() === "operator" ? "/operator-workstation" : "/dashboard",
        };
    sessionStorage.setItem("rico_auth", "true");
    sessionStorage.setItem("rico_user", JSON.stringify(user));
    setCurrentUser(user);
    setIsLoggedIn(true);
    if (hasPermission(user, "workstation:view")) {
      sessionStorage.setItem("rico_workstation_auth", "true");
      sessionStorage.setItem("rico_workstation_user", user.name || user.username || "Operator");
      setWorkstationUser(user.name || user.username || "Operator");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("rico_auth");
    sessionStorage.removeItem("rico_user");
    sessionStorage.removeItem("rico_workstation_auth");
    sessionStorage.removeItem("rico_workstation_user");
    setCurrentUser(null);
    setIsLoggedIn(false);
    setWorkstationUser("");
  };

  const workstationRoute = (
    <Route
      path="/operator-workstation"
      element={
        requirePermission("workstation:view",
          <OperatorWorkstationPage
            onLogout={handleLogout}
            currentUser={{
              name: workstationUser || currentUser?.name || "Operator",
              role: currentUser?.role || "Operator",
              permissions: currentUser?.permissions || ["workstation:view", "workstation:operate"],
            }}
          />
        )
      }
    />
  );

  const requirePermission = (permission, element) => (
    hasPermission(currentUser, permission) ? element : <Navigate to={currentUser?.landingPath || "/operator-workstation"} />
  );

  return (
    <I18nProvider>
      <SidebarProvider>
        <Toaster position="top-right" />
        <Suspense fallback={<PageLoader />}>
          {!isLoggedIn ? (
            <LoginPage onLogin={handleLogin} />
          ) : (
            <Routes>
            {/* ── Default redirect ── */}
            <Route path="/" element={<Navigate to={currentUser?.landingPath || "/dashboard"} />} />

            {/* ══════════════════════════════════════
                RICO IOT ROUTES
            ══════════════════════════════════════ */}
            <Route
              path="/dashboard"
              element={
                requirePermission("reports:view", <IotDashboardPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/alerts"
              element={
                requirePermission("reports:view", <UnderDevelopmentPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                  title="Alerts"
                  subtitle="Alerts module is under development. Soon this page will show machine alarms, warning events and unresolved notifications."
                  type="alerts"
                />)
              }
            />
            <Route
              path="/settings/locations"
              element={
                requirePermission("master:manage", <LocationMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/settings/departments"
              element={
                requirePermission("master:manage", <DepartmentMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/lines"
              element={
                requirePermission("master:manage", <LineMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            {workstationRoute}
            <Route
              path="/parts"
              element={
                requirePermission("master:manage", <PartMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/part/:id"
              element={
                requirePermission("master:manage", <PartProfilePage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/operations"
              element={
                requirePermission("master:manage", <OperationsMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/machines"
              element={
                requirePermission("master:manage", <MachineDashboard
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/plc-monitor"
              element={
                requirePermission("plc:view", <PlcMonitorPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/downtime-tracker"
              element={
                requirePermission("downtime:view", <UnderDevelopmentPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                  title="Downtime Tracker"
                  subtitle="Downtime Tracker is under development. Soon this page will show downtime events, reasons, duration and loss analysis."
                  type="downtime"
                />)
              }
            />
            <Route
              path="/machine-plc-setup"
              element={<Navigate to="/machines" />}
            />
            <Route
              path="/plc-report"
              element={
                requirePermission("reports:view", <PlcReportPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/access-control"
              element={
                requirePermission("roles:manage", <UserAccessPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />
            <Route
              path="/system-settings"
              element={
                requirePermission("system:config", <UnderDevelopmentPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                  title="System Settings"
                  subtitle="System Settings is under development. Soon this page will include application preferences, integrations and setup controls."
                  type="settings"
                />)
              }
            />
            <Route
              path="/machine/:id"
              element={
                requirePermission("master:manage", <MachineProfilePage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />)
              }
            />

            {/* Legacy redirects */}
            <Route path="/organisation-master/machines" element={<Navigate to="/machines" />} />
            <Route path="/part-operations/part-master" element={<Navigate to="/machines" />} />
            <Route path="/ube-machine-setup" element={<Navigate to="/machine-plc-setup" />} />

            <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          )}
        </Suspense>
      </SidebarProvider>
    </I18nProvider>
  );
};

export default App;
