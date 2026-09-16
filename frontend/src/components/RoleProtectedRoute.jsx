import { Navigate } from "react-router-dom";
import { getStoredUser } from "../services/api";

export default function RoleProtectedRoute({ children, allowedRoles = [] }) {
  const user = getStoredUser();
  if (!user || !user.role) return <Navigate to="/login" replace />;
  const rawRole = String(user.role).trim().toUpperCase();
  const role = rawRole === "DISPATCHER" ? "TRIP_MANAGER" : rawRole;
  if (allowedRoles.length && !allowedRoles.includes(role)) {
    const destination = role === "SUPER_ADMIN" ? "/super-admin" : role === "FLEET_MANAGER" ? "/fleet-manager" : role === "TRIP_MANAGER" ? "/trip-manager" : role === "DRIVER" ? "/driver" : role === "MAINTENANCE_MANAGER" ? "/maintenance" : role === "CUSTOMER" ? "/customer" : "/dashboard";
    return <Navigate to={destination} replace />;
  }
  return children;
}
