import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const VerifyResetOtp = lazy(() => import("./pages/VerifyResetOtp"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
import ProtectedRoute from "./components/ProtectedRoute";
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const SuperAdminSecurity = lazy(() => import("./pages/SuperAdminSecurity"));
const RoleDashboard = lazy(() => import("./pages/RoleDashboard"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage"));
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import ThemeToggle from "./components/ThemeToggle";
import { ThemeProvider } from "./context/ThemeContext";
import "./theme.css";
const FleetManagerDashboard = lazy(() => import("./pages/FleetManagerDashboard"));
const FleetManagerExtras = lazy(() => import("./pages/FleetManagerExtras"));
const VehiclesPage = lazy(() => import("./pages/VehiclesPage"));
const DriversPage = lazy(() => import("./pages/DriversPage"));
const AssignmentsPage = lazy(() => import("./pages/AssignmentsPage"));
const TripsPage = lazy(() => import("./pages/TripsPage"));
const TripRequestsPage = lazy(() => import("./pages/TripRequestsPage"));
const DriverOverview = lazy(() => import("./pages/DriverOverview"));
const DriverVehicle = lazy(() => import("./pages/DriverVehicle"));
const DriverTrips = lazy(() => import("./pages/DriverTrips"));
const DriverTripDetails = lazy(() => import("./pages/DriverTripDetails"));
const DriverLiveFleetMap = lazy(() => import("./pages/DriverLiveFleetMap"));
const DriverHistory = lazy(() => import("./pages/DriverHistory"));
const DriverIssues = lazy(() => import("./pages/DriverIssues"));
const DriverInspections = lazy(() => import("./pages/DriverInspections"));
const ProofOfDelivery = lazy(() => import("./pages/ProofOfDelivery"));
const DriverProfile = lazy(() => import("./pages/DriverProfile"));
const DriverRecords = lazy(() => import("./pages/DriverRecords"));
const MaintenanceManagerDashboard = lazy(() => import("./pages/MaintenanceManagerDashboard"));
const FinanceManagerDashboard = lazy(() => import("./pages/FinanceManagerDashboard"));
const ManagementDashboard = lazy(() => import("./pages/ManagementDashboard"));
const AnalyticsDashboard = lazy(() => import("./pages/AnalyticsDashboard"));
const TripManagerDashboard = lazy(() => import("./pages/TripManagerDashboard"));
const CustomerOverview = lazy(() => import("./pages/CustomerOverview"));
const CustomerTripRequest = lazy(() => import("./pages/CustomerTripRequest"));
const CustomerTrips = lazy(() => import("./pages/CustomerTrips"));
const CustomerTripDetails = lazy(() => import("./pages/CustomerTripDetails"));
const CustomerTracking = lazy(() => import("./pages/CustomerTracking"));
const CustomerHistory = lazy(() => import("./pages/CustomerHistory"));
const CustomerBilling = lazy(() => import("./pages/CustomerBilling"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile"));

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ThemeToggle />
        <Suspense fallback={null}>
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
          path="/forgot-password/verify"
          element={<VerifyResetOtp />}
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
          path="/driver/live-fleet"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverLiveFleetMap />
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
          path="/driver/inspections"
          element={
            <RoleProtectedRoute allowedRoles={["DRIVER"]}>
              <DriverInspections />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/driver/proof-of-delivery"
          element={<RoleProtectedRoute allowedRoles={["DRIVER"]}><ProofOfDelivery mode="driver" /></RoleProtectedRoute>}
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
          path="/customer/delivery-history"
          element={<RoleProtectedRoute allowedRoles={["CUSTOMER"]}><ProofOfDelivery mode="customer" /></RoleProtectedRoute>}
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
          path="/analytics"
          element={
            <RoleProtectedRoute allowedRoles={["SUPER_ADMIN", "VIEWER", "FLEET_MANAGER", "FINANCE_MANAGER", "MAINTENANCE_MANAGER", "TRIP_MANAGER", "DISPATCHER"]}>
              <AnalyticsDashboard />
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
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}
export default App;