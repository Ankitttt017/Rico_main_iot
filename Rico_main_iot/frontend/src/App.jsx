import React, { useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { I18nProvider } from "./context/I18nContext";
import { SidebarProvider } from "./context/SidebarContext";

// ─── Rico IoT Pages ────────────────────────────────────────────────
import LoginPage from "./pages/LoginPage";
import LineMasterPage from "./pages/LineMasterPage";
import OperatorWorkstationLoginPage from "./pages/OperatorWorkstationLoginPage";
import OperatorWorkstationPage from "./pages/OperatorWorkstationPage";
import PartMasterPage from "./pages/PartMasterPage";
import PartProfilePage from "./pages/PartProfilePage";
import OperationsMasterPage from "./pages/OperationsMasterPage";
import MachineDashboard from "./modules/machine/MachineDashboard";
import MachineProfilePage from "./modules/machine/MachineProfilePage";
import PlcMonitorPage from "./modules/plc-monitor/PlcMonitorPage";
import PlcReportPage from "./modules/plc-report/PlcReportPage";

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
      </SidebarProvider>
    </I18nProvider>
  );
};

export default App;
