import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
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
  Package,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";

import {
  Navigate,
  useNavigate,
} from "react-router-dom";

import { useState } from "react";

import "./RoleDashboard.css";
import RealFleetManagerDashboard from "./FleetManagerDashboard";

const API_URL =
  "http://localhost:5000";


function RoleDashboard() {
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] =
    useState(false);



  const storedUser =
    localStorage.getItem(
      "fleetUser"
    );

  let user = null;

  try {
    user = storedUser
      ? JSON.parse(storedUser)
      : null;
  } catch (error) {
    console.error(
      "Invalid fleetUser:",
      error
    );

    user = null;
  }

  if (!user || !user.role) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  const normalizedRole =
    user.role
      .toString()
      .trim()
      .toUpperCase()
      .replace(
        /[\s-]+/g,
        "_"
      );

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
      console.error(
        "Logout error:",
        error
      );
    }

    localStorage.removeItem(
      "fleetUser"
    );

    navigate("/login", {
      replace: true,
    });
  };

  const dashboardProps = {
    user,
    sidebarOpen,
    setSidebarOpen,
    logout,
  };


  switch (normalizedRole) {
    case "SUPER_ADMIN":

      return (
        <Navigate
          to="/super-admin"
          replace
        />
      );


    case "FLEET_MANAGER":

      return <RealFleetManagerDashboard />;


    case "DISPATCHER":

      return (
        <DispatcherDashboard
          {...dashboardProps}
        />
      );


    case "DRIVER":

      return (
        <DriverDashboard
          {...dashboardProps}
        />
      );


    case "MAINTENANCE_MANAGER":

      return (
        <MaintenanceDashboard
          {...dashboardProps}
        />
      );


    case "FINANCE_MANAGER":

      return (
        <FinanceDashboard
          {...dashboardProps}
        />
      );

    case "VIEWER":

      return (
        <ViewerDashboard
          {...dashboardProps}
        />
      );

    case "CUSTOMER":

      return (
        <CustomerDashboard
          {...dashboardProps}
        />
      );


    default:

      return (
        <UnknownRoleDashboard
          user={user}
          logout={logout}
        />
      );
  }
}

function DispatcherDashboard({
  user,
  sidebarOpen,
  setSidebarOpen,
  logout,
}) {
  return (
    <DashboardLayout
      title="Dispatcher Dashboard"
      subtitle="Manage trip requests and assignments"
      role="DISPATCHER"
      user={user}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      logout={logout}
      navigation={[
        ["Overview", LayoutDashboard],
        ["Trip Requests", FileText],
        ["Trips", Activity],
        ["Drivers", Users],
        ["Vehicles", Car],
        ["Live Tracking", MapPin],
      ]}
    >

      <section className="role-stats">

        <MetricCard
          icon={<FileText />}
          title="Pending Requests"
          value="8"
        />

        <MetricCard
          icon={<Clock />}
          title="Unassigned Trips"
          value="5"
        />

        <MetricCard
          icon={<Activity />}
          title="Today's Trips"
          value="18"
        />

        <MetricCard
          icon={<Truck />}
          title="Scheduled Trips"
          value="12"
        />

        <MetricCard
          icon={<MapPin />}
          title="Active Trips"
          value="7"
        />

        <MetricCard
          icon={<CheckCircle />}
          title="Completed"
          value="24"
        />

      </section>


      <DashboardSection
        title="Pending Trip Requests"
      >

        <SimpleTable
          headers={[
            "Request",
            "Customer",
            "Pickup",
            "Destination",
            "Requested",
            "Action",
          ]}
          rows={[
            [
              "REQ-1001",
              "ABC Logistics",
              "Guntur",
              "Vijayawada",
              "10:30 AM",
              "Assign",
            ],
            [
              "REQ-1002",
              "XYZ Industries",
              "Tenali",
              "Hyderabad",
              "12:00 PM",
              "Assign",
            ],
            [
              "REQ-1003",
              "Global Equipments",
              "Guntur",
              "Amaravati",
              "2:00 PM",
              "Assign",
            ],
          ]}
        />

      </DashboardSection>


      <TwoColumn>

        <DashboardSection
          title="Available Drivers"
        >

          <StatusLine
            label="Ravi Kumar"
            value="Available"
          />

          <StatusLine
            label="Priya Sharma"
            value="Available"
          />

          <StatusLine
            label="Arun Kumar"
            value="Available"
          />

        </DashboardSection>


        <DashboardSection
          title="Available Vehicles"
        >

          <StatusLine
            label="AP16 AB 1234"
            value="Available"
          />

          <StatusLine
            label="AP07 CD 5678"
            value="Available"
          />

          <StatusLine
            label="AP05 GH 3456"
            value="Available"
          />

        </DashboardSection>

      </TwoColumn>

    </DashboardLayout>
  );
}

function DriverDashboard({
  user,
  sidebarOpen,
  setSidebarOpen,
  logout,
}) {
  return (
    <DashboardLayout
      title="Driver Dashboard"
      subtitle="Manage your assigned trips"
      role="DRIVER"
      user={user}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      logout={logout}
      navigation={[
        ["Overview", LayoutDashboard],
        ["My Trips", Activity],
        ["Live Tracking", MapPin],
        ["Expenses", CircleDollarSign],
        ["Vehicle", Truck],
        ["Notifications", Bell],
      ]}
    >

      <section className="role-stats">

        <MetricCard
          icon={<Activity />}
          title="Today's Trips"
          value="3"
        />

        <MetricCard
          icon={<MapPin />}
          title="Current Trip"
          value="TRP-1001"
        />

        <MetricCard
          icon={<Truck />}
          title="Assigned Vehicle"
          value="AP16 AB 1234"
        />

        <MetricCard
          icon={<Clock />}
          title="Upcoming Trips"
          value="2"
        />

      </section>


      <DashboardSection
        title="Current Trip"
      >

        <div className="current-trip">

          <div>
            <span>Trip ID</span>
            <strong>
              TRP-1001
            </strong>
          </div>

          <div>
            <span>Customer</span>
            <strong>
              ABC Logistics
            </strong>
          </div>

          <div>
            <span>Route</span>
            <strong>
              Guntur → Vijayawada
            </strong>
          </div>

          <div>
            <span>Vehicle</span>
            <strong>
              AP16 AB 1234
            </strong>
          </div>

          <div>
            <span>Status</span>
            <strong className="success-text">
              IN PROGRESS
            </strong>
          </div>

        </div>


        <div className="driver-actions">

          <button className="primary-action">
            <MapPin size={17} />
            Update Location
          </button>

          <button className="secondary-action">
            Pause Trip
          </button>

          <button className="success-action">
            Complete Trip
          </button>

        </div>

      </DashboardSection>


      <DashboardSection
        title="Upcoming Trips"
      >

        <SimpleTable
          headers={[
            "Trip ID",
            "Customer",
            "Route",
            "Time",
            "Status",
          ]}
          rows={[
            [
              "TRP-1002",
              "XYZ Industries",
              "Tenali → Hyderabad",
              "2:00 PM",
              "Scheduled",
            ],
            [
              "TRP-1003",
              "Global Equipments",
              "Guntur → Amaravati",
              "5:00 PM",
              "Scheduled",
            ],
          ]}
        />

      </DashboardSection>


      <DashboardSection
        title="Quick Actions"
      >

        <div className="quick-actions">

          <QuickAction
            icon={<Fuel />}
            title="Submit Fuel Expense"
          />

          <QuickAction
            icon={<CircleDollarSign />}
            title="Submit Trip Expense"
          />

          <QuickAction
            icon={<AlertTriangle />}
            title="Report Vehicle Issue"
          />

        </div>

      </DashboardSection>

    </DashboardLayout>
  );
}

function MaintenanceDashboard({
  user,
  sidebarOpen,
  setSidebarOpen,
  logout,
}) {
  return (
    <DashboardLayout
      title="Maintenance Dashboard"
      subtitle="Monitor vehicle servicing and maintenance"
      role="MAINTENANCE MANAGER"
      user={user}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      logout={logout}
      navigation={[
        ["Overview", LayoutDashboard],
        ["Maintenance", Wrench],
        ["Service Schedule", Clock],
        ["Vehicles", Car],
        ["Maintenance History", FileText],
      ]}
    >

      <section className="role-stats">

        <MetricCard
          icon={<CheckCircle />}
          title="Operational Vehicles"
          value="39"
        />

        <MetricCard
          icon={<Clock />}
          title="Service Due Soon"
          value="6"
        />

        <MetricCard
          icon={<AlertTriangle />}
          title="Maintenance Required"
          value="4"
        />

        <MetricCard
          icon={<Wrench />}
          title="Under Maintenance"
          value="5"
        />

        <MetricCard
          icon={<AlertTriangle />}
          title="Overdue"
          value="2"
        />

      </section>


      <DashboardSection
        title="Maintenance Schedule"
      >

        <SimpleTable
          headers={[
            "Vehicle",
            "Maintenance",
            "Technician",
            "Date",
            "Status",
          ]}
          rows={[
            [
              "AP16 EF 9012",
              "Brake Service",
              "Ramesh",
              "01 Sep 2026",
              "Scheduled",
            ],
            [
              "AP07 XY 7788",
              "Oil Change",
              "Suresh",
              "02 Sep 2026",
              "Scheduled",
            ],
            [
              "AP05 LM 3456",
              "Engine Repair",
              "Kiran",
              "03 Sep 2026",
              "In Progress",
            ],
          ]}
        />

      </DashboardSection>


      <TwoColumn>

        <DashboardSection
          title="Maintenance Cost"
        >

          <div className="large-value">
            ₹96,800
          </div>

          <p className="muted">
            Total maintenance cost this month
          </p>

        </DashboardSection>


        <DashboardSection
          title="Upcoming Service"
        >

          <StatusLine
            label="This Week"
            value="6 vehicles"
          />

          <StatusLine
            label="Next Week"
            value="9 vehicles"
          />

          <StatusLine
            label="This Month"
            value="18 vehicles"
          />

        </DashboardSection>

      </TwoColumn>

    </DashboardLayout>
  );
}


function FinanceDashboard({
  user,
  sidebarOpen,
  setSidebarOpen,
  logout,
}) {
  return (
    <DashboardLayout
      title="Finance Dashboard"
      subtitle="Manage fleet expenses, fuel and billing"
      role="FINANCE MANAGER"
      user={user}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      logout={logout}
      navigation={[
        ["Overview", LayoutDashboard],
        ["Expenses", CircleDollarSign],
        ["Fuel", Fuel],
        ["Invoices", FileText],
        ["Payments", Package],
        ["Reports", BarChart3],
      ]}
    >

      <section className="role-stats">

        <MetricCard
          icon={<CircleDollarSign />}
          title="Total Expenses"
          value="₹3,42,500"
        />

        <MetricCard
          icon={<Fuel />}
          title="Fuel Expenses"
          value="₹1,84,500"
        />

        <MetricCard
          icon={<Wrench />}
          title="Maintenance"
          value="₹96,800"
        />

        <MetricCard
          icon={<Clock />}
          title="Pending Expenses"
          value="14"
        />

        <MetricCard
          icon={<CheckCircle />}
          title="Approved Expenses"
          value="86"
        />

        <MetricCard
          icon={<FileText />}
          title="Total Billing"
          value="₹8,45,000"
        />

      </section>


      <DashboardSection
        title="Expense Review"
      >

        <SimpleTable
          headers={[
            "Expense ID",
            "Vehicle",
            "Category",
            "Amount",
            "Status",
          ]}
          rows={[
            [
              "EXP-1001",
              "AP16 AB 1234",
              "Fuel",
              "₹8,500",
              "Pending",
            ],
            [
              "EXP-1002",
              "AP07 CD 5678",
              "Maintenance",
              "₹15,000",
              "Approved",
            ],
            [
              "EXP-1003",
              "AP05 GH 3456",
              "Toll",
              "₹2,500",
              "Pending",
            ],
          ]}
        />

      </DashboardSection>


      <TwoColumn>

        <DashboardSection
          title="Financial Summary"
        >

          <StatusLine
            label="Fuel"
            value="₹1,84,500"
          />

          <StatusLine
            label="Maintenance"
            value="₹96,800"
          />

          <StatusLine
            label="Trip Expenses"
            value="₹42,300"
          />

          <StatusLine
            label="Other"
            value="₹18,900"
          />

        </DashboardSection>


        <DashboardSection
          title="Payments"
        >

          <StatusLine
            label="Paid"
            value="₹6,80,000"
          />

          <StatusLine
            label="Pending"
            value="₹1,65,000"
          />

        </DashboardSection>

      </TwoColumn>

    </DashboardLayout>
  );
}

function ViewerDashboard({
  user,
  sidebarOpen,
  setSidebarOpen,
  logout,
}) {
  return (
    <DashboardLayout
      title="Management Dashboard"
      subtitle="Fleet performance and business overview"
      role="MANAGEMENT / VIEWER"
      user={user}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      logout={logout}
      navigation={[
        ["Overview", LayoutDashboard],
        ["Fleet", Car],
        ["Trips", Activity],
        ["Financial Reports", BarChart3],
        ["Reports", FileText],
      ]}
    >

      <section className="role-stats">

        <MetricCard
          icon={<Car />}
          title="Total Vehicles"
          value="48"
        />

        <MetricCard
          icon={<Users />}
          title="Total Drivers"
          value="32"
        />

        <MetricCard
          icon={<Activity />}
          title="Active Trips"
          value="12"
        />

        <MetricCard
          icon={<CheckCircle />}
          title="Completed Trips"
          value="37"
        />

        <MetricCard
          icon={<CircleDollarSign />}
          title="Total Expenses"
          value="₹3,42,500"
        />

        <MetricCard
          icon={<Users />}
          title="Customers"
          value="64"
        />

      </section>


      <TwoColumn>

        <DashboardSection
          title="Fleet Performance"
        >

          <StatusLine
            label="Available Vehicles"
            value="21"
          />

          <StatusLine
            label="Vehicles On Trip"
            value="14"
          />

          <StatusLine
            label="Maintenance"
            value="5"
          />

          <StatusLine
            label="Idle"
            value="8"
          />

        </DashboardSection>


        <DashboardSection
          title="Trip Performance"
        >

          <StatusLine
            label="Scheduled"
            value="18"
          />

          <StatusLine
            label="In Progress"
            value="12"
          />

          <StatusLine
            label="Completed"
            value="37"
          />

          <StatusLine
            label="Cancelled"
            value="3"
          />

        </DashboardSection>

      </TwoColumn>


      <DashboardSection
        title="Recent Business Activity"
      >

        <ActivityRow
          text="Trip TRP-1001 completed"
          time="10 minutes ago"
        />

        <ActivityRow
          text="Vehicle AP16 EF 9012 sent for maintenance"
          time="32 minutes ago"
        />

        <ActivityRow
          text="New customer trip request"
          time="1 hour ago"
        />

        <ActivityRow
          text="Fuel expense approved"
          time="2 hours ago"
        />

      </DashboardSection>

    </DashboardLayout>
  );
}


// =====================================================
// CUSTOMER DASHBOARD
// =====================================================

function CustomerDashboard({
  user,
  sidebarOpen,
  setSidebarOpen,
  logout,
}) {
  return (
    <DashboardLayout
      title="Customer Dashboard"
      subtitle="Request and track your transportation services"
      role="CUSTOMER"
      user={user}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      logout={logout}
      navigation={[
        ["Overview", LayoutDashboard],
        ["Request Trip", Truck],
        ["My Trips", Activity],
        ["Live Tracking", MapPin],
        ["Invoices", FileText],
      ]}
    >

      <section className="role-stats">

        <MetricCard
          icon={<FileText />}
          title="Trip Requests"
          value="4"
        />

        <MetricCard
          icon={<Clock />}
          title="Scheduled Trips"
          value="2"
        />

        <MetricCard
          icon={<Activity />}
          title="Active Trips"
          value="1"
        />

        <MetricCard
          icon={<CheckCircle />}
          title="Completed Trips"
          value="12"
        />

        <MetricCard
          icon={<FileText />}
          title="Pending Invoices"
          value="2"
        />

      </section>


      <DashboardSection
        title="Current Trip"
      >

        <div className="current-trip">

          <div>
            <span>Trip ID</span>
            <strong>
              TRP-1001
            </strong>
          </div>

          <div>
            <span>Route</span>
            <strong>
              Guntur → Vijayawada
            </strong>
          </div>

          <div>
            <span>Driver</span>
            <strong>
              Ravi Kumar
            </strong>
          </div>

          <div>
            <span>Vehicle</span>
            <strong>
              AP16 AB 1234
            </strong>
          </div>

          <div>
            <span>Status</span>
            <strong className="success-text">
              IN PROGRESS
            </strong>
          </div>

        </div>

      </DashboardSection>


      <DashboardSection
        title="My Recent Trips"
      >

        <SimpleTable
          headers={[
            "Trip ID",
            "Route",
            "Driver",
            "Vehicle",
            "Status",
          ]}
          rows={[
            [
              "TRP-1001",
              "Guntur → Vijayawada",
              "Ravi Kumar",
              "AP16 AB 1234",
              "In Progress",
            ],
            [
              "TRP-0998",
              "Guntur → Hyderabad",
              "Priya Sharma",
              "AP07 CD 5678",
              "Completed",
            ],
            [
              "TRP-0992",
              "Guntur → Amaravati",
              "Arun Kumar",
              "AP05 GH 3456",
              "Completed",
            ],
          ]}
        />

      </DashboardSection>


      <DashboardSection
        title="Quick Actions"
      >

        <div className="quick-actions">

          <QuickAction
            icon={<Truck />}
            title="Request New Trip"
          />

          <QuickAction
            icon={<MapPin />}
            title="Track Active Trip"
          />

          <QuickAction
            icon={<FileText />}
            title="View Invoices"
          />

        </div>

      </DashboardSection>

    </DashboardLayout>
  );
}

function DashboardLayout({
  title,
  subtitle,
  role,
  user,
  sidebarOpen,
  setSidebarOpen,
  logout,
  navigation,
  children,
}) {
  return (
    <div className="role-dashboard">

      {/* =============================================
          SIDEBAR
      ============================================= */}

      <aside
        className={`role-sidebar ${
          sidebarOpen
            ? "open"
            : ""
        }`}
      >

        {/* LOGO */}

        <div className="role-logo">

          <div className="role-logo-icon">
            <Car size={22} />
          </div>

          <span>
            Fleet
            <span>Flow</span>
          </span>

        </div>


        {/* USER */}

        <div className="role-user">

          <div className="role-avatar">

            {user.fullName
              ? user.fullName
                  .charAt(0)
                  .toUpperCase()
              : "U"}

          </div>

          <div>

            <strong>
              {user.fullName ||
                "User"}
            </strong>

            <span>
              {role}
            </span>

          </div>

        </div>


        <nav className="role-nav">

          {navigation.map(
            ([label, Icon]) => (
              <button
                key={label}
                type="button"
                className={
                  label ===
                  "Overview"
                    ? "role-nav-item active"
                    : "role-nav-item"
                }
              >

                <Icon size={18} />

                {label}

              </button>
            )
          )}

        </nav>


        <button
          className="role-logout"
          onClick={logout}
        >

          <LogOut size={18} />

          Sign Out

        </button>

      </aside>

      <main className="role-main">

        {/* HEADER */}

        <header className="role-header">

          <button
            className="role-mobile-menu"
            onClick={() =>
              setSidebarOpen(
                !sidebarOpen
              )
            }
          >

            {sidebarOpen ? (
              <X size={22} />
            ) : (
              <Menu size={22} />
            )}

          </button>


          <div>

            <p className="role-eyebrow">
              {role}
            </p>

            <h1>
              {title}
            </h1>

            <p>
              {subtitle}
            </p>

          </div>


          <div className="role-header-user">

            <Bell size={19} />

            <span>
              {user.fullName}
            </span>

          </div>

        </header>


        {/* CONTENT */}

        <div className="role-content">
          {children}
        </div>

      </main>

    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
}) {
  return (
    <div className="metric-card">

      <div className="metric-icon">
        {icon}
      </div>

      <div>

        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

      </div>

    </div>
  );
}
function DashboardSection({
  title,
  children,
}) {
  return (
    <section className="role-section">

      <div className="role-section-header">

        <h2>
          {title}
        </h2>

      </div>

      {children}

    </section>
  );
}
function TwoColumn({
  children,
}) {
  return (
    <div className="role-two-column">
      {children}
    </div>
  );
}

function StatusLine({
  label,
  value,
}) {
  return (
    <div className="status-line">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


function SimpleTable({
  headers,
  rows,
}) {
  return (
    <div className="role-table-wrapper">

      <table className="role-table">

        <thead>

          <tr>

            {headers.map(
              (header) => (
                <th key={header}>
                  {header}
                </th>
              )
            )}

          </tr>

        </thead>


        <tbody>

          {rows.map(
            (row, index) => (

              <tr key={index}>

                {row.map(
                  (cell, cellIndex) => (

                    <td
                      key={
                        cellIndex
                      }
                    >
                      {cell}
                    </td>

                  )
                )}

              </tr>

            )
          )}

        </tbody>

      </table>

    </div>
  );
}

function ActivityRow({
  text,
  time,
}) {
  return (
    <div className="activity-row">

      <div className="activity-dot"></div>

      <div>

        <strong>
          {text}
        </strong>

        <span>
          {time}
        </span>

      </div>

    </div>
  );
}

function QuickAction({
  icon,
  title,
}) {
  return (
    <button
      className="quick-action"
      type="button"
    >

      <div>
        {icon}
      </div>

      <span>
        {title}
      </span>

    </button>
  );
}


function UnknownRoleDashboard({
  user,
  logout,
}) {
  return (
    <div className="role-error-page">

      <ShieldCheck size={50} />

      <h1>
        Unknown User Role
      </h1>

      <p>
        Your account role is:
        <strong>
          {" "}
          {user.role}
        </strong>
      </p>

      <p>
        Please contact the Super Admin.
      </p>

      <button
        onClick={logout}
      >
        Sign Out
      </button>

    </div>
  );
}

export default RoleDashboard;