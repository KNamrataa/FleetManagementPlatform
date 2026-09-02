import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import ProtectedRoute from "./components/ProtectedRoute";

import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import RoleDashboard from "./pages/RoleDashboard";
import UserManagementPage from "./pages/UserManagementPage";
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import FleetManagerDashboard from "./pages/FleetManagerDashboard";
import VehiclesPage from "./pages/VehiclesPage";
import DriversPage from "./pages/DriversPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import TripsPage from "./pages/TripsPage";

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/signup"
          element={<Signup />}
        />


  

        <Route
          path="/super-admin"
          element={
            <ProtectedRoute>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/super-admin/users"
          element={
            <ProtectedRoute>
              <UserManagementPage />
            </ProtectedRoute>
          }
        />


        <Route path="/fleet-manager" element={<RoleProtectedRoute allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}><FleetManagerDashboard /></RoleProtectedRoute>} />
        <Route path="/fleet-manager/vehicles" element={<RoleProtectedRoute allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}><VehiclesPage /></RoleProtectedRoute>} />
        <Route path="/fleet-manager/drivers" element={<RoleProtectedRoute allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}><DriversPage /></RoleProtectedRoute>} />
        <Route path="/fleet-manager/assignments" element={<RoleProtectedRoute allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}><AssignmentsPage /></RoleProtectedRoute>} />
        <Route path="/fleet-manager/trips" element={<RoleProtectedRoute allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}><TripsPage /></RoleProtectedRoute>} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <RoleDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

      </Routes>

    </BrowserRouter>
  );
}

export default App;