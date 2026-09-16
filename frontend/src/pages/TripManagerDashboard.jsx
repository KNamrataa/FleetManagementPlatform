import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Truck,
  UserRound,
  Users,
  X,
  XCircle
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import NotificationBell from "../components/NotificationBell";
import { API_URL, apiRequest, authFetch } from "../services/api";
import { getSocket } from "../services/socket";
import "./FleetManager.css";
import "./TripManagerDashboard.css";

const cls = (s = "") =>
  String(s).toLowerCase().replaceAll("_", "-");

const label = (s = "") =>
  String(s).replaceAll("_", " ");

const fmt = (v) =>
  v ? new Date(v).toLocaleString() : "—";

const dtValue = (v) =>
  v ? new Date(v).toISOString().slice(0, 16) : "";

const NAV = [
  ["/trip-manager", "Overview", LayoutDashboard],
  ["/trip-manager/trip-requests", "Trip Requests", ClipboardList],
  ["/trip-manager/scheduling", "Trip Scheduling", CalendarDays],
  ["/trip-manager/driver-assignment", "Driver Assignment", UserRound],
  ["/trip-manager/vehicle-assignment", "Vehicle Assignment", Car],
  ["/trip-manager/dispatch-board", "Dispatch Board", Activity],
  ["/trip-manager/rescheduled", "Rescheduled Trips", RefreshCw],
  ["/trip-manager/cancelled", "Cancelled Trips", XCircle],
  ["/trip-manager/active", "Active Trips", Truck],
  ["/trip-manager/delayed", "Delayed Trips", Clock3],
  ["/trip-manager/conflicts", "Trip Conflicts", AlertTriangle],
  ["/trip-manager/notifications", "Notifications", Bell],
  ["/trip-manager/profile", "Profile", UserRound]
];

export default function TripManagerDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  let user = {};
  try {
    user = JSON.parse(
      sessionStorage.getItem("fleetUser") || "{}"
    );
  } catch {}

  const logout = async () => {
    try {
      await authFetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch {}

    sessionStorage.removeItem("fleetUser");
    sessionStorage.removeItem("fleetToken");

    navigate("/login", {
      replace: true
    });
  };

  const path = location.pathname;

  let title = "Trip Manager";
  let subtitle =
    "Coordinate transportation requests, schedules and trip assignments";

  if (path.includes("trip-requests")) {
    title = "Trip Requests";
    subtitle =
      "Review customer requests and create operational trips";
  } else if (path.includes("scheduling")) {
    title = "Trip Scheduling";
    subtitle =
      "Schedule, reschedule and cancel existing trips";
  } else if (path.includes("driver-assignment")) {
    title = "Driver Assignment";
    subtitle =
      "Assign eligible drivers without schedule conflicts";
  } else if (path.includes("vehicle-assignment")) {
    title = "Vehicle Assignment";
    subtitle =
      "Assign eligible fleet vehicles without conflicts";
  } else if (path.includes("dispatch-board")) {
    title = "Dispatch Board";
    subtitle =
      "Central operational view of trips and resources";
  } else if (path.includes("rescheduled")) {
    title = "Rescheduled Trips";
    subtitle =
      "Review actual scheduling history from MongoDB";
  } else if (path.includes("cancelled")) {
    title = "Cancelled Trips";
    subtitle =
      "Cancelled trips remain available for audit and reporting";
  } else if (path.includes("active")) {
    title = "Active Trips";
    subtitle =
      "Monitor trips currently in progress";
  } else if (path.includes("delayed")) {
    title = "Delayed Trips";
    subtitle =
      "Review trips that are late or marked as delayed";
  } else if (path.includes("conflicts")) {
    title = "Trip Conflicts";
    subtitle =
      "Backend-detected driver and vehicle scheduling conflicts";
  } else if (path.includes("notifications")) {
    title = "Notifications";
    subtitle =
      "Trip Manager operational notifications";
  } else if (path.includes("profile")) {
    title = "Profile";
    subtitle = "Your FleetFlow account";
  }

  return (
    <div className="fm-shell tm-shell">
      <aside
        className={`fm-sidebar ${open ? "open" : ""}`}
      >
        <div className="fm-brand">
          <div className="fm-brand-icon">
            <Truck size={22} />
          </div>

          <span>
            Fleet<span>Flow</span>
          </span>
        </div>

        <div className="fm-user">
          <div className="fm-avatar">
            {(user.fullName || "T")
              .charAt(0)
              .toUpperCase()}
          </div>

          <div>
            <strong>
              {user.fullName || "Trip Manager"}
            </strong>

            <span>Trip Manager</span>
          </div>
        </div>

        <nav className="fm-nav">
          {NAV.map(([to, text, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/trip-manager"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `fm-nav-item ${
                  isActive ? "active" : ""
                }`
              }
            >
              <Icon size={18} />
              <span>{text}</span>
            </NavLink>
          ))}
        </nav>

        <button
          className="fm-logout"
          onClick={logout}
        >
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      {open && (
        <button
          className="fm-overlay"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      )}

      <main className="fm-main">
        <header className="fm-header">
          <button
            className="fm-menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div>
            <p>TRIP MANAGER</p>
            <h1>{title}</h1>
            <span>{subtitle}</span>
          </div>

          <NotificationBell />

          <div className="fm-header-user">
            {user.fullName || "Trip Manager"}
          </div>
        </header>

        <div className="fm-content">
          <TripManagerContent
            path={path}
            user={user}
          />
        </div>
      </main>
    </div>
  );
}

function TripManagerContent({ path }) {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const socket = getSocket();

    const events = [
      "tripCreated",
      "tripScheduled",
      "tripRescheduled",
      "tripCancelled",
      "driverAssigned",
      "vehicleAssigned",
      "tripReassigned",
      "driverRejected",
      "tripStarted",
      "tripDelayed",
      "tripCompleted",
      "vehicleStatusChanged",
      "driverStatusChanged",
      "maintenanceStatusChanged",
      "notificationCreated",
      "notification:new"
    ];

    const refresh = () =>
      setRefreshKey((x) => x + 1);

    events.forEach((event) =>
      socket.on(event, refresh)
    );

    return () =>
      events.forEach((event) =>
        socket.off(event, refresh)
      );
  }, []);

  if (path.includes("trip-requests")) {
    return (
      <Requests
        key={refreshKey}
        onChanged={() =>
          setRefreshKey((x) => x + 1)
        }
      />
    );
  }

  if (path.includes("scheduling")) {
    return (
      <TripsWorkspace
        key={refreshKey}
        mode="schedule"
      />
    );
  }

  if (path.includes("driver-assignment")) {
    return (
      <TripsWorkspace
        key={refreshKey}
        mode="driver"
      />
    );
  }

  if (path.includes("vehicle-assignment")) {
    return (
      <TripsWorkspace
        key={refreshKey}
        mode="vehicle"
      />
    );
  }

  if (path.includes("dispatch-board")) {
    return (
      <TripsWorkspace
        key={refreshKey}
        mode="board"
      />
    );
  }

  if (path.includes("rescheduled")) {
    return (
      <TripListEndpoint
        key={refreshKey}
        endpoint="rescheduled"
        title="Rescheduled Trips"
      />
    );
  }

  if (path.includes("cancelled")) {
    return (
      <TripListEndpoint
        key={refreshKey}
        endpoint="cancelled"
        title="Cancelled Trips"
      />
    );
  }

  if (path.includes("active")) {
    return (
      <TripListEndpoint
        key={refreshKey}
        endpoint="active"
        title="Active Trips"
      />
    );
  }

  if (path.includes("delayed")) {
    return (
      <TripListEndpoint
        key={refreshKey}
        endpoint="delayed"
        title="Delayed Trips"
      />
    );
  }

  if (path.includes("conflicts")) {
    return <Conflicts key={refreshKey} />;
  }

  if (path.includes("notifications")) {
    return <Notifications key={refreshKey} />;
  }

  if (path.includes("profile")) {
    return <Profile />;
  }

  return <Overview key={refreshKey} />;
}

function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setData(
        await apiRequest(
          "/api/trip-manager/overview"
        )
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const id = setInterval(
      load,
      30000
    );

    return () => clearInterval(id);
  }, [load]);

  const k = data?.kpis || {};

  const cards = [
    [
      ClipboardList,
      "Pending Requests",
      k.pendingTripRequests
    ],
    [
      CalendarDays,
      "Scheduled Today",
      k.scheduledToday
    ],
    [
      CalendarDays,
      "Scheduled Tomorrow",
      k.scheduledTomorrow
    ],
    [
      Clock3,
      "Unassigned Trips",
      k.unassignedTrips
    ],
    [
      CheckCircle2,
      "Assigned Trips",
      k.assignedTrips
    ],
    [
      Activity,
      "Active Trips",
      k.activeTrips
    ],
    [
      AlertTriangle,
      "Delayed Trips",
      k.delayedTrips
    ],
    [
      RefreshCw,
      "Rescheduled",
      k.rescheduledTrips
    ],
    [
      XCircle,
      "Cancelled",
      k.cancelledTrips
    ],
    [
      CheckCircle2,
      "Completed",
      k.completedTrips
    ],
    [
      Users,
      "Available Drivers",
      k.availableDrivers
    ],
    [
      Car,
      "Available Vehicles",
      k.availableVehicles
    ]
  ];

  return (
    <>
      <Toolbar
        title="Operations Overview"
        subtitle="Live operational statistics from MongoDB"
        onRefresh={load}
        loading={loading}
      />

      {error && (
        <Alert
          text={error}
          error
        />
      )}

      <div className="fm-stats tm-kpi-grid">
        {cards.map(
          ([Icon, text, value]) => (
            <div
              className="fm-stat"
              key={text}
            >
              <div className="fm-stat-icon">
                <Icon size={18} />
              </div>

              <div>
                <span>{text}</span>
                <strong>
                  {value ?? 0}
                </strong>
              </div>
            </div>
          )
        )}
      </div>

      <div className="fm-grid-2">
        <section className="fm-card">
          <h2>Trip Status</h2>

          {Object.entries(
            data?.tripStatus || {}
          ).map(([s, c]) => (
            <div
              className="fm-row"
              key={s}
            >
              <span>{label(s)}</span>
              <strong>{c}</strong>
            </div>
          ))}

          {!Object.keys(
            data?.tripStatus || {}
          ).length && (
            <Empty text="No trip status data." />
          )}
        </section>

        <section className="fm-card">
          <h2>Resource Availability</h2>

          <div className="fm-row">
            <span>Drivers Available</span>
            <strong>
              {data?.driverStatus?.AVAILABLE ||
                0}
            </strong>
          </div>

          <div className="fm-row">
            <span>Drivers On Trip</span>
            <strong>
              {data?.driverStatus?.ON_TRIP ||
                0}
            </strong>
          </div>

          <div className="fm-row">
            <span>Vehicles Available</span>
            <strong>
              {data?.vehicleStatus?.AVAILABLE ||
                0}
            </strong>
          </div>

          <div className="fm-row">
            <span>Vehicles Maintenance</span>
            <strong>
              {data?.vehicleStatus?.MAINTENANCE ||
                0}
            </strong>
          </div>
        </section>
      </div>

      <section className="fm-card">
        <div className="fm-card-head">
          <div>
            <h2>Immediate Attention</h2>
            <p>
              Items that can require Trip Manager
              action
            </p>
          </div>
        </div>

        <div className="tm-attention">
          <div>
            <AlertTriangle size={18} />
            <strong>
              {k.unassignedTrips || 0}
            </strong>
            <span>
              trips without assignment
            </span>
          </div>

          <div>
            <AlertTriangle size={18} />
            <strong>
              {k.driverAssignmentConflicts ||
                0}
            </strong>
            <span>
              detected resource conflicts
            </span>
          </div>

          <div>
            <Bell size={18} />
            <strong>
              {k.pendingTripRequests || 0}
            </strong>
            <span>
              customer requests pending
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

function Requests({ onChanged }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [customer, setCustomer] = useState("");
  const [priority, setPriority] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] =
    useState(null);
  const [modal, setModal] = useState(null);
  const [resources, setResources] =
    useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const q = new URLSearchParams({
          page,
          limit: 20
        });

        if (search.trim())
          q.set("search", search.trim());

        if (status)
          q.set("status", status);

        if (customer)
          q.set("customer", customer);

        if (priority)
          q.set("priority", priority);

        if (from)
          q.set("from", from);

        if (to)
          q.set("to", to);

        const [r, res] =
          await Promise.all([
            apiRequest(
              `/api/trip-manager/trip-requests?${q}`
            ),
            apiRequest(
              "/api/trip-manager/drivers"
            )
          ]);

        setRequests(r.requests || []);
        setPagination(
          r.pagination || null
        );
        setResources(res);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [
      page,
      search,
      status,
      customer,
      priority,
      from,
      to
    ]
  );

  const loadResources =
    useCallback(async () => {
      try {
        setResources(
          await apiRequest(
            "/api/trip-manager/drivers"
          )
        );
      } catch (e) {
        setError(e.message);
      }
    }, []);

  useEffect(() => {
    const t = setTimeout(
      load,
      200
    );

    return () =>
      clearTimeout(t);
  }, [load]);

  useEffect(
    () =>
      setPage(1),
    [
      search,
      status,
      customer,
      priority,
      from,
      to
    ]
  );

  const openCreate = async (r) => {
    setModal({
      type: "create",
      request: r,
      form: {
        scheduledStart:
          dtValue(r.requestedDate),
        scheduledEnd: "",
        driver: "",
        vehicle: "",
        notes:
          r.specialInstructions || ""
      }
    });

    await loadResources();
  };

  const submitCreate =
    async (e) => {
      e.preventDefault();
      setSaving(true);
      setError("");

      try {
        const f = modal.form;

        const result =
          await apiRequest(
            "/api/trip-manager/trips",
            {
              method: "POST",
              body: JSON.stringify({
                requestId:
                  modal.request._id,
                driver: f.driver,
                vehicle: f.vehicle,
                scheduledStart:
                  f.scheduledStart,
                scheduledEnd:
                  f.scheduledEnd ||
                  null,
                notes: f.notes
              })
            }
          );

        setModal(null);
        onChanged?.();
        load();

        window.alert(
          result.message
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    };

  const setRequestStatus =
    async (r, next) => {
      try {
        let rejectionReason = "";

        if (next === "REJECTED") {
          rejectionReason =
            window.prompt(
              "Reason for rejection:",
              ""
            ) || "";
        }

        const result =
          await apiRequest(
            `/api/trip-requests/${r._id}/status`,
            {
              method: "PATCH",
              body: JSON.stringify({
                status: next,
                rejectionReason
              })
            }
          );

        window.alert(
          result.message
        );

        load();
      } catch (e) {
        setError(e.message);
      }
    };

  return (
    <>
      <Toolbar
        title="Customer Trip Requests"
        subtitle="Requests come from the existing customer TripRequest collection"
        onRefresh={load}
        loading={loading}
      />

      {error && (
        <Alert
          text={error}
          error
        />
      )}

      <div className="fm-card">
        <div className="fm-filters">
          <div className="fm-search">
            <Search size={17} />

            <input
              placeholder="Search request, customer, pickup, destination..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />
          </div>

          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value)
            }
          >
            <option value="">
              All Status
            </option>

            {[
              "PENDING",
              "REVIEWED",
              "ACCEPTED",
              "TRIP_CREATED",
              "REJECTED",
              "CANCELLED"
            ].map((s) => (
              <option key={s}>
                {label(s)}
              </option>
            ))}
          </select>

          <select
            value={customer}
            onChange={(e) =>
              setCustomer(e.target.value)
            }
          >
            <option value="">
              All Customers
            </option>

            {(resources?.customers || []).map(
              (c) => (
                <option
                  key={c._id}
                  value={c._id}
                >
                  {c.fullName}
                </option>
              )
            )}
          </select>

          <select
            value={priority}
            onChange={(e) =>
              setPriority(e.target.value)
            }
          >
            <option value="">
              All Priorities
            </option>

            {[
              "LOW",
              "NORMAL",
              "HIGH",
              "URGENT"
            ].map((s) => (
              <option key={s}>
                {s}
              </option>
            ))}
          </select>

          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) =>
                setFrom(e.target.value)
              }
            />
          </label>

          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) =>
                setTo(e.target.value)
              }
            />
          </label>
        </div>

        {loading ? (
          <Loading text="Loading trip requests..." />
        ) : !requests.length ? (
          <Empty text="No customer trip requests." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Requested</th>
                <th>Service</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {requests.map((r) => (
                <tr key={r._id}>
                  <td>
                    <strong>
                      {r.requestNumber}
                    </strong>
                  </td>

                  <td>
                    {r.customer?.fullName ||
                      "—"}
                    <small>
                      {r.customer?.email ||
                        ""}
                    </small>
                  </td>

                  <td>
                    {r.pickupLocation} →{" "}
                    {r.destination}
                  </td>

                  <td>
                    {fmt(
                      r.requestedDate
                    )}
                    <small>
                      {r.requestedTime ||
                        ""}
                    </small>
                  </td>

                  <td>
                    {r.serviceType ||
                      "—"}
                  </td>

                  <td>
                    <span
                      className={`fm-badge ${cls(
                        r.status
                      )}`}
                    >
                      {label(
                        r.status
                      )}
                    </span>
                  </td>

                  <td>
                    <div className="fm-icon-actions">
                      <button
                        title="View"
                        onClick={() =>
                          setModal({
                            type: "view",
                            request: r
                          })
                        }
                      >
                        <Eye size={16} />
                      </button>

                      {r.status ===
                        "PENDING" && (
                        <button
                          title="Mark reviewed"
                          onClick={() =>
                            setRequestStatus(
                              r,
                              "REVIEWED"
                            )
                          }
                        >
                          <ClipboardList
                            size={16}
                          />
                        </button>
                      )}

                      {![
                        "TRIP_CREATED",
                        "REJECTED",
                        "CANCELLED"
                      ].includes(
                        r.status
                      ) && (
                        <button
                          className="activate"
                          title="Accept"
                          onClick={() =>
                            setRequestStatus(
                              r,
                              "ACCEPTED"
                            )
                          }
                        >
                          <CheckCircle2
                            size={16}
                          />
                        </button>
                      )}

                      {![
                        "TRIP_CREATED",
                        "REJECTED",
                        "CANCELLED"
                      ].includes(
                        r.status
                      ) && (
                        <button
                          className="primary"
                          title="Create trip"
                          onClick={() =>
                            openCreate(r)
                          }
                        >
                          <Truck size={16} />
                        </button>
                      )}

                      {![
                        "TRIP_CREATED",
                        "REJECTED",
                        "CANCELLED"
                      ].includes(
                        r.status
                      ) && (
                        <button
                          className="danger"
                          title="Reject"
                          onClick={() =>
                            setRequestStatus(
                              r,
                              "REJECTED"
                            )
                          }
                        >
                          <XCircle
                            size={16}
                          />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {pagination && (
          <Pager
            pagination={pagination}
            page={page}
            setPage={setPage}
          />
        )}
      </div>

      {modal && (
        <Modal
          onClose={() =>
            setModal(null)
          }
        >
          {modal.type === "view" ? (
            <>
              <ModalHead
                title={
                  modal.request
                    .requestNumber
                }
                onClose={() =>
                  setModal(null)
                }
              />

              <DetailGrid
                values={[
                  [
                    "Customer",
                    modal.request.customer
                      ?.fullName || "—"
                  ],
                  [
                    "Email",
                    modal.request.customer
                      ?.email || "—"
                  ],
                  [
                    "Pickup",
                    modal.request
                      .pickupLocation
                  ],
                  [
                    "Destination",
                    modal.request
                      .destination
                  ],
                  [
                    "Requested",
                    `${fmt(
                      modal.request
                        .requestedDate
                    )} ${
                      modal.request
                        .requestedTime ||
                      ""
                    }`
                  ],
                  [
                    "Service",
                    modal.request
                      .serviceType ||
                      "—"
                  ],
                  [
                    "Vehicle Requirement",
                    modal.request
                      .vehicleType ||
                      "Any suitable vehicle"
                  ],
                  [
                    "Passengers",
                    modal.request
                      .passengerCount ||
                      0
                  ],
                  [
                    "Cargo",
                    modal.request
                      .cargoDetails ||
                      "—"
                  ],
                  [
                    "Cargo Weight",
                    modal.request
                      .cargoWeight
                      ? `${modal.request.cargoWeight} kg`
                      : "—"
                  ],
                  [
                    "Priority",
                    modal.request
                      .priority ||
                      "—"
                  ],
                  [
                    "Status",
                    label(
                      modal.request
                        .status
                    )
                  ],
                  [
                    "Instructions",
                    modal.request
                      .specialInstructions ||
                      "—"
                  ]
                ]}
              />
            </>
          ) : (
            <form
              onSubmit={submitCreate}
            >
              <ModalHead
                title={`Create Trip — ${modal.request.requestNumber}`}
                onClose={() =>
                  setModal(null)
                }
              />

              <DetailGrid
                values={[
                  [
                    "Customer",
                    modal.request.customer
                      ?.fullName || "—"
                  ],
                  [
                    "Route",
                    `${modal.request.pickupLocation} → ${modal.request.destination}`
                  ],
                  [
                    "Passengers",
                    modal.request
                      .passengerCount ||
                      0
                  ]
                ]}
              />

              <div className="fm-form-grid">
                <label>
                  Driver

                  <select
                    required
                    value={
                      modal.form
                        .driver
                    }
                    onChange={(e) =>
                      setModal(
                        (m) => ({
                          ...m,
                          form: {
                            ...m.form,
                            driver:
                              e.target
                                .value
                          }
                        })
                      )
                    }
                  >
                    <option value="">
                      Select eligible driver
                    </option>

                    {(
                      resources?.drivers ||
                      []
                    )
                      .filter(
                        (d) =>
                          d.eligible
                      )
                      .map((d) => (
                        <option
                          key={d._id}
                          value={d._id}
                        >
                          {d.fullName} —{" "}
                          {d.status}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  Vehicle

                  <select
                    required
                    value={
                      modal.form
                        .vehicle
                    }
                    onChange={(e) =>
                      setModal(
                        (m) => ({
                          ...m,
                          form: {
                            ...m.form,
                            vehicle:
                              e.target
                                .value
                          }
                        })
                      )
                    }
                  >
                    <option value="">
                      Select eligible vehicle
                    </option>

                    {(
                      resources?.vehicles ||
                      []
                    )
                      .filter(
                        (v) =>
                          v.eligible &&
                          (!modal.request
                            .vehicleType ||
                            String(
                              v.vehicleType
                            ).toLowerCase() ===
                              String(
                                modal.request
                                  .vehicleType
                              ).toLowerCase())
                      )
                      .map((v) => (
                        <option
                          key={v._id}
                          value={v._id}
                        >
                          {
                            v.registrationNumber
                          }{" "}
                          —{" "}
                          {
                            v.vehicleType
                          }{" "}
                          — cap{" "}
                          {v.capacity}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  Scheduled Start

                  <input
                    required
                    type="datetime-local"
                    value={
                      modal.form
                        .scheduledStart
                    }
                    onChange={(e) =>
                      setModal(
                        (m) => ({
                          ...m,
                          form: {
                            ...m.form,
                            scheduledStart:
                              e.target
                                .value
                          }
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Scheduled End

                  <input
                    type="datetime-local"
                    value={
                      modal.form
                        .scheduledEnd
                    }
                    onChange={(e) =>
                      setModal(
                        (m) => ({
                          ...m,
                          form: {
                            ...m.form,
                            scheduledEnd:
                              e.target
                                .value
                          }
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Notes

                  <textarea
                    value={
                      modal.form.notes
                    }
                    onChange={(e) =>
                      setModal(
                        (m) => ({
                          ...m,
                          form: {
                            ...m.form,
                            notes:
                              e.target
                                .value
                          }
                        })
                      )
                    }
                  />
                </label>
              </div>

              <div className="fm-modal-foot">
                <button
                  type="button"
                  onClick={() =>
                    setModal(null)
                  }
                >
                  Cancel
                </button>

                <button
                  className="primary"
                  disabled={saving}
                >
                  {saving
                    ? "Creating..."
                    : "Create & Assign Trip"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function TripsWorkspace({ mode }) {
  const [trips, setTrips] =
    useState([]);

  const [resources, setResources] =
    useState({
      drivers: [],
      vehicles: [],
      customers: []
    });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [status, setStatus] =
    useState("");

  const [customer, setCustomer] =
    useState("");

  const [priority, setPriority] =
    useState("");

  const [from, setFrom] =
    useState("");

  const [to, setTo] =
    useState("");

  const [calendarView, setCalendarView] =
    useState("day");

  const [selectedDate, setSelectedDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

  const [modal, setModal] =
    useState(null);

  const [saving, setSaving] =
    useState(false);

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const q =
          new URLSearchParams({
            limit: 200
          });

        if (search.trim())
          q.set(
            "search",
            search.trim()
          );

        if (status)
          q.set("status", status);

        if (customer)
          q.set(
            "customer",
            customer
          );

        if (priority)
          q.set(
            "priority",
            priority
          );

        if (from)
          q.set("from", from);

        if (to)
          q.set("to", to);

        const [t, r] =
          await Promise.all([
            apiRequest(
              `/api/trip-manager/trips?${q}`
            ),
            apiRequest(
              "/api/trip-manager/drivers"
            )
          ]);

        setTrips(t.trips || []);
        setResources(r);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [
      search,
      status,
      customer,
      priority,
      from,
      to
    ]
  );

  useEffect(() => {
    const t = setTimeout(
      load,
      150
    );

    return () =>
      clearTimeout(t);
  }, [load]);

  const candidates =
    mode === "driver"
      ? resources.drivers || []
      : resources.vehicles || [];

  const openAction = (
    trip,
    action
  ) => {
    const current =
      action === "driver"
        ? trip.driver?._id ||
          trip.driver ||
          ""
        : trip.vehicle?._id ||
          trip.vehicle ||
          "";

    setModal({
      action,
      trip,
      value: current,
      scheduledStart:
        dtValue(
          trip.scheduledStart
        ),
      scheduledEnd:
        dtValue(
          trip.scheduledEnd
        ),
      reason: ""
    });
  };

  /*
   * FIX:
   * The cancel request must close both the
   * JSON.stringify object and the apiRequest
   * options object correctly.
   */
  const save = async (e) => {
    e.preventDefault();

    setSaving(true);
    setError("");

    try {
      let result;

      if (
        modal.action ===
        "driver"
      ) {
        result =
          await apiRequest(
            `/api/trip-manager/trips/${modal.trip._id}/assign-driver`,
            {
              method: "POST",
              body: JSON.stringify({
                driverId:
                  modal.value
              })
            }
          );
      } else if (
        modal.action ===
        "vehicle"
      ) {
        result =
          await apiRequest(
            `/api/trip-manager/trips/${modal.trip._id}/assign-vehicle`,
            {
              method: "POST",
              body: JSON.stringify({
                vehicleId:
                  modal.value
              })
            }
          );
      } else if (
        modal.action ===
        "reschedule"
      ) {
        result =
          await apiRequest(
            `/api/trip-manager/trips/${modal.trip._id}/reschedule`,
            {
              method: "PUT",
              body: JSON.stringify({
                scheduledStart:
                  modal.scheduledStart,
                scheduledEnd:
                  modal.scheduledEnd ||
                  null,
                reason:
                  modal.reason
              })
            }
          );
      } else {
        result =
          await apiRequest(
            `/api/trip-manager/trips/${modal.trip._id}/cancel`,
            {
              method: "PUT",
              body: JSON.stringify({
                reason:
                  modal.reason
              })
            }
          );
      }

      setModal(null);

      load();

      window.alert(
        result.message
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const shown =
    mode === "schedule"
      ? trips.filter((t) => {
          const d = new Date(
            t.scheduledStart
          );

          const day = new Date(
            selectedDate +
              "T00:00:00"
          );

          if (
            calendarView ===
            "day"
          ) {
            return (
              d.toDateString() ===
              day.toDateString()
            );
          }

          if (
            calendarView ===
            "week"
          ) {
            const start =
              new Date(day);

            start.setDate(
              day.getDate() -
                day.getDay()
            );

            const end =
              new Date(start);

            end.setDate(
              start.getDate() +
                7
            );

            return (
              d >= start &&
              d < end
            );
          }

          return (
            d.getFullYear() ===
              day.getFullYear() &&
            d.getMonth() ===
              day.getMonth()
          );
        })
      : trips;

  return (
    <>
      <Toolbar
        title={
          mode === "board"
            ? "Dispatch Board"
            : mode === "schedule"
            ? "Trip Scheduling"
            : mode === "driver"
            ? "Driver Assignment"
            : "Vehicle Assignment"
        }
        subtitle="Uses the existing Trip, User, DriverProfile and Vehicle collections"
        onRefresh={load}
        loading={loading}
      />

      {error && (
        <Alert
          text={error}
          error
        />
      )}

      <div className="fm-card">
        <div className="fm-filters">
          <div className="fm-search">
            <Search size={17} />

            <input
              placeholder="Search trip, route or customer..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />
          </div>

          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value)
            }
          >
            <option value="">
              All Trip Statuses
            </option>

            {[
              "SCHEDULED",
              "ASSIGNED",
              "IN_PROGRESS",
              "PAUSED",
              "COMPLETED",
              "CANCELLED"
            ].map((s) => (
              <option key={s}>
                {label(s)}
              </option>
            ))}
          </select>

          <select
            value={customer}
            onChange={(e) =>
              setCustomer(e.target.value)
            }
          >
            <option value="">
              All Customers
            </option>

            {(resources.customers ||
              []
            ).map((c) => (
              <option
                key={c._id}
                value={c._id}
              >
                {c.fullName}
              </option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(e) =>
              setPriority(e.target.value)
            }
          >
            <option value="">
              All Priorities
            </option>

            {[
              "LOW",
              "NORMAL",
              "HIGH",
              "URGENT"
            ].map((s) => (
              <option key={s}>
                {s}
              </option>
            ))}
          </select>

          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) =>
                setFrom(e.target.value)
              }
            />
          </label>

          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) =>
                setTo(e.target.value)
              }
            />
          </label>
        </div>

        {mode === "schedule" && (
          <div className="tm-calendar-controls">
            <button
              className={
                calendarView ===
                "day"
                  ? "primary"
                  : ""
              }
              onClick={() =>
                setCalendarView(
                  "day"
                )
              }
            >
              Day
            </button>

            <button
              className={
                calendarView ===
                "week"
                  ? "primary"
                  : ""
              }
              onClick={() =>
                setCalendarView(
                  "week"
                )
              }
            >
              Week
            </button>

            <button
              className={
                calendarView ===
                "month"
                  ? "primary"
                  : ""
              }
              onClick={() =>
                setCalendarView(
                  "month"
                )
              }
            >
              Month
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) =>
                setSelectedDate(
                  e.target.value
                )
              }
            />
          </div>
        )}

        {loading ? (
          <Loading text="Loading trip data..." />
        ) : !shown.length ? (
          <Empty text="No trips found for the selected filters/date." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Trip</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Scheduled</th>
                <th>Priority</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {shown.map((t) => (
                <tr key={t._id}>
                  <td>
                    <strong>
                      {t.tripId}
                    </strong>
                  </td>

                  <td>
                    {t.customer
                      ?.fullName ||
                      "—"}
                  </td>

                  <td>
                    {t.pickupLocation} →{" "}
                    {t.destination}
                  </td>

                  <td>
                    {fmt(
                      t.scheduledStart
                    )}

                    <small>
                      {t.scheduledEnd
                        ? `to ${fmt(
                            t.scheduledEnd
                          )}`
                        : ""}
                    </small>
                  </td>

                  <td>
                    {t.priority ||
                      "NORMAL"}
                  </td>

                  <td>
                    {t.driver
                      ?.fullName ||
                      "Unassigned"}
                  </td>

                  <td>
                    {t.vehicle
                      ?.registrationNumber ||
                      "Unassigned"}
                  </td>

                  <td>
                    <span
                      className={`fm-badge ${cls(
                        t.tripStatus
                      )}`}
                    >
                      {label(
                        t.tripStatus
                      )}
                    </span>
                  </td>

                  <td>
                    <div className="fm-icon-actions">
                      <button
                        title="View trip"
                        onClick={() =>
                          openAction(
                            t,
                            "view"
                          )
                        }
                      >
                        <Eye size={16} />
                      </button>

                      {mode !==
                        "vehicle" && (
                        <button
                          title="Assign driver"
                          onClick={() =>
                            openAction(
                              t,
                              "driver"
                            )
                          }
                        >
                          <UserRound
                            size={16}
                          />
                        </button>
                      )}

                      {mode !==
                        "driver" && (
                        <button
                          title="Assign vehicle"
                          onClick={() =>
                            openAction(
                              t,
                              "vehicle"
                            )
                          }
                        >
                          <Car size={16} />
                        </button>
                      )}

                      {mode !==
                        "driver" &&
                        mode !==
                          "vehicle" && (
                          <button
                            title="Reschedule"
                            onClick={() =>
                              openAction(
                                t,
                                "reschedule"
                              )
                            }
                          >
                            <RefreshCw
                              size={16}
                            />
                          </button>
                        )}

                      {![
                        "COMPLETED",
                        "CANCELLED",
                        "IN_PROGRESS",
                        "PAUSED"
                      ].includes(
                        t.tripStatus
                      ) && (
                        <button
                          className="danger"
                          title="Cancel"
                          onClick={() =>
                            openAction(
                              t,
                              "cancel"
                            )
                          }
                        >
                          <XCircle
                            size={16}
                          />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {modal && (
        <Modal
          onClose={() =>
            setModal(null)
          }
        >
          {modal.action ===
          "view" ? (
            <>
              <ModalHead
                title={`Trip Details — ${modal.trip.tripId}`}
                onClose={() =>
                  setModal(null)
                }
              />

              <DetailGrid
                values={[
                  [
                    "Trip ID",
                    modal.trip.tripId
                  ],
                  [
                    "Customer",
                    modal.trip.customer
                      ?.fullName ||
                      "—"
                  ],
                  [
                    "Pickup",
                    modal.trip
                      .pickupLocation
                  ],
                  [
                    "Destination",
                    modal.trip
                      .destination
                  ],
                  [
                    "Scheduled Start",
                    fmt(
                      modal.trip
                        .scheduledStart
                    )
                  ],
                  [
                    "Scheduled End",
                    fmt(
                      modal.trip
                        .scheduledEnd
                    )
                  ],
                  [
                    "Priority",
                    modal.trip
                      .priority ||
                      "NORMAL"
                  ],
                  [
                    "Driver",
                    modal.trip.driver
                      ?.fullName ||
                      "Unassigned"
                  ],
                  [
                    "Vehicle",
                    modal.trip.vehicle
                      ?.registrationNumber ||
                      "Unassigned"
                  ],
                  [
                    "Status",
                    label(
                      modal.trip
                        .tripStatus
                    )
                  ],
                  [
                    "Distance",
                    `${Number(
                      modal.trip
                        .distance ||
                        0
                    ).toLocaleString()} km`
                  ],
                  [
                    "Notes",
                    modal.trip
                      .notes ||
                      "—"
                  ]
                ]}
              />
            </>
          ) : (
            <form
              onSubmit={save}
            >
              <ModalHead
                title={`${
                  modal.action ===
                  "driver"
                    ? "Assign Driver"
                    : modal.action ===
                      "vehicle"
                    ? "Assign Vehicle"
                    : modal.action ===
                      "reschedule"
                    ? "Reschedule"
                    : "Cancel"
                } — ${
                  modal.trip.tripId
                }`}
                onClose={() =>
                  setModal(null)
                }
              />

              {[
                "driver",
                "vehicle"
              ].includes(
                modal.action
              ) ? (
                <label className="tm-modal-label">
                  {modal.action ===
                  "driver"
                    ? "Eligible Driver"
                    : "Eligible Vehicle"}

                  <select
                    required
                    value={
                      modal.value
                    }
                    onChange={(e) =>
                      setModal(
                        (m) => ({
                          ...m,
                          value:
                            e.target
                              .value
                        })
                      )
                    }
                  >
                    <option value="">
                      Select{" "}
                      {modal.action}
                    </option>

                    {candidates
                      .filter(
                        (x) =>
                          x.eligible
                      )
                      .map((x) => (
                        <option
                          key={x._id}
                          value={x._id}
                        >
                          {modal.action ===
                          "driver"
                            ? `${x.fullName} — ${x.status}`
                            : `${x.registrationNumber} — ${x.vehicleType} — cap ${x.capacity}`}
                        </option>
                      ))}
                  </select>
                </label>
              ) : modal.action ===
                "reschedule" ? (
                <div className="fm-form-grid">
                  <label>
                    New Start

                    <input
                      required
                      type="datetime-local"
                      value={
                        modal.scheduledStart
                      }
                      onChange={(e) =>
                        setModal(
                          (m) => ({
                            ...m,
                            scheduledStart:
                              e.target
                                .value
                          })
                        )
                      }
                    />
                  </label>

                  <label>
                    New End

                    <input
                      type="datetime-local"
                      value={
                        modal.scheduledEnd
                      }
                      onChange={(e) =>
                        setModal(
                          (m) => ({
                            ...m,
                            scheduledEnd:
                              e.target
                                .value
                          })
                        )
                      }
                    />
                  </label>

                  <label>
                    Reason

                    <textarea
                      required
                      value={
                        modal.reason
                      }
                      onChange={(e) =>
                        setModal(
                          (m) => ({
                            ...m,
                            reason:
                              e.target
                                .value
                          })
                        )
                      }
                    />
                  </label>
                </div>
              ) : (
                <label className="tm-modal-label">
                  Cancellation reason

                  <textarea
                    required
                    value={
                      modal.reason
                    }
                    onChange={(e) =>
                      setModal(
                        (m) => ({
                          ...m,
                          reason:
                            e.target
                              .value
                        })
                      )
                    }
                  />
                </label>
              )}

              <div className="fm-modal-foot">
                <button
                  type="button"
                  onClick={() =>
                    setModal(null)
                  }
                >
                  Cancel
                </button>

                <button
                  className={
                    modal.action ===
                    "cancel"
                      ? "danger"
                      : "primary"
                  }
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : modal.action ===
                      "cancel"
                    ? "Cancel Trip"
                    : "Save"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function TripListEndpoint({
  endpoint,
  title
}) {
  const [trips, setTrips] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const r =
          await apiRequest(
            `/api/trip-manager/${endpoint}`
          );

        setTrips(
          r.trips || []
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Toolbar
        title={title}
        subtitle="Live data from the existing Trip collection"
        onRefresh={load}
        loading={loading}
      />

      {error && (
        <Alert
          text={error}
          error
        />
      )}

      <div className="fm-card">
        {loading ? (
          <Loading
            text={`Loading ${title.toLowerCase()}...`}
          />
        ) : !trips.length ? (
          <Empty
            text={`No ${title.toLowerCase()} found.`}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Trip</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Scheduled</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>History</th>
              </tr>
            </thead>

            <tbody>
              {trips.map((t) => (
                <tr key={t._id}>
                  <td>
                    <strong>
                      {t.tripId}
                    </strong>
                  </td>

                  <td>
                    {t.customer
                      ?.fullName ||
                      "—"}
                  </td>

                  <td>
                    {t.pickupLocation} →{" "}
                    {t.destination}
                  </td>

                  <td>
                    {fmt(
                      t.scheduledStart
                    )}
                  </td>

                  <td>
                    {t.driver
                      ?.fullName ||
                      "—"}
                  </td>

                  <td>
                    {t.vehicle
                      ?.registrationNumber ||
                      "—"}
                  </td>

                  <td>
                    <span
                      className={`fm-badge ${cls(
                        t.tripStatus
                      )}`}
                    >
                      {label(
                        t.tripStatus
                      )}
                    </span>
                  </td>

                  <td>
                    {endpoint ===
                    "rescheduled"
                      ? `${
                          t
                            .rescheduleHistory
                            ?.length ||
                          0
                        } change(s)`
                      : endpoint ===
                        "cancelled"
                      ? t.cancellationReason ||
                        "—"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}

function Conflicts() {
  const [data, setData] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      setLoading(true);

      try {
        setData(
          await apiRequest(
            "/api/trip-manager/conflicts"
          )
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Toolbar
        title="Trip Conflicts"
        subtitle="Conflicts are detected on the backend from scheduled trip windows"
        onRefresh={load}
        loading={loading}
      />

      {error && (
        <Alert
          text={error}
          error
        />
      )}

      <div className="fm-card">
        {loading ? (
          <Loading text="Checking conflicts..." />
        ) : !data?.conflicts
            ?.length ? (
          <Empty text="No overlapping driver or vehicle trips detected." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Resource</th>
                <th>First Trip</th>
                <th>Second Trip</th>
                <th>Window</th>
              </tr>
            </thead>

            <tbody>
              {data.conflicts.map(
                (c, i) => (
                  <tr key={i}>
                    <td>
                      <span className="fm-badge pending">
                        {c.resource}
                      </span>
                    </td>

                    <td>
                      {c.first.tripId}

                      <small>
                        {c.first.driver
                          ?.fullName ||
                          c.first.vehicle
                            ?.registrationNumber ||
                          ""}
                      </small>
                    </td>

                    <td>
                      {c.second.tripId}

                      <small>
                        {c.second.driver
                          ?.fullName ||
                          c.second.vehicle
                            ?.registrationNumber ||
                          ""}
                      </small>
                    </td>

                    <td>
                      {fmt(
                        c.first
                          .scheduledStart
                      )}{" "}
                      →{" "}
                      {fmt(
                        c.second
                          .scheduledStart
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}

function Notifications() {
  const [data, setData] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      setLoading(true);

      try {
        setData(
          await apiRequest(
            "/api/trip-manager/notifications?limit=50"
          )
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Toolbar
        title="Notifications"
        subtitle="Your notifications stored in MongoDB"
        onRefresh={load}
        loading={loading}
      />

      {error && (
        <Alert
          text={error}
          error
        />
      )}

      <div className="fm-card">
        {loading ? (
          <Loading text="Loading notifications..." />
        ) : !data?.notifications
            ?.length ? (
          <Empty text="No notifications." />
        ) : (
          <div className="tm-notifications">
            {data.notifications.map(
              (n) => (
                <div key={n._id}>
                  <Bell size={18} />

                  <div>
                    <strong>
                      {n.title}
                    </strong>

                    <p>
                      {n.message}
                    </p>

                    <small>
                      {fmt(
                        n.createdAt
                      )}
                    </small>
                  </div>

                  <span
                    className={`fm-badge ${cls(
                      n.priority ||
                        "NORMAL"
                    )}`}
                  >
                    {label(
                      n.priority ||
                        "NORMAL"
                    )}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Profile() {
  let user = {};

  try {
    user = JSON.parse(
      sessionStorage.getItem(
        "fleetUser"
      ) || "{}"
    );
  } catch {}

  return (
    <>
      <Toolbar
        title="Profile"
        subtitle="Authenticated FleetFlow user"
      />

      <div className="fm-card">
        <DetailGrid
          values={[
            [
              "Name",
              user.fullName || "—"
            ],
            [
              "Email",
              user.email || "—"
            ],
            [
              "Phone",
              user.phone || "—"
            ],
            [
              "Role",
              user.role ===
              "DISPATCHER"
                ? "TRIP MANAGER"
                : user.role || "—"
            ],
            [
              "Account Status",
              user.accountStatus ||
                "ACTIVE"
            ]
          ]}
        />
      </div>
    </>
  );
}

function Toolbar({
  title,
  subtitle,
  onRefresh,
  loading
}) {
  return (
    <div className="fm-toolbar">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} />

          {loading
            ? "Refreshing..."
            : "Refresh"}
        </button>
      )}
    </div>
  );
}

function Alert({
  text,
  error = false
}) {
  return (
    <div
      className={`fm-alert ${
        error
          ? "error"
          : "success"
      }`}
    >
      {text}
    </div>
  );
}

function Loading({ text }) {
  return (
    <div className="fm-loading">
      <div className="spinner" />
      {text}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="fm-empty-state">
      <ClipboardList size={32} />
      <h3>{text}</h3>
    </div>
  );
}

function Table({ children }) {
  return (
    <div className="fm-table-wrap">
      <table className="fm-table">
        {children}
      </table>
    </div>
  );
}

function Pager({
  pagination,
  page,
  setPage
}) {
  return (
    <div className="tm-pager">
      <button
        disabled={
          !pagination.hasPrevPage
        }
        onClick={() =>
          setPage(page - 1)
        }
      >
        Previous
      </button>

      <span>
        Page {pagination.page} of{" "}
        {Math.max(
          1,
          pagination.totalPages
        )}
      </span>

      <button
        disabled={
          !pagination.hasNextPage
        }
        onClick={() =>
          setPage(page + 1)
        }
      >
        Next
      </button>
    </div>
  );
}

function Modal({
  children,
  onClose
}) {
  return (
    <div
      className="fm-modal-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="fm-modal wide"
        onMouseDown={(e) =>
          e.stopPropagation()
        }
      >
        {children}
      </div>
    </div>
  );
}

function ModalHead({
  title,
  onClose
}) {
  return (
    <div className="fm-modal-head">
      <h2>{title}</h2>

      <button
        type="button"
        onClick={onClose}
      >
        <X />
      </button>
    </div>
  );
}

function DetailGrid({
  values = []
}) {
  return (
    <div className="fm-detail-grid">
      {values.map(([a, b]) => (
        <div key={a}>
          <span>{a}</span>
          <strong>{b}</strong>
        </div>
      ))}
    </div>
  );
}