import { Navigate } from "react-router-dom";
function ProtectedRoute({ children }) {
  const storedUser =
    localStorage.getItem("fleetUser");
  if (!storedUser) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }
  try {
    const user = JSON.parse(storedUser);
    if (!user || !user.role) {
      localStorage.removeItem("fleetUser");
      return (
        <Navigate
          to="/login"
          replace
        />
      );
    }
    return children;
  } catch (error) {
    localStorage.removeItem("fleetUser");

    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }
}
export default ProtectedRoute;