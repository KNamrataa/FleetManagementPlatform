import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";

import ProtectedRoute from "./components/ProtectedRoute";

import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminSecurity from "./pages/SuperAdminSecurity";
import RoleDashboard from "./pages/RoleDashboard";
import UserManagementPage from "./pages/UserManagementPage";
import RoleProtectedRoute from "./components/RoleProtectedRoute";

import FleetManagerDashboard from "./pages/FleetManagerDashboard";
import FleetManagerExtras from "./pages/FleetManagerExtras";
import VehiclesPage from "./pages/VehiclesPage";
import DriversPage from "./pages/DriversPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import TripsPage from "./pages/TripsPage";
import TripRequestsPage from "./pages/TripRequestsPage";

import DriverOverview from "./pages/DriverOverview";
import DriverVehicle from "./pages/DriverVehicle";
import DriverTrips from "./pages/DriverTrips";
import DriverTripDetails from "./pages/DriverTripDetails";
import DriverHistory from "./pages/DriverHistory";
import DriverIssues from "./pages/DriverIssues";
import DriverProfile from "./pages/DriverProfile";
import DriverRecords from "./pages/DriverRecords";

import MaintenanceManagerDashboard from "./pages/MaintenanceManagerDashboard";
import FinanceManagerDashboard from "./pages/FinanceManagerDashboard";
import ManagementDashboard from "./pages/ManagementDashboard";
import TripManagerDashboard from "./pages/TripManagerDashboard";

import CustomerOverview from "./pages/CustomerOverview";
import CustomerTripRequest from "./pages/CustomerTripRequest";
import CustomerTrips from "./pages/CustomerTrips";
import CustomerTripDetails from "./pages/CustomerTripDetails";
import CustomerTracking from "./pages/CustomerTracking";
import CustomerHistory from "./pages/CustomerHistory";
import CustomerBilling from "./pages/CustomerBilling";
import CustomerProfile from "./pages/CustomerProfile";

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
          path="/forgot-password"
          element={<ForgotPassword />}
        />

        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />

        <Route
          path="/change-password"
          element={
            <RoleProtectedRoute
              allowedRoles={[
                "SUPER_ADMIN",
                "FLEET_MANAGER",
                "TRIP_MANAGER",
                "DISPATCHER",
                "DRIVER",
                "CUSTOMER",
                "MAINTENANCE_MANAGER",
                "FINANCE_MANAGER",
                "VIEWER",
              ]}
            >
              <ChangePassword />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/super-admin"
          element={
            <RoleProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
              <SuperAdminDashboard />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/super-admin/security"
          element={<RoleProtectedRoute allowedRoles={["SUPER_ADMIN"]}><SuperAdminSecurity /></RoleProtectedRoute>}
        />

        <Route
          path="/super-admin/users"
          element={
            <RoleProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
              <UserManagementPage />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/fleet-manager"
          element={
            <RoleProtectedRoute
              allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}
            >
              <FleetManagerDashboard />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/fleet-manager/trip-requests"
          element={
            <RoleProtectedRoute
              allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}
            >
              <TripRequestsPage />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/fleet-manager/vehicles"
          element={
            <RoleProtectedRoute
              allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}
            >
              <VehiclesPage />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/fleet-manager/drivers"
          element={
            <RoleProtectedRoute
              allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}
            >
              <DriversPage />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/fleet-manager/assignments"
          element={
            <RoleProtectedRoute
              allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}
            >
              <AssignmentsPage />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/fleet-manager/monitoring"
          element={<RoleProtectedRoute allowedRoles={["FLEET_MANAGER","SUPER_ADMIN"]}><FleetManagerExtras /></RoleProtectedRoute>}
        />

        <Route
          path="/fleet-manager/trips"
          element={
            <RoleProtectedRoute
              allowedRoles={["FLEET_MANAGER", "SUPER_ADMIN"]}
            >
              <TripsPage />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/trip-manager/*"
          element={
            <RoleProtectedRoute allowedRoles={["TRIP_MANAGER", "DISPATCHER", "SUPER_ADMIN"]}>
              <TripManagerDashboard />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverOverview />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/vehicle"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverVehicle />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/vehicle/register"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverVehicle />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/trips"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverTrips />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/trips/:id"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverTripDetails />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/history"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverHistory />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/issues"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverIssues />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/records"
          element={<RoleProtectedRoute allowedRoles={["DRIVER"]}><DriverRecords /></RoleProtectedRoute>}
        />

        <Route
          path="/driver/profile"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverProfile />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerOverview />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/trip-request"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerTripRequest />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/trips"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerTrips />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/trips/:id"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerTripDetails />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/tracking"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerTracking />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/tracking/:id"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerTracking />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/history"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerHistory />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/billing"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerBilling />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/customer/profile"
          element={
            <RoleProtectedRoute allowedRoles={["CUSTOMER"]}>
              <CustomerProfile />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/maintenance/*"
          element={
            <RoleProtectedRoute
              allowedRoles={["MAINTENANCE_MANAGER"]}
            >
              <MaintenanceManagerDashboard />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/finance-manager/*"
          element={
            <RoleProtectedRoute
              allowedRoles={["FINANCE_MANAGER"]}
            >
              <FinanceManagerDashboard />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/management"
          element={
            <RoleProtectedRoute
              allowedRoles={["VIEWER", "SUPER_ADMIN"]}
            >
              <ManagementDashboard />
            </RoleProtectedRoute>
          }
        />

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