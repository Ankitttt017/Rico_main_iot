import React, { Suspense, lazy, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { I18nProvider } from "./context/I18nContext";
import { SidebarProvider } from "./context/SidebarContext";

// ─── Rico IoT Pages ────────────────────────────────────────────────
const LoginPage = lazy(() => import("./pages/LoginPage"));
const LineMasterPage = lazy(() => import("./pages/LineMasterPage"));
const OperatorWorkstationLoginPage = lazy(() => import("./pages/OperatorWorkstationLoginPage"));
const OperatorWorkstationPage = lazy(() => import("./pages/OperatorWorkstationPage"));
const PartMasterPage = lazy(() => import("./pages/PartMasterPage"));
const PartProfilePage = lazy(() => import("./pages/PartProfilePage"));
const OperationsMasterPage = lazy(() => import("./pages/OperationsMasterPage"));
const MachineDashboard = lazy(() => import("./modules/machine/MachineDashboard"));
const MachineProfilePage = lazy(() => import("./modules/machine/MachineProfilePage"));
const PlcMonitorPage = lazy(() => import("./modules/plc-monitor/PlcMonitorPage"));
const PlcReportPage = lazy(() => import("./modules/plc-report/PlcReportPage"));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-bold text-slate-600">
    Loading...
  </div>
);

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
  const location = useLocation();
  const isWorkstationRoute = location.pathname === "/operator-workstation";
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => sessionStorage.getItem("rico_auth") === "true"
  );
  const [currentUser, setCurrentUser] = useState(() => getSavedUser());
  const [isWorkstationLoggedIn, setIsWorkstationLoggedIn] = useState(
    () => sessionStorage.getItem("rico_workstation_auth") === "true"
  );
  const [workstationUser, setWorkstationUser] = useState(
    () => sessionStorage.getItem("rico_workstation_user") || ""
  );

  const handleLogin = (username) => {
    const user = {
      name: username?.trim() || "Admin",
      role:
        username?.trim()?.toLowerCase() === "operator"
          ? "Operator"
          : "Administrator",
    };
    sessionStorage.setItem("rico_auth", "true");
    sessionStorage.setItem("rico_user", JSON.stringify(user));
    setCurrentUser(user);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("rico_auth");
    sessionStorage.removeItem("rico_user");
    sessionStorage.removeItem("rico_workstation_auth");
    sessionStorage.removeItem("rico_workstation_user");
    setCurrentUser(null);
    setIsLoggedIn(false);
    setIsWorkstationLoggedIn(false);
    setWorkstationUser("");
  };

  const handleWorkstationLogin = (username) => {
    const name = username?.trim() || "Operator";
    sessionStorage.setItem("rico_workstation_auth", "true");
    sessionStorage.setItem("rico_workstation_user", name);
    setWorkstationUser(name);
    setIsWorkstationLoggedIn(true);
  };

  const workstationRoute = (
    <Route
      path="/operator-workstation"
      element={
        isWorkstationLoggedIn ? (
          <OperatorWorkstationPage
            onLogout={handleLogout}
            currentUser={{
              name: workstationUser || currentUser?.name || "Operator",
              role: "Operator",
            }}
          />
        ) : (
          <OperatorWorkstationLoginPage onLogin={handleWorkstationLogin} />
        )
      }
    />
  );

  return (
    <I18nProvider>
      <SidebarProvider>
        <Toaster position="top-right" />
        <Suspense fallback={<PageLoader />}>
          {!isLoggedIn && !isWorkstationRoute ? (
            <LoginPage onLogin={handleLogin} />
          ) : (
            <Routes>
            {/* ── Default redirect ── */}
            <Route path="/" element={<Navigate to="/lines" />} />

            {/* ══════════════════════════════════════
                RICO IOT ROUTES
            ══════════════════════════════════════ */}
            <Route
              path="/lines"
              element={
                <LineMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />
            {workstationRoute}
            <Route
              path="/parts"
              element={
                <PartMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />
            <Route
              path="/part/:id"
              element={
                <PartProfilePage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />
            <Route
              path="/operations"
              element={
                <OperationsMasterPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />
            <Route
              path="/machines"
              element={
                <MachineDashboard
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />
            <Route
              path="/plc-monitor"
              element={
                <PlcMonitorPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />
            <Route
              path="/plc-report"
              element={
                <PlcReportPage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />
            <Route
              path="/machine/:id"
              element={
                <MachineProfilePage
                  onLogout={handleLogout}
                  currentUser={currentUser}
                />
              }
            />

            {/* Legacy redirects */}
            <Route path="/organisation-master/machines" element={<Navigate to="/machines" />} />
            <Route path="/part-operations/part-master" element={<Navigate to="/parts" />} />

            <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          )}
        </Suspense>
      </SidebarProvider>
    </I18nProvider>
  );
};

export default App;
