import { Navigate } from "react-router-dom";
import { getStoredUser } from "../services/api";

export default function ProtectedRoute({ children }) {
  const user = getStoredUser();
  if (!user || !user.role) return <Navigate to="/login" replace />;
  return children;
}
