import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Fuel,
  LayoutDashboard,
  MapPin,
  Menu,
  Mail,
  Navigation,
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "../App.css";

function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = useNavigate();

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

      {/* ================= NAVBAR ================= */}

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


      {/* ================= HERO ================= */}

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


          {/* HERO DASHBOARD */}

          <div className="hero-visual">

            <div className="hero-dashboard">

              <div className="hero-dashboard-header">

                <div>
                  <span>Fleet Dashboard</span>
                  <h3>Fleet Overview</h3>
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
                    <span>Vehicles</span>
                    <strong>48</strong>
                  </div>

                </div>


                <div className="hero-stat-card">

                  <div className="hero-stat-icon driver-icon">
                    <Users size={19} />
                  </div>

                  <div>
                    <span>Drivers</span>
                    <strong>120</strong>
                  </div>

                </div>


                <div className="hero-stat-card">

                  <div className="hero-stat-icon trip-icon">
                    <Route size={19} />
                  </div>

                  <div>
                    <span>Active Trips</span>
                    <strong>24</strong>
                  </div>

                </div>

              </div>


              <div className="hero-dashboard-main">

                <div className="hero-dashboard-panel">

                  <div className="hero-panel-heading">

                    <div>
                      <h4>Fleet Status</h4>
                      <p>Current vehicle status</p>
                    </div>

                    <Activity size={18} />

                  </div>


                  <div className="hero-status-row">

                    <div className="status-dot available"></div>

                    <div>
                      <strong>Available</strong>
                      <span>19 Vehicles</span>
                    </div>

                    <b>19</b>

                  </div>


                  <div className="hero-status-row">

                    <div className="status-dot on-trip"></div>

                    <div>
                      <strong>On Trip</strong>
                      <span>24 Vehicles</span>
                    </div>

                    <b>24</b>

                  </div>


                  <div className="hero-status-row">

                    <div className="status-dot maintenance"></div>

                    <div>
                      <strong>Maintenance</strong>
                      <span>5 Vehicles</span>
                    </div>

                    <b>5</b>

                  </div>

                </div>


                <div className="hero-dashboard-panel">

                  <div className="hero-panel-heading">

                    <div>
                      <h4>Active Trips</h4>
                      <p>Currently running</p>
                    </div>

                    <Route size={18} />

                  </div>


                  <div className="hero-trip">

                    <div className="hero-trip-icon">
                      <Truck size={16} />
                    </div>

                    <div>
                      <strong>VH-1024</strong>
                      <span>Guntur → Vijayawada</span>
                    </div>

                    <small>Live</small>

                  </div>


                  <div className="hero-trip">

                    <div className="hero-trip-icon">
                      <Truck size={16} />
                    </div>

                    <div>
                      <strong>VH-1048</strong>
                      <span>Hyderabad → Guntur</span>
                    </div>

                    <small>Live</small>

                  </div>


                  <div className="hero-trip">

                    <div className="hero-trip-icon">
                      <Truck size={16} />
                    </div>

                    <div>
                      <strong>VH-1072</strong>
                      <span>Guntur → Tenali</span>
                    </div>

                    <small className="scheduled-text">
                      Scheduled
                    </small>

                  </div>

                </div>

              </div>


              <div className="hero-dashboard-footer">

                <div>
                  <span>Fuel Expenses</span>
                  <strong>₹84,250</strong>
                </div>

                <div>
                  <span>Maintenance</span>
                  <strong>₹42,600</strong>
                </div>

                <div>
                  <span>Completed Today</span>
                  <strong>126</strong>
                </div>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* ================= STATISTICS ================= */}

      <section className="stats-section">

        <div className="stats-container">

          <div className="stat-item">
            <strong>48+</strong>
            <span>Fleet Vehicles</span>
          </div>

          <div className="stat-divider"></div>

          <div className="stat-item">
            <strong>120+</strong>
            <span>Active Drivers</span>
          </div>

          <div className="stat-divider"></div>

          <div className="stat-item">
            <strong>2,450+</strong>
            <span>Trips Completed</span>
          </div>

          <div className="stat-divider"></div>

          <div className="stat-item">
            <strong>99.9%</strong>
            <span>Fleet Visibility</span>
          </div>

        </div>

      </section>


      {/* ================= FEATURES ================= */}

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


      {/* ================= WHY CHOOSE US ================= */}

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
              <span> Complete Fleet Visibility.</span>
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
                  <strong>Centralized Operations</strong>

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
                  <strong>Faster Decision Making</strong>

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
                  <strong>Better Control</strong>

                  <p>
                    Maintain accurate operational records and
                    keep your entire fleet organized.
                  </p>
                </div>

              </div>

            </div>

          </div>


          <div className="why-visual">

            <div className="why-main-card">

              <div className="why-card-header">

                <div>
                  <span>Fleet Efficiency</span>
                  <strong>87.4%</strong>
                </div>

                <div className="efficiency-badge">
                  +12.8%
                </div>

              </div>


              <div className="efficiency-chart">

                <div className="chart-line"></div>

                <div className="chart-point point-a"></div>

                <div className="chart-point point-b"></div>

                <div className="chart-point point-c"></div>

                <div className="chart-point point-d"></div>

                <div className="chart-point point-e"></div>

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
                <strong>Fleet Healthy</strong>
                <span>
                  43 of 48 vehicles operational
                </span>
              </div>

            </div>

          </div>

        </div>

      </section>


      {/* ================= HOW IT WORKS ================= */}

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


      {/* ================= DASHBOARD OVERVIEW ================= */}

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
            <span> One Dashboard.</span>
          </h2>

        </div>


        <div className="main-dashboard">

          <aside className="dashboard-sidebar">

            <div className="dashboard-brand">

              <div className="dashboard-brand-icon">
                <Truck size={19} />
              </div>

              <span>
                Fleet<span>Flow</span>
              </span>

            </div>


            <div className="dashboard-menu">

              <DashboardMenu
                icon={<LayoutDashboard />}
                text="Dashboard"
                active
              />

              <DashboardMenu
                icon={<Truck />}
                text="Vehicles"
              />

              <DashboardMenu
                icon={<Users />}
                text="Drivers"
              />

              <DashboardMenu
                icon={<Route />}
                text="Trips"
              />

              <DashboardMenu
                icon={<MapPin />}
                text="Live Tracking"
              />

              <DashboardMenu
                icon={<Fuel />}
                text="Fuel"
              />

              <DashboardMenu
                icon={<Wrench />}
                text="Maintenance"
              />

              <DashboardMenu
                icon={<Wallet />}
                text="Expenses"
              />

              <DashboardMenu
                icon={<BarChart3 />}
                text="Reports"
              />

            </div>

          </aside>


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
                value="48"
                description="↑ 12% from last month"
                descriptionClass="success-text"
              />

              <DashboardStat
                icon={<Route />}
                iconClass="purple"
                title="Active Trips"
                value="24"
                description="8 trips starting soon"
                descriptionClass="blue-text"
              />

              <DashboardStat
                icon={<Users />}
                iconClass="green"
                title="Available Drivers"
                value="32"
                description="Ready for assignment"
                descriptionClass="success-text"
              />

              <DashboardStat
                icon={<Wrench />}
                iconClass="orange"
                title="Maintenance"
                value="5"
                description="Requires attention"
                descriptionClass="warning-text"
              />

            </div>


            <div className="dashboard-grid">

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


                  <div className="map-marker map-marker-one">
                    <Truck size={14} />
                  </div>

                  <div className="map-marker map-marker-two">
                    <Truck size={14} />
                  </div>

                  <div className="map-marker map-marker-three">
                    <Truck size={14} />
                  </div>

                  <div className="map-marker map-marker-four">
                    <Truck size={14} />
                  </div>


                  <div className="map-live-indicator">

                    <span></span>

                    24 Vehicles Active

                  </div>

                </div>

              </div>


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

                  <TripItem
                    id="TRP-1048"
                    route="Vijayawada → Guntur"
                    status="Active"
                    statusClass="active-status"
                  />

                  <TripItem
                    id="TRP-1047"
                    route="Guntur → Amaravati"
                    status="Completed"
                    statusClass="completed-status"
                  />

                  <TripItem
                    id="TRP-1046"
                    route="Vijayawada → Hyderabad"
                    status="Scheduled"
                    statusClass="scheduled-status"
                  />

                  <TripItem
                    id="TRP-1045"
                    route="Guntur → Ongole"
                    status="Active"
                    statusClass="active-status"
                  />

                </div>

              </div>

            </div>


            <div className="dashboard-bottom-grid">

              <div className="dashboard-card metric-card">

                <div className="metric-icon">
                  <Fuel size={19} />
                </div>

                <div>

                  <span>
                    Fuel Consumption
                  </span>

                  <strong>
                    178.6 L
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
                    ₹1,24,850
                  </strong>

                  <small>
                    10.7% compared to last month
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

                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* ================= CONTACT ================= */}

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
                  <strong>Email</strong>
                  <span>info@shnoor.com</span>
                </div>

              </div>


              <div className="contact-info-item">

                <div className="contact-info-icon">
                  <MapPin size={18} />
                </div>

                <div>
                  <strong>Location</strong>

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

                  <label>Name</label>

                  <input
                    type="text"
                    placeholder="Your name"
                  />

                </div>


                <div className="contact-field">

                  <label>Email</label>

                  <input
                    type="email"
                    placeholder="Your email"
                  />

                </div>

              </div>


              <div className="contact-field">

                <label>Subject</label>

                <input
                  type="text"
                  placeholder="How can we help?"
                />

              </div>


              <div className="contact-field">

                <label>Message</label>

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


      {/* ================= CTA ================= */}

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


      {/* ================= FOOTER ================= */}

      <footer className="footer">

        <div className="footer-container">

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


/* ================= FEATURE CARD ================= */

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


/* ================= STEP ================= */

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


/* ================= DASHBOARD MENU ================= */

function DashboardMenu({
  icon,
  text,
  active = false,
}) {
  return (
    <div
      className={`dashboard-menu-item ${
        active ? "active" : ""
      }`}
    >

      {icon}

      <span>
        {text}
      </span>

    </div>
  );
}


/* ================= DASHBOARD STAT ================= */

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


/* ================= TRIP ITEM ================= */

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