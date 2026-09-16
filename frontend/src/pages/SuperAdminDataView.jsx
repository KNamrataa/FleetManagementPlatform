import { useEffect, useMemo, useState } from "react";
import { getSocket } from "../services/socket";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Activity, Car, CircleDollarSign, FileText, Fuel, MapPin, ShieldCheck, Users, Wrench } from "lucide-react";
import "./SuperAdminDataView.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const date = (value) => value ? new Date(value).toLocaleString() : "—";
const status = (value) => value ? String(value).replaceAll("_", " ") : "—";
const name = (value) => value?.fullName || value?.name || "—";
const liveIcon = L.divIcon({ className:"sa-live-marker", html:"<div></div>", iconSize:[24,24], iconAnchor:[12,12] });

function DataCard({ label, value, icon }) {
  return <div className="sa-data-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Table({ columns, rows, empty = "No data available.", pagination, onPageChange, onExport, onExportPdf }) {
  return <div className="sa-table-wrap"><table className="sa-table"><thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row._id || row.id || row.reference || index}>{columns.map((c) => <td key={c.label}>{c.render ? c.render(row) : row[c.key] ?? "—"}</td>)}</tr>) : <tr><td colSpan={columns.length} className="sa-empty">{empty}</td></tr>}</tbody></table>{(pagination || onExport || onExportPdf) && <div className="sa-table-pager"><button className="sa-small-action" onClick={onExport} disabled={!onExport}>Export CSV</button>{onExportPdf && <button className="sa-small-action" onClick={onExportPdf}>Export PDF</button>}{pagination && <div><button className="sa-small-action" disabled={!pagination.hasPrevPage} onClick={() => onPageChange(pagination.page - 1)}>Previous</button><span style={{margin:"0 10px"}}>Page {pagination.page} of {Math.max(1,pagination.totalPages)}</span><button className="sa-small-action" disabled={!pagination.hasNextPage} onClick={() => onPageChange(pagination.page + 1)}>Next</button></div>}</div>}</div>;
}

export default function SuperAdminDataView({ view, data, pagination, onPageChange, onExport, onExportPdf, reportFrom, reportTo, setReportFrom, setReportTo }) {
  if (view === "trips") return <TripsView data={data} pagination={pagination} onPageChange={onPageChange} onExport={() => onExport("trips")} onExportPdf={() => onExportPdf("trips")} />;
  if (view === "tracking") return <TrackingView data={data} pagination={pagination} onPageChange={onPageChange} onExport={() => onExport("tracking")} onExportPdf={() => onExportPdf("tracking")} />;
  if (view === "fuel") return <FuelView data={data} pagination={pagination} onPageChange={onPageChange} onExport={() => onExport("fuel")} onExportPdf={() => onExportPdf("fuel")} />;
  if (view === "maintenance") {
  return (
    <MaintenanceView
      data={data}
      pagination={pagination}
      onPageChange={onPageChange}
      onExport={() => onExport("maintenance")} onExportPdf={() => onExportPdf("maintenance")}
    />
  );
}
  if (view === "expenses") return <ExpensesView data={data} pagination={pagination} onPageChange={onPageChange} onExport={() => onExport("expenses")} onExportPdf={() => onExportPdf("expenses")} />;
  if (view === "reports") return <ReportsView data={data} reportFrom={reportFrom} reportTo={reportTo} setReportFrom={setReportFrom} setReportTo={setReportTo} onExport={onExport} />;
  if (view === "settings") return <SettingsView data={data} />;
  return null;
}

function TripsView({ data, pagination, onPageChange, onExport, onExportPdf }) {
  const trips = data?.trips || [];
  const active = trips.filter((x) => ["ASSIGNED", "IN_PROGRESS", "PAUSED"].includes(x.tripStatus)).length;
  const completed = trips.filter((x) => x.tripStatus === "COMPLETED").length;
  return <>
    <div className="sa-data-cards"><DataCard label="Total Trips" value={trips.length} icon={<Activity />} /><DataCard label="Active Trips" value={active} icon={<Activity />} /><DataCard label="Completed" value={completed} icon={<ShieldCheck />} /></div>
    <section className="sa-data-panel"><div className="sa-panel-heading"><h2>Trip Management Data</h2><p>All trips currently stored in MongoDB.</p></div><Table columns={[
      { label: "Trip ID", render: (r) => r.tripId },
      { label: "Customer", render: (r) => name(r.customer) },
      { label: "Route", render: (r) => `${r.pickupLocation || "—"} → ${r.destination || "—"}` },
      { label: "Driver", render: (r) => name(r.driver) },
      { label: "Vehicle", render: (r) => r.vehicle?.registrationNumber || "—" },
      { label: "Schedule", render: (r) => date(r.scheduledStart) },
      { label: "Status", render: (r) => <span className={`sa-status ${String(r.tripStatus || "").toLowerCase()}`}>{status(r.tripStatus)}</span> },
    ]} rows={trips} pagination={pagination} onPageChange={onPageChange} onExport={onExport} onExportPdf={onExportPdf} /></section>
  </>;
}

function TrackingView({
  data,
  pagination,
  onPageChange,
  onExport,
  onExportPdf,
}) {
  const initialTracking = data?.tracking || [];

  const [trackingRows, setTrackingRows] =
    useState(initialTracking);

  const [socketConnected, setSocketConnected] =
    useState(false);

  useEffect(() => {
    setTrackingRows(data?.tracking || []);
  }, [data?.tracking]);

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      setSocketConnected(true);

      /*
       * Subscribe to every trip currently visible
       * in the Super Admin tracking table.
       */
      trackingRows.forEach((row) => {
        const tripId =
          row.trip?._id ||
          row.trip;

        if (tripId) {
          socket.emit(
            "trip:subscribe",
            { tripId: String(tripId) }
          );
        }
      });
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleGpsUpdate = (gps) => {
      const gpsTripId = String(
        gps?.trip?._id ||
        gps?.trip ||
        ""
      );

      if (!gpsTripId) return;

      setTrackingRows((previous) => {
        const index = previous.findIndex(
          (row) =>
            String(
              row.trip?._id ||
              row.trip ||
              ""
            ) === gpsTripId
        );

        if (index === -1) {
          /*
           * The REST endpoint may not have contained
           * this trip yet. Do not create an incomplete
           * row because vehicle/driver information may
           * be missing.
           */
          return previous;
        }

        const updated = [...previous];

        updated[index] = {
          ...updated[index],
          ...gps,
        };

        return updated;
      });
    };

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    socket.on(
      "trip:gps",
      handleGpsUpdate
    );

    if (socket.connected) {
      setSocketConnected(true);
      handleConnect();
    }

    return () => {
      trackingRows.forEach((row) => {
        const tripId =
          row.trip?._id ||
          row.trip;

        if (tripId) {
          socket.emit(
            "trip:unsubscribe",
            { tripId: String(tripId) }
          );
        }
      });

      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.off(
        "trip:gps",
        handleGpsUpdate
      );
    };

    /*
     * Subscribe when the currently displayed tracking
     * records change.
     */
  }, [trackingRows.length]);

  /*
   * Periodically refresh the REST data as a fallback.
   * Socket.IO handles the real-time updates, while this
   * makes the page recover if an event was missed.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      window.dispatchEvent(
        new CustomEvent("fleetflow-tracking-refresh")
      );
    }, 30000);

    return () =>
      clearInterval(interval);
  }, []);

  const tracking = trackingRows;

  const validCoordinates = tracking.filter(
    (x) =>
      Number.isFinite(Number(x.latitude)) &&
      Number.isFinite(Number(x.longitude))
  );

  const firstPosition =
    validCoordinates[0] || null;

  const movingVehicles = tracking.filter(
    (x) => Number(x.speed || 0) > 0
  ).length;

  const liveCount = tracking.filter(
    (x) => x.trackingStatus === "LIVE"
  ).length;

  return (
    <>
      <div className="sa-data-cards">

        <DataCard
          label="Tracked Trips"
          value={tracking.length}
          icon={<MapPin />}
        />

        <DataCard
          label="Live Vehicles"
          value={liveCount}
          icon={<Activity />}
        />

        <DataCard
          label="Moving Vehicles"
          value={movingVehicles}
          icon={<Car />}
        />

        <DataCard
          label="Connection"
          value={
            socketConnected
              ? "LIVE"
              : "RECONNECTING"
          }
          icon={<Activity />}
        />

      </div>

      <section className="sa-data-panel">

        <div className="sa-panel-heading">
          <h2>Live Fleet Map</h2>

          <p>
            Real-time GPS locations from active trips.
            Socket connection:
            {" "}
            <strong>
              {socketConnected
                ? "CONNECTED"
                : "RECONNECTING"}
            </strong>
          </p>
        </div>

        <div className="sa-admin-map">

          {validCoordinates.length > 0 ? (
            <MapContainer
              center={[
                Number(firstPosition.latitude),
                Number(firstPosition.longitude),
              ]}
              zoom={12}
              scrollWheelZoom
              style={{
                height: "360px",
                width: "100%",
              }}
            >

              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {validCoordinates.map((row) => (
                <Marker
                  key={row._id}
                  position={[
                    Number(row.latitude),
                    Number(row.longitude),
                  ]}
                  icon={liveIcon}
                >
                  <Popup>

                    <strong>
                      {row.vehicle
                        ?.registrationNumber ||
                        "Vehicle"}
                    </strong>

                    <br />

                    Trip:
                    {" "}
                    {row.trip?.tripId ||
                      "—"}

                    <br />

                    Driver:
                    {" "}
                    {name(row.driver)}

                    <br />

                    Status:
                    {" "}
                    {row.trackingStatus ||
                      "UNKNOWN"}

                    <br />

                    Speed:
                    {" "}
                    {Number(
                      row.speed || 0
                    ).toFixed(1)}
                    {" km/h"}

                    <br />

                    Updated:
                    {" "}
                    {date(
                      row.recordedAt
                    )}

                  </Popup>
                </Marker>
              ))}

            </MapContainer>
          ) : (
            <div className="sa-empty">
              No GPS coordinates available.
              Start an active driver trip and
              allow location access.
            </div>
          )}

        </div>

      </section>

      <section className="sa-data-panel">

        <div className="sa-panel-heading">
          <h2>Live Tracking</h2>

          <p>
            Latest GPS record for each tracked trip.
          </p>
        </div>

        <Table
          columns={[
            {
              label: "Trip",
              render: (r) =>
                r.trip?.tripId || "—",
            },

            {
              label: "Vehicle",
              render: (r) =>
                r.vehicle?.registrationNumber ||
                "—",
            },

            {
              label: "Driver",
              render: (r) =>
                name(r.driver),
            },

            {
              label: "Location",
              render: (r) =>
                r.currentLocation ||
                (
                  r.latitude != null &&
                  r.longitude != null
                    ? `${Number(r.latitude).toFixed(6)}, ${Number(r.longitude).toFixed(6)}`
                    : "Waiting for GPS"
                ),
            },

            {
              label: "GPS Status",
              render: (r) => (
                <span
                  className={`sa-status ${String(
                    r.trackingStatus || ""
                  ).toLowerCase()}`}
                >
                  {r.trackingStatus ||
                    "UNKNOWN"}
                </span>
              ),
            },

            {
              label: "Speed",
              render: (r) =>
                `${Number(
                  r.speed || 0
                ).toFixed(1)} km/h`,
            },

            {
              label: "Distance",
              render: (r) =>
                `${Number(
                  r.distanceTravelled || 0
                ).toFixed(2)} km`,
            },

            {
              label: "ETA",
              render: (r) =>
                date(
                  r.estimatedArrival
                ),
            },

            {
              label: "Updated",
              render: (r) =>
                date(
                  r.recordedAt
                ),
            },
          ]}
          rows={tracking}
          pagination={pagination}
          onPageChange={onPageChange}
          onExport={onExport}
          onExportPdf={onExportPdf}
        />

      </section>
    </>
  );
}

function FuelView({ data, pagination, onPageChange, onExport, onExportPdf }) {
  const fuel = data?.fuel || [];
  return <>
    <div className="sa-data-cards"><DataCard label="Fuel Entries" value={fuel.length} icon={<Fuel />} /><DataCard label="Total Fuel Cost" value={money(data?.total)} icon={<CircleDollarSign />} /><DataCard label="Litres Used" value={Number(data?.litres || 0).toLocaleString()} icon={<Fuel />} /></div>
    <section className="sa-data-panel"><div className="sa-panel-heading"><h2>Fuel Expenses</h2><p>Fuel transactions recorded across the fleet.</p></div><Table columns={[
      { label: "Fuel No.", render: (r) => r.fuelNumber },
      { label: "Date", render: (r) => date(r.fuelDate) },
      { label: "Vehicle", render: (r) => r.vehicle?.registrationNumber || "—" },
      { label: "Driver", render: (r) => name(r.driver) },
      { label: "Type", render: (r) => r.fuelType },
      { label: "Litres", render: (r) => Number(r.litres || 0) },
      { label: "Amount", render: (r) => money(r.totalAmount) },
      { label: "Station", render: (r) => r.fuelStation || "—" },
    ]} rows={fuel} pagination={pagination} onPageChange={onPageChange} onExport={onExport} onExportPdf={onExportPdf} /></section>
  </>;
}

function MaintenanceView({
  data,
  pagination,
  onPageChange,
  onExport,
  onExportPdf,
}) {
  const issues = data?.issues || [];
  const workOrders = data?.workOrders || [];
  const records = data?.records || [];
  const schedules = data?.schedules || [];

  const openIssues = issues.filter(
    (x) => !["RESOLVED", "CLOSED"].includes(x.status)
  ).length;

  const activeWorkOrders = workOrders.filter(
    (x) =>
      !["COMPLETED", "CANCELLED"].includes(x.status)
  ).length;

  const completedRecords = records.filter(
    (x) => x.completionDate
  ).length;

  return (
    <div className="sa-section-stack">

      {/* KPI CARDS */}
      <div className="sa-data-cards">

        <DataCard
          label="Open/Reported Issues"
          value={openIssues}
          icon={<Wrench />}
        />

        <DataCard
          label="Active Work Orders"
          value={activeWorkOrders}
          icon={<FileText />}
        />

        <DataCard
          label="Completed Services"
          value={completedRecords}
          icon={<ShieldCheck />}
        />

        <DataCard
          label="Maintenance Cost"
          value={money(data?.maintenanceCost)}
          icon={<CircleDollarSign />}
        />

      </div>

      {/* VEHICLE ISSUES */}
      <section className="sa-data-panel">

        <div className="sa-panel-heading">
          <h2>Vehicle Issues</h2>

          <p>
            Issues reported by drivers and other authorized users.
          </p>
        </div>

        <Table
          columns={[
            {
              label: "Vehicle",
              render: (r) =>
                r.vehicle?.registrationNumber ||
                r.vehicle?.vehicleNumber ||
                "—",
            },

            {
              label: "Reported By",
              render: (r) =>
                name(r.reportedBy),
            },

            {
              label: "Type",
              render: (r) =>
                r.issueType || "—",
            },

            {
              label: "Severity",
              render: (r) =>
                r.severity || "—",
            },

            {
              label: "Description",
              render: (r) =>
                r.description || "—",
            },

            {
              label: "Status",
              render: (r) => (
                <span
                  className={`sa-status ${String(
                    r.status || ""
                  ).toLowerCase()}`}
                >
                  {status(r.status)}
                </span>
              ),
            },

            {
              label: "Reported",
              render: (r) =>
                date(r.reportedAt || r.createdAt),
            },
          ]}
          rows={issues}
          pagination={pagination}
          onPageChange={onPageChange}
          onExport={onExport}
          onExportPdf={onExportPdf}
        />

      </section>

      {/* WORK ORDERS */}
      <section className="sa-data-panel">

        <div className="sa-panel-heading">
          <h2>Maintenance Work Orders</h2>

          <p>
            Current and historical maintenance work orders.
          </p>
        </div>

        <Table
          columns={[
            {
              label: "Work Order",
              render: (r) =>
                r.workOrderNumber || "—",
            },

            {
              label: "Vehicle",
              render: (r) =>
                r.vehicle?.registrationNumber ||
                r.vehicle?.vehicleNumber ||
                "—",
            },

            {
              label: "Type",
              render: (r) =>
                r.maintenanceType || "—",
            },

            {
              label: "Priority",
              render: (r) => (
                <span
                  className={`sa-status ${String(
                    r.priority || ""
                  ).toLowerCase()}`}
                >
                  {status(r.priority)}
                </span>
              ),
            },

            {
              label: "Mechanic",
              render: (r) =>
                r.assignedMechanic || "Not Assigned",
            },

            {
              label: "Status",
              render: (r) => (
                <span
                  className={`sa-status ${String(
                    r.status || ""
                  ).toLowerCase()}`}
                >
                  {status(r.status)}
                </span>
              ),
            },

            {
              label: "Cost",
              render: (r) =>
                money(r.totalCost),
            },

            {
              label: "Expected Completion",
              render: (r) =>
                date(r.expectedCompletionDate),
            },

            {
              label: "Completed",
              render: (r) =>
                date(r.completedDate),
            },
          ]}
          rows={workOrders}
          pagination={pagination}
          onPageChange={onPageChange}
          onExport={onExport}
          onExportPdf={onExportPdf}
        />

      </section>

      {/* SERVICE RECORDS */}
      <section className="sa-data-panel">

        <div className="sa-panel-heading">
          <h2>Maintenance Service Records</h2>

          <p>
            Completed maintenance and service history.
          </p>
        </div>

        <Table
          columns={[
            {
              label: "Vehicle",
              render: (r) =>
                r.vehicle?.registrationNumber ||
                r.vehicle?.vehicleNumber ||
                "—",
            },

            {
              label: "Service Type",
              render: (r) =>
                r.serviceType || "—",
            },

            {
              label: "Description",
              render: (r) =>
                r.description || "—",
            },

            {
              label: "Mechanic",
              render: (r) =>
                r.mechanic || "—",
            },

            {
              label: "Odometer",
              render: (r) =>
                r.odometer != null
                  ? `${Number(r.odometer).toLocaleString()} km`
                  : "—",
            },

            {
              label: "Labor Cost",
              render: (r) =>
                money(r.laborCost),
            },

            {
              label: "Parts Cost",
              render: (r) =>
                money(r.partsCost),
            },

            {
              label: "Total Cost",
              render: (r) =>
                money(r.totalCost),
            },

            {
              label: "Completed",
              render: (r) =>
                date(r.completionDate),
            },
          ]}
          rows={records}
          pagination={pagination}
          onPageChange={onPageChange}
          onExport={onExport}
          onExportPdf={onExportPdf}
        />

      </section>

      {/* SERVICE SCHEDULE */}
      <section className="sa-data-panel">

        <div className="sa-panel-heading">
          <h2>Service Schedule</h2>

          <p>
            Upcoming, due and overdue vehicle services.
          </p>
        </div>

        <Table
          columns={[
            {
              label: "Vehicle",
              render: (r) =>
                r.vehicle?.registrationNumber ||
                r.vehicle?.vehicleNumber ||
                "—",
            },

            {
              label: "Service",
              render: (r) =>
                r.serviceType || "—",
            },

            {
              label: "Description",
              render: (r) =>
                r.description || "—",
            },

            {
              label: "Last Service",
              render: (r) =>
                date(r.lastServiceDate),
            },

            {
              label: "Next Service",
              render: (r) =>
                date(r.nextServiceDate),
            },

            {
              label: "Next Odometer",
              render: (r) =>
                r.nextServiceOdometer != null
                  ? `${Number(
                      r.nextServiceOdometer
                    ).toLocaleString()} km`
                  : "—",
            },

            {
              label: "Status",
              render: (r) => (
                <span
                  className={`sa-status ${String(
                    r.status || ""
                  ).toLowerCase()}`}
                >
                  {status(r.status)}
                </span>
              ),
            },
          ]}
          rows={schedules}
          pagination={pagination}
          onPageChange={onPageChange}
          onExport={onExport}
          onExportPdf={onExportPdf}
        />

      </section>

    </div>
  );
}

function ExpensesView({ data, pagination, onPageChange, onExport, onExportPdf }) {
  const expenses = data?.expenses || [];
  const payments = data?.payments || [];
  return <div className="sa-section-stack">
    <div className="sa-data-cards"><DataCard label="Expense Records" value={expenses.length} icon={<CircleDollarSign />} /><DataCard label="Total Expenses" value={money(data?.totalExpenses)} icon={<CircleDollarSign />} /><DataCard label="Payments Recorded" value={payments.length} icon={<ShieldCheck />} /><DataCard label="Payment Amount" value={money(data?.totalPayments)} icon={<CircleDollarSign />} /></div>
    <section className="sa-data-panel"><div className="sa-panel-heading"><h2>Fleet Expenses</h2><p>General, trip, driver and fuel expenses combined for monitoring.</p></div><Table columns={[
      { label: "Reference", render: (r) => r.reference },
      { label: "Source", render: (r) => r.source },
      { label: "Category", render: (r) => r.category || "FUEL" },
      { label: "Description", render: (r) => r.description || `${r.fuelType || "Fuel"} purchase` },
      { label: "Date", render: (r) => date(r.date) },
      { label: "Amount", render: (r) => money(r.amount) },
      { label: "Status", render: (r) => status(r.status) },
    ]} rows={expenses} pagination={pagination} onPageChange={onPageChange} onExport={onExport} onExportPdf={onExportPdf} /></section>
    <section className="sa-data-panel"><div className="sa-panel-heading"><h2>Payments</h2><p>Received and paid payment records.</p></div><Table columns={[
      { label: "Payment No.", render: (r) => r.paymentNumber },
      { label: "Type", render: (r) => r.type },
      { label: "Invoice", render: (r) => r.invoice?.invoiceNumber || "—" },
      { label: "Customer", render: (r) => name(r.customer) },
      { label: "Amount", render: (r) => money(r.amount) },
      { label: "Date", render: (r) => date(r.paymentDate) },
      { label: "Status", render: (r) => status(r.status) },
    ]} rows={payments} pagination={pagination} onPageChange={onPageChange} onExport={onExport} onExportPdf={onExportPdf} /></section>
  </div>;
}

function ReportsView({ data, reportFrom, reportTo, setReportFrom, setReportTo, onExport }) {
  const totals = data?.totals || {};
  const roleRows = data?.usersByRole || [];
  const vehicleRows = data?.vehicleStatus || [];
  const tripRows = data?.tripStatus || [];
  const expenseRows = data?.expenseByCategory || [];
  const invoiceRows = data?.invoiceStatus || [];
  return <div className="sa-section-stack">
    <div className="sa-data-cards"><DataCard label="Revenue" value={money(totals.revenue)} icon={<CircleDollarSign />} /><DataCard label="Paid Revenue" value={money(totals.paidRevenue)} icon={<ShieldCheck />} /><DataCard label="Outstanding" value={money(totals.outstandingRevenue)} icon={<CircleDollarSign />} /><DataCard label="All Expenses" value={money(Number(totals.fuel || 0) + Number(totals.tripExpenses || 0) + Number(totals.driverExpenses || 0) + Number(totals.generalExpenses || 0))} icon={<FileText />} /></div>
    <div className="sa-data-panel"><div className="sa-panel-heading"><h2>Trip Activity</h2><p>Trips scheduled by day in the selected report scope.</p></div><MiniBars rows={data?.monthlyTrips || []} valueKey="count" /></div>
    <div className="sa-data-panel"><div className="sa-panel-heading"><h2>Expense Trend</h2><p>General expense amount by day.</p></div><MiniBars rows={data?.monthlyExpenses || []} valueKey="amount" money /></div>
    <div className="sa-report-grid">
      <ReportList title="Users by Role" rows={roleRows} />
      <ReportList title="Fleet by Status" rows={vehicleRows} />
      <ReportList title="Trips by Status" rows={tripRows} />
      <ReportList title="Expense by Category" rows={expenseRows} moneyField="amount" />
      <ReportList title="Invoices by Status" rows={invoiceRows} moneyField="total" />
      <ReportList title="Budget Summary" rows={data?.budgetSummary || []} moneyField="allocated" />
      <section className="sa-data-panel sa-report-panel"><div className="sa-panel-heading"><h2>Vehicle Utilization</h2><p>Completed/recorded trip activity by vehicle.</p></div><div className="sa-report-list">{(data?.utilization||[]).length?(data.utilization.map((row,i)=><div className="sa-report-row" key={i}><span>{row.registrationNumber || row.vehicleId || "Vehicle"}</span><strong>{row.utilizationPercent}% · {row.trips} trips · {Number(row.distance||0).toFixed(1)} km</strong></div>)):<div className="sa-empty">No utilization data.</div>}</div></section>
    </div>
  </div>;
}

function MiniBars({ rows, valueKey, money: moneyMode = false }) {
  const max = Math.max(1, ...rows.map(r => Number(r[valueKey] || 0)));
  return <div className="sa-mini-bars">{rows.length ? rows.slice(-14).map((r, i) => <div className="sa-mini-bar" key={`${r._id}-${i}`}><div className="sa-mini-bar-track"><span style={{height:`${Math.max(4,(Number(r[valueKey]||0)/max)*100)}%`}} title={moneyMode ? money(r[valueKey]) : r[valueKey]} /></div><small>{String(r._id).slice(5)}</small></div>) : <div className="sa-empty">No trend data.</div>}</div>;
}

function ReportList({ title, rows, moneyField }) {
  return <section className="sa-data-panel sa-report-panel"><div className="sa-panel-heading"><h2>{title}</h2></div><div className="sa-report-list">{rows.length ? rows.map((row, i) => <div className="sa-report-row" key={`${row._id || "row"}-${i}`}><span>{status(row._id)}</span><strong>{moneyField ? money(row[moneyField]) : row.count ?? "—"}</strong></div>) : <div className="sa-empty">No report data.</div>}</div></section>;
}

function SettingsView({ data }) {
  const profile = data?.profile || {};
  const system = data?.system || {};
  const entries = useMemo(() => Object.entries(system), [system]);
  return <div className="sa-section-stack">
    <section className="sa-data-panel"><div className="sa-panel-heading"><h2>Super Admin Account</h2><p>Current authenticated administrator information.</p></div><div className="sa-settings-grid"><div><small>Full Name</small><strong>{profile.fullName || "—"}</strong></div><div><small>Email</small><strong>{profile.email || "—"}</strong></div><div><small>Phone</small><strong>{profile.phone || "—"}</strong></div><div><small>Role</small><strong>{status(profile.role)}</strong></div><div><small>Account Status</small><strong>{profile.accountStatus || "—"}</strong></div><div><small>Last Login</small><strong>{date(profile.lastLoginAt)}</strong></div><div><small>Security</small><strong><a href="/change-password" className="sa-small-action">Change Password</a></strong></div></div></section>
    <section className="sa-data-panel"><div className="sa-panel-heading"><h2>FleetFlow System Configuration</h2><p>Read-only runtime configuration currently used by the application.</p></div><div className="sa-settings-grid">{entries.map(([key, value]) => <div key={key}><small>{key.replaceAll(/([A-Z])/g, " $1")}</small><strong>{String(value)}</strong></div>)}</div></section>
    <section className="sa-data-panel"><div className="sa-panel-heading"><h2>Recent Audit Activity</h2><p>Changes made through the FleetFlow API by authenticated users.</p></div><Table columns={[{label:"Time",render:r=>date(r.createdAt)},{label:"Actor",render:r=>name(r.actor)},{label:"Role",render:r=>status(r.actor?.role)},{label:"Action",render:r=>r.action},{label:"Status",render:r=>r.statusCode}]} rows={data?.auditLogs||[]} /></section>
  </div>;
}
