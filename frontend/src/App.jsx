import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import ProductionCharts from "./pages/ProductionCharts";
import Traceability from "./pages/Traceability";
import Machine from "./pages/Machine";
import UsersPage from "./pages/Users";
import ComponentJourney from "./pages/ComponentJourney";
import OperatorView from "./pages/OperatorView";
import QrFormatRules from "./pages/QrFormatRules";
import Scanners from "./pages/Scanners";
import ScannerMonitor from "./pages/ScannerMonitor";
import Packing from "./pages/Packing";
import PackingManagement from "./pages/PackingManagement";
import Shifts from "./pages/Shifts";
import MasterOverview from "./pages/MasterOverview";
import StationControls from "./pages/StationControls";
import MasterReports from "./pages/MasterReports";
import PlcConfiguration from "./pages/PlcConfiguration";
import IoMonitor from "./pages/IoMonitor";
import { getUserRole, isAuthenticated } from "./utils/authStorage";
import { APP_ROUTES } from "./constants/routes";
import { canAccessModule, getRoleAccessSettings } from "./utils/roleAccess";

const ProtectedRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to={APP_ROUTES.login} replace />;
};

const PublicOnlyRoute = ({ children }) => {
  return isAuthenticated() ? <Navigate to={APP_ROUTES.dashboard} replace /> : children;
};

const MODULE_REDIRECT_ORDER = [
  { moduleKey: "dashboard", path: APP_ROUTES.dashboard },
  { moduleKey: "operator_view", path: APP_ROUTES.operatorView },
  { moduleKey: "packing", path: APP_ROUTES.packing },
  { moduleKey: "packing_management", path: APP_ROUTES.packingManagement },
  { moduleKey: "production", path: APP_ROUTES.production },
  { moduleKey: "io_monitor", path: APP_ROUTES.ioMonitor },
  { moduleKey: "part_journey", path: APP_ROUTES.partJourney },
  { moduleKey: "master_settings", path: APP_ROUTES.masterSettings },
  { moduleKey: "machines", path: APP_ROUTES.machines },
  { moduleKey: "plc_config", path: APP_ROUTES.plcConfig },
  { moduleKey: "scanners", path: APP_ROUTES.scanners },
  { moduleKey: "scanners", path: APP_ROUTES.scannerMonitor },
  { moduleKey: "shifts", path: APP_ROUTES.shifts },
  { moduleKey: "qr_rules", path: APP_ROUTES.qrRules },
  { moduleKey: "users", path: APP_ROUTES.users },
];

function resolveFirstAccessibleRoute() {
  const role = getUserRole();
  const settings = getRoleAccessSettings();
  for (const entry of MODULE_REDIRECT_ORDER) {
    if (canAccessModule(role, entry.moduleKey, settings)) {
      return entry.path;
    }
  }
  return APP_ROUTES.login;
}

const ModuleRoute = ({ moduleKey, children }) => {
  const role = getUserRole();
  const settings = getRoleAccessSettings();
  if (canAccessModule(role, moduleKey, settings)) {
    return children;
  }
  return <Navigate to={resolveFirstAccessibleRoute()} replace />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path={APP_ROUTES.login}
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        
        <Route
          path={APP_ROUTES.root}
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={resolveFirstAccessibleRoute()} replace />} />
          <Route
            path={APP_ROUTES.dashboard.slice(1)}
            element={
              <ModuleRoute moduleKey="dashboard">
                <Dashboard />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.masterSettings.slice(1)}
            element={
              <ModuleRoute moduleKey="master_settings">
                <MasterOverview />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.stationControls.slice(1)}
            element={
              <ModuleRoute moduleKey="master_settings">
                <StationControls />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.masterReports.slice(1)}
            element={
              <ModuleRoute moduleKey="master_settings">
                <MasterReports />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.production.slice(1)}
            element={
              <ModuleRoute moduleKey="production">
                <ProductionCharts />
              </ModuleRoute>
            }
          />
          <Route path={APP_ROUTES.traceability.slice(1)} element={<Traceability />} />
          <Route
            path={APP_ROUTES.machines.slice(1)}
            element={
              <ModuleRoute moduleKey="machines">
                <Machine />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.plcConfig.slice(1)}
            element={
              <ModuleRoute moduleKey="plc_config">
                <PlcConfiguration />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.ioMonitor.slice(1)}
            element={
              <ModuleRoute moduleKey="io_monitor">
                <IoMonitor />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.users.slice(1)}
            element={
              <ModuleRoute moduleKey="users">
                <UsersPage />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.scanners.slice(1)}
            element={
              <ModuleRoute moduleKey="scanners">
                <Scanners />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.scannerMonitor.slice(1)}
            element={
              <ModuleRoute moduleKey="scanners">
                <ScannerMonitor />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.shifts.slice(1)}
            element={
              <ModuleRoute moduleKey="shifts">
                <Shifts />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.qrRules.slice(1)}
            element={
              <ModuleRoute moduleKey="qr_rules">
                <QrFormatRules />
              </ModuleRoute>
            }
          />
          <Route path="admin" element={<Dashboard />} />
          <Route
            path={APP_ROUTES.partJourney.slice(1)}
            element={
              <ModuleRoute moduleKey="part_journey">
                <ComponentJourney />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.operatorView.slice(1)}
            element={
              <ModuleRoute moduleKey="operator_view">
                <OperatorView />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.packing.slice(1)}
            element={
              <ModuleRoute moduleKey="packing">
                <Packing />
              </ModuleRoute>
            }
          />
          <Route
            path={APP_ROUTES.packingManagement.slice(1)}
            element={
              <ModuleRoute moduleKey="packing_management">
                <PackingManagement />
              </ModuleRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
