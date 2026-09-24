import { Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const { pathname } = useLocation();

  const dashboardPrefixes = [
    "/super-admin",
    "/fleet-manager",
    "/trip-manager",
    "/driver",
    "/maintenance",
    "/finance",
    "/management",
    "/customer",
    "/role-dashboard",
  ];

  const isDashboard = dashboardPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isHome = pathname === "/";

  return (
    <button
      type="button"
      className={`fleetflow-theme-toggle ${
        isDashboard
          ? "fleetflow-theme-toggle--dashboard"
          : isHome
            ? "fleetflow-theme-toggle--home"
            : "fleetflow-theme-toggle--auth"
      }`}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <Sun size={17} strokeWidth={2.2} />
      ) : (
        <Moon size={17} strokeWidth={2.2} />
      )}
    </button>
  );
}