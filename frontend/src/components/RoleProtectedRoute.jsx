import { Navigate } from "react-router-dom";
import { getStoredUser } from "../services/api";

export default function RoleProtectedRoute({ children, allowedRoles = [] }) {
  const user = getStoredUser();
  if (!user || !user.role) return <Navigate to="/login" replace />;
  const role = String(user.role).trim().toUpperCase();
  if (allowedRoles.length && !allowedRoles.includes(role)) {
    const destination = role === "SUPER_ADMIN" ? "/super-admin" : role === "FLEET_MANAGER" ? "/fleet-manager" : role === "DRIVER" ? "/driver" : "/dashboard";
    return <Navigate to={destination} replace />;
  }
  return children;
}
