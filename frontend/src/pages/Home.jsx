import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Fuel,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  Route,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import { useNavigate } from "react-router-dom";

import "../App.css";

function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      try {
        setDashboardLoading(true);
        setDashboardError("");
        const response = await apiRequest("/api/public/dashboard-overview");
        if (!cancelled) setDashboardData(response.data || null);
      } catch (error) {
        if (!cancelled) setDashboardError(error.message || "Unable to load dashboard data.");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };

    loadDashboardData();
    const interval = window.setInterval(loadDashboardData, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const dashboard = dashboardData || {
    vehicles: { total: 0, available: 0, onTrip: 0, maintenance: 0 },
    drivers: { total: 0, available: 0 },
    trips: { active: 0, completedToday: 0, completedTotal: 0, recent: [], activeList: [] },
    finance: { fuelLitresToday: 0, fuelCostMonth: 0, expensesMonth: 0, maintenanceMonth: 0 },
    weeklyActivity: [],
    activityTrend: 0,
    fleetHealth: { operational: 0, total: 0, percent: 0 },
  };

  const performanceMax = useMemo(
    () => Math.max(...dashboard.weeklyActivity.map((item) => Number(item.value || 0)), 1),
    [dashboard.weeklyActivity]
  );

  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });

  const scrollToSection = (id) => {
    const section = document.getElementById(id);

    if (section) {
      section.scrollIntoView({
        behavior: "smooth",
      });
    }
    setMenuOpen(false);
  };

  return (
    <div className="app">

      <header className="navbar">
        <div className="nav-container">

          <div
            className="logo"
            onClick={() => scrollToSection("home")}
          >
            <div className="logo-icon">
              <Truck size={21} />
            </div>

            <span>
              Fleet<span>Flow</span>
            </span>
          </div>

          <nav
            className={`nav-links ${
              menuOpen ? "mobile-open" : ""
            }`}
          >

            <button
              onClick={() => scrollToSection("home")}
            >
              Home
            </button>

            <button
              onClick={() => scrollToSection("features")}
            >
              Features
            </button>

            <button
              onClick={() => scrollToSection("why-us")}
            >
              Why Choose Us
            </button>

            <button
              onClick={() => scrollToSection("contact")}
            >
              Contact Us
            </button>

            <button
              onClick={() => scrollToSection("dashboard")}
            >
              Dashboard
            </button>

            <div className="mobile-nav-buttons">

              <button
                className="mobile-login"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/login");
                }}
              >
                Login
              </button>

              <button
                className="mobile-signup"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/signup");
                }}
              >
                Sign Up
              </button>

            </div>

          </nav>


          <div className="nav-actions">

            <button
              className="login-btn"
              onClick={() => navigate("/login")}
            >
              Login
            </button>

            <button
              className="signup-btn"
              onClick={() => navigate("/signup")}
            >
              Sign Up
              <ArrowRight size={16} />
            </button>

          </div>


          {/* MOBILE MENU */}

          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <X size={24} />
            ) : (
              <Menu size={24} />
            )}
          </button>

        </div>
      </header>

      <section
        className="hero-section"
        id="home"
      >

        <div className="hero-container">

          <div className="hero-content">

            <div className="hero-badge">
              <span></span>
              Fleet Management Platform
            </div>


            <h1>
              Manage Your Entire Fleet.
              <span> All In One Place.</span>
            </h1>


            <p>
              Track vehicles, drivers, trips, fuel,
              maintenance, expenses and live fleet activity
              from one centralized fleet management platform.
            </p>


            <div className="hero-buttons">

              <button
                className="primary-btn"
                onClick={() => navigate("/signup")}
              >
                Get Started
                <ArrowRight size={18} />
              </button>


              <button
                className="secondary-btn"
                onClick={() =>
                  scrollToSection("dashboard")
                }
              >
                Explore Dashboard
                <ChevronRight size={17} />
              </button>

            </div>


            <div className="hero-trust">

              <div>
                <CheckCircle2 size={17} />
                Centralized Fleet Control
              </div>

              <div>
                <CheckCircle2 size={17} />
                Real-Time Visibility
              </div>

              <div>
                <CheckCircle2 size={17} />
                Data-Driven Reports
              </div>

            </div>

          </div>

          <div className="hero-visual">

            <div className="hero-dashboard">

              <div className="hero-dashboard-header">

                <div>
                  <span>Fleet Dashboard</span>

                  <h3>
                    Fleet Overview
                  </h3>
                </div>


                <div className="hero-live">

                  <span></span>

                  Live

                </div>

              </div>
              <div className="hero-dashboard-stats">

                <div className="hero-stat-card">

                  <div className="hero-stat-icon vehicle-icon">
                    <Truck size={19} />
                  </div>

                  <div>

                    <span>
                      Vehicles
                    </span>

                    <strong>
                      {dashboard.vehicles.total}
                    </strong>

                  </div>

                </div>


                <div className="hero-stat-card">

                  <div className="hero-stat-icon driver-icon">
                    <Users size={19} />
                  </div>

                  <div>

                    <span>
                      Drivers
                    </span>

                    <strong>
                      {dashboard.drivers.total}
                    </strong>

                  </div>

                </div>


                <div className="hero-stat-card">

                  <div className="hero-stat-icon trip-icon">
                    <Route size={19} />
                  </div>

                  <div>

                    <span>
                      Active Trips
                    </span>

                    <strong>
                      {dashboard.trips.active}
                    </strong>

                  </div>

                </div>

              </div>


              <div className="hero-dashboard-main">

                <div className="hero-dashboard-panel">

                  <div className="hero-panel-heading">

                    <div>

                      <h4>
                        Fleet Status
                      </h4>

                      <p>
                        Current vehicle status
                      </p>

                    </div>

                    <Activity size={18} />

                  </div>


                  <div className="hero-status-row">

                    <div className="status-dot available"></div>

                    <div>

                      <strong>
                        Available
                      </strong>

                      <span>
                        {dashboard.vehicles.available} Vehicles
                      </span>

                    </div>

                    <b>
                      {dashboard.vehicles.available}
                    </b>

                  </div>


                  <div className="hero-status-row">

                    <div className="status-dot on-trip"></div>

                    <div>

                      <strong>
                        On Trip
                      </strong>

                      <span>
                        {dashboard.vehicles.onTrip} Vehicles
                      </span>

                    </div>

                    <b>
                      {dashboard.vehicles.onTrip}
                    </b>

                  </div>


                  <div className="hero-status-row">

                    <div className="status-dot maintenance"></div>

                    <div>

                      <strong>
                        Maintenance
                      </strong>

                      <span>
                        {dashboard.vehicles.maintenance} Vehicles
                      </span>

                    </div>

                    <b>
                      {dashboard.vehicles.maintenance}
                    </b>

                  </div>

                </div>

                <div className="hero-dashboard-panel">

                  <div className="hero-panel-heading">

                    <div>

                      <h4>
                        Active Trips
                      </h4>

                      <p>
                        Currently running
                      </p>

                    </div>

                    <Route size={18} />

                  </div>


                  {(dashboard.trips.activeList.length ? dashboard.trips.activeList : dashboard.trips.recent.slice(0, 3)).map((trip) => (
                    <div className="hero-trip" key={trip.id}>
                      <div className="hero-trip-icon">
                        <Truck size={16} />
                      </div>
                      <div>
                        <strong>{trip.vehicle}</strong>
                        <span>{trip.route}</span>
                      </div>
                      <small className={trip.status === "SCHEDULED" ? "scheduled-text" : ""}>
                        {trip.status === "IN_PROGRESS" ? "Live" : trip.status.replaceAll("_", " ")}
                      </small>
                    </div>
                  ))}

                </div>

              </div>
              <div className="hero-dashboard-footer">

                <div>
                  <span>
                    Fuel Expenses
                  </span>

                  <strong>
                    {formatCurrency(dashboard.finance.fuelCostMonth)}
                  </strong>

                </div>


                <div>

                  <span>
                    Maintenance
                  </span>

                  <strong>
                    {formatCurrency(dashboard.finance.maintenanceMonth)}
                  </strong>

                </div>


                <div>

                  <span>
                    Completed Today
                  </span>

                  <strong>
                    {dashboard.trips.completedToday}
                  </strong>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      <section className="stats-section">

        <div className="stats-container">

          <div className="stat-item">

            <strong>
              {dashboard.vehicles.total}+
            </strong>

            <span>
              Fleet Vehicles
            </span>

          </div>


          <div className="stat-divider"></div>


          <div className="stat-item">

            <strong>
              {dashboard.drivers.total}+
            </strong>

            <span>
              Active Drivers
            </span>

          </div>


          <div className="stat-divider"></div>


          <div className="stat-item">

            <strong>
              {dashboard.trips.completedTotal}+
            </strong>

            <span>
              Trips Completed
            </span>

          </div>


          <div className="stat-divider"></div>


          <div className="stat-item">

            <strong>
              99.9%
            </strong>

            <span>
              Fleet Visibility
            </span>

          </div>

        </div>

      </section>

      <section
        className="features-section"
        id="features"
      >

        <div className="section-heading">

          <span className="section-tag">
            Features
          </span>

          <h2>
            Everything Your Fleet Needs.
          </h2>

          <p>
            Manage every important part of your fleet operation
            through one centralized platform.
          </p>

        </div>


        <div className="features-grid">

          <FeatureCard
            icon={<Truck />}
            title="Vehicle Management"
            description="Maintain complete vehicle records, availability, documents, status and utilization."
          />

          <FeatureCard
            icon={<Users />}
            title="Driver Management"
            description="Manage driver profiles, assignments, availability, documents and performance."
          />

          <FeatureCard
            icon={<Route />}
            title="Trip Management"
            description="Create, schedule and assign trips to the right drivers and vehicles."
          />

          <FeatureCard
            icon={<MapPin />}
            title="Live GPS Tracking"
            description="Monitor active vehicles and understand fleet movement in real time."
          />

          <FeatureCard
            icon={<Fuel />}
            title="Fuel Management"
            description="Track fuel usage, fuel costs, consumption and vehicle efficiency."
          />

          <FeatureCard
            icon={<Wrench />}
            title="Maintenance"
            description="Schedule servicing, monitor maintenance records and prevent vehicle downtime."
          />

          <FeatureCard
            icon={<Wallet />}
            title="Expense Management"
            description="Track operational expenses and understand where your fleet money is going."
          />

          <FeatureCard
            icon={<BarChart3 />}
            title="Reports & Analytics"
            description="Generate meaningful reports for fleet performance, expenses, trips and operations."
          />

        </div>

      </section>


      <section
        className="why-section"
        id="why-us"
      >

        <div className="why-container">

          <div className="why-content">

            <span className="section-tag">
              Why Choose FleetFlow
            </span>


            <h2>

              One Platform.

              <span>
                Complete Fleet Visibility.
              </span>

            </h2>


            <p>
              FleetFlow brings your fleet operations together so
              your team can make faster decisions, reduce costs
              and keep vehicles operating efficiently.
            </p>


            <div className="why-list">

              <div className="why-item">

                <div className="why-icon">
                  <LayoutDashboard size={20} />
                </div>

                <div>

                  <strong>
                    Centralized Operations
                  </strong>

                  <p>
                    Manage vehicles, drivers, trips, maintenance
                    and expenses from one platform.
                  </p>

                </div>

              </div>


              <div className="why-item">

                <div className="why-icon">
                  <Zap size={20} />
                </div>

                <div>

                  <strong>
                    Faster Decision Making
                  </strong>

                  <p>
                    Get important fleet information quickly
                    through dashboards and reports.
                  </p>

                </div>

              </div>


              <div className="why-item">

                <div className="why-icon">
                  <ShieldCheck size={20} />
                </div>

                <div>

                  <strong>
                    Better Control
                  </strong>

                  <p>
                    Maintain accurate operational records and
                    keep your entire fleet organized.
                  </p>

                </div>

              </div>

            </div>

          </div>


          {/* WHY VISUAL */}

          <div className="why-visual">

            <div className="why-main-card">

              <div className="why-card-header">

                <div>

                  <span>
                    Fleet Efficiency
                  </span>

                  <strong>
                    {dashboard.fleetHealth.percent}%
                  </strong>

                </div>

                <div className="efficiency-badge">
                  {dashboard.activityTrend >= 0 ? "+" : ""}{dashboard.activityTrend}%
                </div>

              </div>


              <div className="efficiency-chart">

                <div className="chart-line"></div>

                {dashboard.weeklyActivity.slice(0, 5).map((item, index) => (
                  <div
                    key={item.date}
                    className={`chart-point point-${["a", "b", "c", "d", "e"][index]}`}
                    title={`${item.label}: ${item.value} trips`}
                    style={{
                      left: `${8 + index * 20}%`,
                      top: `${90 - (Number(item.value || 0) / performanceMax) * 70}%`,
                    }}
                  ></div>
                ))}

              </div>


              <div className="chart-labels">

                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>

              </div>

            </div>


            <div className="small-info-card">

              <div className="small-info-icon">
                <CheckCircle2 size={18} />
              </div>

              <div>

                <strong>
                  Fleet Healthy
                </strong>

                <span>
                  {dashboard.fleetHealth.operational} of {dashboard.fleetHealth.total} vehicles operational
                </span>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          HOW IT WORKS
      ===================================================== */}

      <section
        className="how-section"
        id="how-it-works"
      >

        <div className="section-heading">

          <span className="section-tag">
            Workflow
          </span>

          <h2>
            How FleetFlow Works
          </h2>

          <p>
            Manage your complete fleet operation in a few
            simple steps.
          </p>

        </div>


        <div className="steps-container">

          <Step
            number="01"
            icon={<Truck />}
            title="Add Your Fleet"
            description="Register vehicles, drivers and all important fleet information."
          />

          <div className="step-connector"></div>


          <Step
            number="02"
            icon={<Route />}
            title="Schedule Trips"
            description="Create trips and assign the right vehicle and driver."
          />

          <div className="step-connector"></div>


          <Step
            number="03"
            icon={<MapPin />}
            title="Track Operations"
            description="Monitor vehicle activity and live trip status."
          />

          <div className="step-connector"></div>


          <Step
            number="04"
            icon={<BarChart3 />}
            title="Analyze Reports"
            description="Review fleet performance, costs and operational insights."
          />

        </div>

      </section>

      <section
        className="dashboard-section"
        id="dashboard"
      >

        <div className="section-heading">

          <span className="section-tag">
            Dashboard Overview
          </span>

          <h2>

            Manage Everything From

            <span>
              One Dashboard.
            </span>

          </h2>

        </div>

        {dashboardError && (
          <div className="dashboard-data-message error">
            {dashboardError}
          </div>
        )}

        <div className="main-dashboard">


          <div className="dashboard-main-content">

            <div className="dashboard-header">

              <div>

                <h3>
                  Dashboard Overview
                </h3>

                <p>
                  Monitor your entire fleet in one place.
                </p>

              </div>


              <div className="dashboard-header-actions">

                <button>
                  <Search size={17} />
                </button>


                <button className="notification-button">

                  <Bell size={17} />

                  <span></span>

                </button>


                <div className="dashboard-user">

                  <div className="dashboard-avatar">
                    FM
                  </div>

                  <div>

                    <strong>
                      Fleet Manager
                    </strong>

                    <span>
                      Administrator
                    </span>

                  </div>

                </div>

              </div>

            </div>


            <div className="dashboard-stats">

              <DashboardStat
                icon={<Truck />}
                iconClass="blue"
                title="Total Vehicles"
                value={dashboard.vehicles.total}
                description={dashboardLoading ? "Loading live fleet data..." : `${dashboard.vehicles.available} available now`}
                descriptionClass="success-text"
              />


              <DashboardStat
                icon={<Route />}
                iconClass="purple"
                title="Active Trips"
                value={dashboard.trips.active}
                description={`${dashboard.trips.activeList.length} active trip records`}
                descriptionClass="blue-text"
              />


              <DashboardStat
                icon={<Users />}
                iconClass="green"
                title="Available Drivers"
                value={dashboard.drivers.available}
                description="Ready for assignment"
                descriptionClass="success-text"
              />


              <DashboardStat
                icon={<Wrench />}
                iconClass="orange"
                title="Maintenance"
                value={dashboard.vehicles.maintenance}
                description="Vehicles requiring maintenance"
                descriptionClass="warning-text"
              />

            </div>


            {/* DASHBOARD GRID */}

            <div className="dashboard-grid">

              {/* LIVE FLEET STATUS */}

              <div className="dashboard-card">

                <div className="dashboard-card-header">

                  <div>

                    <h4>
                      Live Fleet Status
                    </h4>

                    <p>
                      Real-time vehicle activity
                    </p>

                  </div>


                  <button>
                    View All
                  </button>

                </div>


                <div className="fleet-map">

                  <div className="map-road map-road-one"></div>

                  <div className="map-road map-road-two"></div>

                  <div className="map-road map-road-three"></div>


                  {dashboard.trips.activeList.slice(0, 4).map((trip, index) => (
                    <div
                      className={`map-marker map-marker-${["one", "two", "three", "four"][index]}`}
                      key={trip.id}
                      title={`${trip.id} · ${trip.route}`}
                    >
                      <Truck size={14} />
                    </div>
                  ))}


                  <div className="map-live-indicator">

                    <span></span>

                    {dashboard.trips.active} Vehicles Active

                  </div>

                </div>

              </div>


              {/* RECENT TRIPS */}

              <div className="dashboard-card">

                <div className="dashboard-card-header">

                  <div>

                    <h4>
                      Recent Trips
                    </h4>

                    <p>
                      Latest trip activity
                    </p>

                  </div>

                </div>


                <div className="trip-list">

                  {dashboard.trips.recent.length ? (
                    dashboard.trips.recent.map((trip) => (
                      <TripItem
                        key={trip.id}
                        id={trip.id}
                        route={trip.route}
                        status={trip.status.replaceAll("_", " ")}
                        statusClass={
                          trip.status === "COMPLETED"
                            ? "completed-status"
                            : trip.status === "SCHEDULED"
                              ? "scheduled-status"
                              : "active-status"
                        }
                      />
                    ))
                  ) : (
                    <div className="dashboard-empty-state">No trip data available yet.</div>
                  )}

                </div>

              </div>

            </div>


            {/* BOTTOM METRICS */}

            <div className="dashboard-bottom-grid">

              {/* FUEL */}

              <div className="dashboard-card metric-card">

                <div className="metric-icon">
                  <Fuel size={19} />
                </div>

                <div>

                  <span>
                    Fuel Consumption
                  </span>

                  <strong>
                    {formatNumber(dashboard.finance.fuelLitresToday)} L
                  </strong>

                  <small>
                    Today's consumption
                  </small>

                </div>

              </div>


              <div className="dashboard-card metric-card">

                <div className="metric-icon expense-icon">
                  <Wallet size={19} />
                </div>

                <div>

                  <span>
                    Monthly Expenses
                  </span>

                  <strong>
                    {formatCurrency(dashboard.finance.expensesMonth)}
                  </strong>

                  <small>
                    Current month from recorded expenses
                  </small>

                </div>

              </div>
              <div className="dashboard-card performance-card">

                <div>

                  <h4>
                    Fleet Performance
                  </h4>

                  <p>
                    Weekly activity
                  </p>

                </div>


                <div className="performance-bars">

                  {dashboard.weeklyActivity.map((item) => (
                    <span
                      key={item.date}
                      title={`${item.label}: ${item.value} trips`}
                      style={{ height: `${Math.max((Number(item.value || 0) / performanceMax) * 100, 8)}%` }}
                    ></span>
                  ))}

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>
      <section
        className="contact-section"
        id="contact"
      >

        <div className="contact-container">

          <div className="contact-content">

            <span className="section-tag">
              CONTACT US
            </span>


            <h2>
              Let's <span>Connect</span>
            </h2>


            <p>
              Have questions about FleetFlow? Our team is here
              to help you manage your fleet more efficiently.
            </p>


            <div className="contact-info">

              <div className="contact-info-item">

                <div className="contact-info-icon">
                  <Mail size={18} />
                </div>

                <div>

                  <strong>
                    Email
                  </strong>

                  <span>
                    info@shnoor.com
                  </span>

                </div>

              </div>


              <div className="contact-info-item">

                <div className="contact-info-icon">
                  <MapPin size={18} />
                </div>

                <div>

                  <strong>
                    Location
                  </strong>

                  <span>
                    10009 Mount Tabor Road, Odessa Missouri,
                    United States.
                  </span>

                </div>

              </div>

            </div>

          </div>


          <div className="contact-form-card">

            <div className="contact-form-header">

              <h3>
                Send us a message
              </h3>

              <p>
                Fill out the form and our team will get back to you.
              </p>

            </div>


            <form className="contact-form">

              <div className="contact-form-row">

                <div className="contact-field">

                  <label>
                    Name
                  </label>

                  <input
                    type="text"
                    placeholder="Your name"
                  />

                </div>


                <div className="contact-field">

                  <label>
                    Email
                  </label>

                  <input
                    type="email"
                    placeholder="Your email"
                  />

                </div>

              </div>


              <div className="contact-field">

                <label>
                  Subject
                </label>

                <input
                  type="text"
                  placeholder="How can we help?"
                />

              </div>


              <div className="contact-field">

                <label>
                  Message
                </label>

                <textarea
                  placeholder="Write your message..."
                ></textarea>

              </div>


              <button
                type="submit"
                className="contact-submit"
              >
                Send Message
                <ArrowRight size={15} />
              </button>

            </form>

          </div>

        </div>

      </section>
      <section className="cta-section">

        <div className="cta-container">

          <div>

            <span className="section-tag">
              Get Started Today
            </span>

            <h2>
              Ready to Take Control of Your Fleet?
            </h2>

            <p>
              Monitor every vehicle and optimize your fleet
              operations
            </p>

          </div>
          <button
            className="cta-button"
            onClick={() => navigate("/signup")}
          >
            Create Your Account
            <ArrowRight size={18} />
          </button>

        </div>

      </section>
      <footer className="footer">

        <div className="footer-container">

          {/* FOOTER BRAND */}

          <div className="footer-brand">

            <div
              className="logo"
              onClick={() => scrollToSection("home")}
            >

              <div className="logo-icon">
                <Truck size={20} />
              </div>

              <span>
                Fleet<span>Flow</span>
              </span>

            </div>


            <p>
              A centralized fleet management platform
              designed to simplify modern fleet operations.
            </p>

          </div>

          <div className="footer-column">

            <h4>
              Platform
            </h4>


            <button
              onClick={() => scrollToSection("features")}
            >
              Features
            </button>


            <button
              onClick={() => scrollToSection("dashboard")}
            >
              Dashboard
            </button>


            <button
              onClick={() =>
                scrollToSection("how-it-works")
              }
            >
              How It Works
            </button>

          </div>
          <div className="footer-column">

            <h4>
              Company
            </h4>


            <button
              onClick={() => scrollToSection("why-us")}
            >
              Why Choose Us
            </button>


            <button>
              About
            </button>


            <button
              onClick={() => scrollToSection("contact")}
            >
              Contact
            </button>

          </div>
          <div className="footer-column">

            <h4>
              Account
            </h4>


            <button
              onClick={() => navigate("/login")}
            >
              Login
            </button>


            <button
              onClick={() => navigate("/signup")}
            >
              Sign Up
            </button>

          </div>

        </div>


        <div className="footer-bottom">

          <span>
            © 2026 FleetFlow. All rights reserved.
          </span>

          <span>
            Fleet Management Platform
          </span>

        </div>

      </footer>

    </div>
  );
}
function FeatureCard({
  icon,
  title,
  description,
}) {
  return (
    <div className="feature-card">

      <div className="feature-icon">
        {icon}
      </div>


      <h3>
        {title}
      </h3>


      <p>
        {description}
      </p>


      <div className="feature-arrow">
        <ArrowRight size={16} />
      </div>

    </div>
  );
}
function Step({
  number,
  icon,
  title,
  description,
}) {
  return (
    <div className="step">

      <div className="step-number">
        {number}
      </div>


      <div className="step-icon">
        {icon}
      </div>


      <h3>
        {title}
      </h3>


      <p>
        {description}
      </p>

    </div>
  );
}
function DashboardStat({
  icon,
  iconClass,
  title,
  value,
  description,
  descriptionClass,
}) {
  return (
    <div className="dashboard-stat-card">

      <div className={`stat-icon ${iconClass}`}>
        {icon}
      </div>


      <div>

        <span>
          {title}
        </span>


        <strong>
          {value}
        </strong>


        <small className={descriptionClass}>
          {description}
        </small>

      </div>

    </div>
  );
}
function TripItem({
  id,
  route,
  status,
  statusClass,
}) {
  return (
    <div className="dashboard-trip">

      <div className="trip-icon">
        <Route size={15} />
      </div>
      <div className="trip-info">

        <strong>
          {id}
        </strong>


        <span>
          {route}
        </span>

      </div>


      <span
        className={`trip-status ${statusClass}`}
      >
        {status}
      </span>

    </div>
  );
}


export default Home;