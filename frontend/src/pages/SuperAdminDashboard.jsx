import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Activity,
  Car,
  CheckCircle,
  CircleDollarSign,
  Clock,
  FileText,
  Fuel,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";

import "../Dashboard.css";
import UserManagement from "../components/UserManagement";

const API_URL = "http://localhost:5000";

const roleLabels = {
  FLEET_MANAGER: "Fleet Manager",
  DISPATCHER: "Dispatcher",
  DRIVER: "Driver",
  MAINTENANCE_MANAGER: "Maintenance Manager",
  FINANCE_MANAGER: "Finance Manager",
  VIEWER: "Management / Viewer",
  CUSTOMER: "Customer",
};

const staticVehicles = [
  {
    id: "VH-001",
    number: "AP16 AB 1234",
    type: "Truck",
    status: "ON TRIP",
    driver: "Ravi Kumar",
  },
  {
    id: "VH-002",
    number: "AP07 CD 5678",
    type: "Van",
    status: "AVAILABLE",
    driver: "Priya Sharma",
  },
  {
    id: "VH-003",
    number: "AP16 EF 9012",
    type: "Truck",
    status: "MAINTENANCE",
    driver: "Not Assigned",
  },
  {
    id: "VH-004",
    number: "AP05 GH 3456",
    type: "Mini Truck",
    status: "IDLE",
    driver: "Arun Kumar",
  },
];

const staticTrips = [
  {
    id: "TRP-1001",
    customer: "ABC Logistics",
    pickup: "Guntur",
    destination: "Vijayawada",
    driver: "Ravi Kumar",
    vehicle: "AP16 AB 1234",
    status: "IN PROGRESS",
  },
  {
    id: "TRP-1002",
    customer: "XYZ Industries",
    pickup: "Tenali",
    destination: "Hyderabad",
    driver: "Priya Sharma",
    vehicle: "AP07 CD 5678",
    status: "SCHEDULED",
  },
  {
    id: "TRP-1003",
    customer: "Global Equipments",
    pickup: "Guntur",
    destination: "Amaravati",
    driver: "Arun Kumar",
    vehicle: "AP05 GH 3456",
    status: "COMPLETED",
  },
];

const gpsVehicles = [
  {
    vehicle: "AP16 AB 1234",
    driver: "Ravi Kumar",
    location: "Guntur",
    speed: "54 km/h",
    status: "ON TRIP",
    updated: "1 min ago",
  },
  {
    vehicle: "AP07 CD 5678",
    driver: "Priya Sharma",
    location: "Vijayawada",
    speed: "42 km/h",
    status: "ON TRIP",
    updated: "2 min ago",
  },
  {
    vehicle: "AP05 GH 3456",
    driver: "Arun Kumar",
    location: "Amaravati",
    speed: "0 km/h",
    status: "IDLE",
    updated: "3 min ago",
  },
];

function SuperAdminDashboard() {
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [users, setUsers] = useState([]);

  const [loadingUsers, setLoadingUsers] =
    useState(true);

  const [userError, setUserError] =
    useState("");

  const [selectedRoles, setSelectedRoles] =
    useState({});

  const [updatingUser, setUpdatingUser] =
    useState(null);

  const [statusUpdatingUser, setStatusUpdatingUser] =
    useState(null);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      setUserError("");

      const response = await fetch(
        `${API_URL}/api/admin/users`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load users."
        );
      }

      setUsers(data.users || []);
    } catch (error) {
      console.error(error);

      setUserError(
        error.message || "Unable to load users."
      );
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const stats = useMemo(() => {
    return {
      totalUsers: users.length,
      activeUsers: users.filter(
        (user) => user.isActive
      ).length,

      totalCustomers: users.filter(
        (user) => user.role === "CUSTOMER"
      ).length,

      totalDrivers: users.filter(
        (user) => user.role === "DRIVER"
      ).length,
    };
  }, [users]);

  const assignRole = async (userId) => {
    const role = selectedRoles[userId];

    if (!role) {
      return;
    }

    try {
      setUpdatingUser(userId);

      const response = await fetch(
        `${API_URL}/api/admin/users/${userId}/role`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to assign role."
        );
      }

      setUsers((previousUsers) =>
        previousUsers.map((user) =>
          user._id === userId
            ? {
                ...user,
                role: data.user.role,
              }
            : user
        )
      );

      setSelectedRoles((previous) => ({
        ...previous,
        [userId]: "",
      }));
    } catch (error) {
      alert(
        error.message ||
          "Unable to assign role."
      );
    } finally {
      setUpdatingUser(null);
    }
  };

  const toggleStatus = async (userId) => {
    try {
      setStatusUpdatingUser(userId);

      const response = await fetch(
        `${API_URL}/api/admin/users/${userId}/status`,
        {
          method: "PATCH",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to update account status."
        );
      }

      setUsers((previousUsers) =>
        previousUsers.map((user) =>
          user._id === userId
            ? {
                ...user,
                isActive: data.user.isActive,
              }
            : user
        )
      );
    } catch (error) {
      alert(
        error.message ||
          "Unable to update status."
      );
    } finally {
      setStatusUpdatingUser(null);
    }
  };

  const logout = async () => {
    try {
      await fetch(
        `${API_URL}/api/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );
    } catch (error) {
      console.error(error);
    }

    navigate("/login", {
      replace: true,
    });
  };

  return (
    <div className="dashboard-page">


      <aside
        className={`dashboard-sidebar ${
          sidebarOpen ? "open" : ""
        }`}
      >

        <div className="dashboard-logo">
          <div className="dashboard-logo-icon">
            <Car size={22} />
          </div>

          <span>
            Fleet<span>Flow</span>
          </span>
        </div>

        <nav className="dashboard-nav">

          <button className="nav-item active">
            <LayoutDashboard size={18} />
            Overview
          </button>

          <button className="nav-item">
            <Car size={18} />
            Vehicles
          </button>

          <button className="nav-item">
            <Users size={18} />
            Drivers
          </button>

          <button className="nav-item">
            <Activity size={18} />
            Trips
          </button>

          <button className="nav-item">
            <MapPin size={18} />
            Live Tracking
          </button>

          <button className="nav-item">
            <Fuel size={18} />
            Fuel
          </button>

          <button className="nav-item">
            <Wrench size={18} />
            Maintenance
          </button>

          <button className="nav-item">
            <CircleDollarSign size={18} />
            Expenses
          </button>

          <button className="nav-item">
            <FileText size={18} />
            Reports
          </button>

          <button className="nav-item">
            <Users size={18} />
            User Management
          </button>

          <button className="nav-item">
            <Settings size={18} />
            Settings
          </button>

        </nav>

        <button
          className="logout-button"
          onClick={logout}
        >
          <LogOut size={18} />
          Sign Out
        </button>

      </aside>


      <main className="dashboard-main">

        <header className="dashboard-header">

          <button
            className="mobile-menu-button"
            onClick={() =>
              setSidebarOpen(!sidebarOpen)
            }
          >
            {sidebarOpen ? (
              <X size={22} />
            ) : (
              <Menu size={22} />
            )}
          </button>

          <div>
            <p className="dashboard-eyebrow">
              SUPER ADMIN
            </p>

            <h1>
              Dashboard Overview
            </h1>

            <p className="dashboard-subtitle">
              Complete fleet and platform overview
            </p>
          </div>

          <div className="admin-badge">
            <ShieldCheck size={17} />
            Super Admin
          </div>

        </header>


        <section className="stats-grid">

          <StatCard
            icon={<Users />}
            title="Total Users"
            value={stats.totalUsers}
          />

          <StatCard
            icon={<CheckCircle />}
            title="Active Users"
            value={stats.activeUsers}
          />

          <StatCard
            icon={<Car />}
            title="Total Vehicles"
            value="48"
          />

          <StatCard
            icon={<Users />}
            title="Total Drivers"
            value={stats.totalDrivers}
          />

          <StatCard
            icon={<Activity />}
            title="Active Trips"
            value="12"
          />

          <StatCard
            icon={<Users />}
            title="Customers"
            value={stats.totalCustomers}
          />

        </section>



        <section className="dashboard-two-column">

          <DashboardCard title="Fleet Status Overview">

            <div className="status-list">

              <StatusRow
                label="Available"
                value="21"
              />

              <StatusRow
                label="On Trip"
                value="14"
              />

              <StatusRow
                label="Idle"
                value="8"
              />

              <StatusRow
                label="Maintenance"
                value="5"
              />

            </div>

          </DashboardCard>

          <DashboardCard title="Trip Overview">

            <div className="status-list">

              <StatusRow
                label="Scheduled"
                value="18"
              />

              <StatusRow
                label="In Progress"
                value="12"
              />

              <StatusRow
                label="Completed"
                value="37"
              />

              <StatusRow
                label="Cancelled"
                value="3"
              />

            </div>

          </DashboardCard>

        </section>

        <DashboardCard title="Fleet Vehicles">

          <div className="table-wrapper">

            <table className="dashboard-table">

              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>

                {staticVehicles.map(
                  (vehicle) => (
                    <tr key={vehicle.id}>

                      <td>
                        <strong>
                          {vehicle.number}
                        </strong>
                      </td>

                      <td>
                        {vehicle.type}
                      </td>

                      <td>
                        {vehicle.driver}
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            vehicle.status
                          }
                        />
                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </DashboardCard>


        <DashboardCard
          title="Live Fleet Status"
          icon={<MapPin size={18} />}
        >

          <div className="gps-grid">

            {gpsVehicles.map(
              (vehicle) => (
                <div
                  className="gps-card"
                  key={vehicle.vehicle}
                >

                  <div className="gps-card-header">

                    <div>
                      <strong>
                        {vehicle.vehicle}
                      </strong>

                      <span>
                        {vehicle.driver}
                      </span>
                    </div>

                    <StatusBadge
                      status={
                        vehicle.status
                      }
                    />

                  </div>

                  <div className="gps-info">

                    <div>
                      <MapPin size={16} />
                      {vehicle.location}
                    </div>

                    <div>
                      <Activity size={16} />
                      {vehicle.speed}
                    </div>

                    <div>
                      <Clock size={16} />
                      {vehicle.updated}
                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        </DashboardCard>

        <DashboardCard title="Recent Trips">

          <div className="table-wrapper">

            <table className="dashboard-table">

              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Customer</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>

                {staticTrips.map(
                  (trip) => (
                    <tr key={trip.id}>

                      <td>
                        <strong>
                          {trip.id}
                        </strong>
                      </td>

                      <td>
                        {trip.customer}
                      </td>

                      <td>
                        {trip.pickup} →{" "}
                        {trip.destination}
                      </td>

                      <td>
                        {trip.driver}
                      </td>

                      <td>
                        {trip.vehicle}
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            trip.status
                          }
                        />
                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </DashboardCard>

        <section className="dashboard-two-column">

          <DashboardCard title="Fuel Overview">

            <div className="cost-value">
              ₹1,84,500
            </div>

            <p className="cost-description">
              Total fuel cost this month
            </p>

          </DashboardCard>

          <DashboardCard title="Maintenance Overview">

            <div className="cost-value">
              ₹96,800
            </div>

            <p className="cost-description">
              Total maintenance cost this month
            </p>

          </DashboardCard>

        </section>


        <DashboardCard
          title="User Management & Role Assignment"
          icon={<ShieldCheck size={18} />}
        >

          <div className="user-management-header">

            <div>
              <h3>
                Platform Users
              </h3>

              <p>
                Assign roles and control account access.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={fetchUsers}
            >
              Refresh
            </button>

          </div>

          {loadingUsers && (
            <div className="dashboard-message">
              Loading users...
            </div>
          )}

          {userError && (
            <div className="dashboard-error">
              {userError}
            </div>
          )}

          {!loadingUsers &&
            !userError &&
            users.length === 0 && (
              <div className="dashboard-message">
                No users found.
              </div>
            )}

          {!loadingUsers &&
            !userError &&
            users.length > 0 && (
              <div className="table-wrapper">

                <table className="dashboard-table">

                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Current Role</th>
                      <th>Status</th>
                      <th>Assign Role</th>
                      <th>Access</th>
                    </tr>
                  </thead>

                  <tbody>

                    {users.map((user) => {

                      const isSuperAdmin =
                        user.role ===
                        "SUPER_ADMIN";

                      return (
                        <tr key={user._id}>

                          <td>
                            <strong>
                              {user.fullName}
                            </strong>
                          </td>

                          <td>
                            {user.email}
                          </td>

                          <td>
                            {roleLabels[
                              user.role
                            ] ||
                              user.role}
                          </td>

                          <td>

                            <span
                              className={
                                user.isActive
                                  ? "user-status active"
                                  : "user-status inactive"
                              }
                            >
                              {user.isActive
                                ? "Active"
                                : "Inactive"}
                            </span>

                          </td>

                          <td>

                            {isSuperAdmin ? (
                              <span className="protected-role">
                                <ShieldCheck
                                  size={15}
                                />
                                Protected
                              </span>
                            ) : (
                              <div className="role-control">

                                <select
                                  value={
                                    selectedRoles[
                                      user._id
                                    ] || ""
                                  }
                                  onChange={(event) =>
                                    setSelectedRoles(
                                      (
                                        previous
                                      ) => ({
                                        ...previous,
                                        [user._id]:
                                          event
                                            .target
                                            .value,
                                      })
                                    )
                                  }
                                >

                                  <option value="">
                                    Select role
                                  </option>

                                  {Object.entries(
                                    roleLabels
                                  ).map(
                                    ([
                                      value,
                                      label,
                                    ]) => (
                                      <option
                                        key={
                                          value
                                        }
                                        value={
                                          value
                                        }
                                      >
                                        {label}
                                      </option>
                                    )
                                  )}

                                </select>

                                <button
                                  className="assign-button"
                                  disabled={
                                    !selectedRoles[
                                      user._id
                                    ] ||
                                    updatingUser ===
                                      user._id
                                  }
                                  onClick={() =>
                                    assignRole(
                                      user._id
                                    )
                                  }
                                >
                                  {updatingUser ===
                                  user._id
                                    ? "Saving..."
                                    : "Assign"}
                                </button>

                              </div>
                            )}

                          </td>

                          <td>

                            {isSuperAdmin ? (
                              <span className="protected-role">
                                Protected
                              </span>
                            ) : (
                              <button
                                className={
                                  user.isActive
                                    ? "deactivate-button"
                                    : "activate-button"
                                }
                                disabled={
                                  statusUpdatingUser ===
                                  user._id
                                }
                                onClick={() =>
                                  toggleStatus(
                                    user._id
                                  )
                                }
                              >
                                {statusUpdatingUser ===
                                user._id
                                  ? "Updating..."
                                  : user.isActive
                                  ? "Deactivate"
                                  : "Activate"}
                              </button>
                            )}

                          </td>

                        </tr>
                      );
                    })}

                  </tbody>

                </table>

              </div>
            )}

        </DashboardCard>
        <DashboardCard title="Recent Activities">

          <div className="activity-list">

            <ActivityItem
              text="Trip TRP-1001 started"
              time="10 minutes ago"
            />

            <ActivityItem
              text="Vehicle AP16 EF 9012 marked for maintenance"
              time="32 minutes ago"
            />

            <ActivityItem
              text="New customer trip request received"
              time="1 hour ago"
            />

            <ActivityItem
              text="Fuel expense submitted"
              time="2 hours ago"
            />

            <ActivityItem
              text="Trip TRP-0998 completed"
              time="3 hours ago"
            />

          </div>

        </DashboardCard>

      </main>
    </div>
  );
}
function StatCard({
  icon,
  title,
  value,
}) {
  return (
    <div className="stat-card">

      <div className="stat-icon">
        {icon}
      </div>

      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>

    </div>
  );
}

function DashboardCard({
  title,
  icon,
  children,
}) {
  return (
    <section className="dashboard-card">

      <div className="dashboard-card-header">

        <h2>
          {icon}
          {title}
        </h2>

      </div>

      {children}

    </section>
  );
}

function StatusRow({
  label,
  value,
}) {
  return (
    <div className="status-row">

      <span>{label}</span>

      <strong>{value}</strong>

    </div>
  );
}

function StatusBadge({
  status,
}) {
  const normalized =
    status.toLowerCase().replaceAll(
      " ",
      "-"
    );

  return (
    <span
      className={`status-badge ${normalized}`}
    >
      {status}
    </span>
  );
}

function ActivityItem({
  text,
  time,
}) {
  return (
    <div className="activity-item">

      <div className="activity-dot"></div>

      <div>
        <strong>{text}</strong>
        <span>{time}</span>
      </div>

    </div>
  );
}

export default SuperAdminDashboard;