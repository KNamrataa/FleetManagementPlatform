import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardList, Link2, RefreshCw, Unlink, X } from "lucide-react";
import FleetManagerLayout from "./FleetManagerLayout";
import { apiRequest } from "../services/api";
import { Pagination } from "../components/Pagination";


const ASSIGNMENT_SELECT_STYLES = `
  .fm-custom-select {
    position: relative;
    width: 100%;
    min-width: 0;
  }
  .fm-custom-select.open { z-index: 30; }
  .fm-custom-select-label {
    display: block;
    margin-bottom: 6px;
    color: #334155;
    font-size: 12px;
    font-weight: 600;
  }
  .fm-custom-select-trigger {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid #d8e0ea;
    border-radius: 8px;
    background: #fff;
    color: #64748b;
    outline: 0;
    cursor: pointer;
    text-align: left;
    box-sizing: border-box;
  }
  .fm-custom-select-trigger:hover,
  .fm-custom-select-trigger:focus-visible,
  .fm-custom-select.open .fm-custom-select-trigger {
    border-color: #b8c4d4;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
  }
  .fm-custom-select-trigger.has-value { color: #334155; }
  .fm-custom-select-trigger > svg {
    flex: 0 0 auto;
    color: #64748b;
    transition: transform 0.15s ease;
  }
  .fm-custom-select.open .fm-custom-select-trigger > svg { transform: rotate(180deg); }
  .fm-custom-select-value {
    display: block;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fm-custom-select-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 100%;
    max-width: 100%;
    max-height: 240px;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 4px;
    box-sizing: border-box;
    border: 1px solid #d8e0ea;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
    z-index: 1000;
  }
  .fm-custom-select-option {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 9px 10px;
    display: block;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #334155;
    cursor: pointer;
    text-align: left;
    font: inherit;
    font-size: 13px;
    box-sizing: border-box;
  }
  .fm-custom-select-option span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fm-custom-select-option:hover,
  .fm-custom-select-option:focus-visible,
  .fm-custom-select-option.selected {
    background: #eef2f7;
    outline: 0;
  }
  .fm-custom-select-option.selected { color: #172033; font-weight: 600; }
  .fm-custom-select-empty {
    padding: 12px 10px;
    color: #64748b;
    font-size: 13px;
    text-align: center;
  }
  @media (max-width: 650px) {
    .fm-custom-select-trigger { min-height: 44px; }
    .fm-custom-select-menu { max-height: 220px; }
    .fm-custom-select-option { min-height: 42px; padding: 10px; }
  }
`;

function AssignmentSelect({ id, label, value, options, placeholder, onChange, getLabel }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = options.find((option) => option._id === value);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={`fm-custom-select ${open ? "open" : ""}`} ref={containerRef}>
      <label className="fm-custom-select-label" htmlFor={id}>
        {label}
      </label>
      <button
        id={id}
        type="button"
        className={`fm-custom-select-trigger ${selected ? "has-value" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="fm-custom-select-value" title={selected ? getLabel(selected) : placeholder}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>

      {open && (
        <div id={`${id}-options`} className="fm-custom-select-menu" role="listbox" aria-label={label}>
          {options.length === 0 ? (
            <div className="fm-custom-select-empty">No {label.toLowerCase()} available</div>
          ) : (
            options.map((option) => {
              const optionLabel = getLabel(option);
              const isSelected = option._id === value;

              return (
                <button
                  key={option._id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`fm-custom-select-option ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    onChange(option._id);
                    setOpen(false);
                  }}
                  title={optionLabel}
                >
                  <span>{optionLabel}</span>
                </button>
              );
            })
          )}
        </div>
      )}
      </div>
  );
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState([]),
    [pagination, setPagination] = useState(null),
    [page, setPage] = useState(1),
    [limit, setLimit] = useState(10),
    [vehicles, setVehicles] = useState([]),
    [drivers, setDrivers] = useState([]),
    [vehicleId, setVehicleId] = useState(""),
    [driverId, setDriverId] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, v, d] = await Promise.all([
        apiRequest(`/api/assignments?page=${page}&limit=${limit}`),
        apiRequest("/api/vehicles?page=1&limit=100"),
        apiRequest("/api/drivers?page=1&limit=100"),
      ]);
      setAssignments(a.assignments || []);
      setPagination(a.pagination || null);
      setVehicles(v.vehicles || []);
      setDrivers(d.drivers || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const assign = async (e) => {
    e.preventDefault();
    if (!vehicleId || !driverId) return;
    setSaving(true);
    try {
      const r = await apiRequest("/api/assignments", {
        method: "POST",
        body: JSON.stringify({ vehicleId, driverId }),
      });
      setSuccess(r.message);
      setVehicleId("");
      setDriverId("");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Remove this assignment?")) return;
    try {
      const r = await apiRequest(`/api/assignments/${id}`, { method: "DELETE" });
      setSuccess(r.message);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const availableVehicles = vehicles.filter(
    (v) => v.status === "AVAILABLE" && !v.assignedDriver
  );
  const availableDrivers = drivers.filter(
    (d) => d.status === "AVAILABLE" && !d.assignedVehicle
  );

  return (
    <FleetManagerLayout
      title="Vehicle / Driver Assignments"
      subtitle="Maintain one active driver-to-vehicle assignment at a time"
    >
      <style>{ASSIGNMENT_SELECT_STYLES}</style>
      <div className="fm-toolbar">
        <div>
          <h2>Assignments</h2>
          <p>Assignments are persisted in MongoDB.</p>
        </div>
        <button onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="fm-alert error">{error}</div>}
      {success && (
        <div className="fm-alert success">
          {success}
          <button onClick={() => setSuccess("")}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="fm-grid-2">
        <section className="fm-card">
          <h2>
            <Link2 size={19} /> New Assignment
          </h2>
          <form onSubmit={assign} className="fm-stack">
            <AssignmentSelect
              id="assignment-vehicle"
              label="Vehicle"
              value={vehicleId}
              options={availableVehicles}
              placeholder="Select vehicle"
              onChange={setVehicleId}
              getLabel={(v) => `${v.registrationNumber} — ${v.make} ${v.model}`}
            />

            <AssignmentSelect
              id="assignment-driver"
              label="Driver"
              value={driverId}
              options={availableDrivers}
              placeholder="Select driver"
              onChange={setDriverId}
              getLabel={(d) => `${d.fullName} — ${d.profile?.licenseNumber || "No license"}`}
            />

            <button className="primary" disabled={saving}>
              {saving ? "Assigning..." : "Assign Driver"}
            </button>
          </form>
        </section>

        <section className="fm-card">
          <h2>
            <ClipboardList size={19} /> Current Assignments
          </h2>
          {loading ? (
            <div className="fm-loading">
              <div className="spinner" /> Loading...
            </div>
          ) : assignments.length === 0 ? (
            <div className="fm-empty-state">
              <p>No active assignments.</p>
            </div>
          ) : (
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Assigned At</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a._id}>
                      <td>
                        <strong>{a.vehicle?.registrationNumber}</strong>
                        <small>{a.vehicle?.vehicleType}</small>
                      </td>
                      <td>
                        {a.driver?.fullName}
                        <small>{a.driver?.phone || ""}</small>
                      </td>
                      <td>{a.vehicle?.status}</td>
                      <td>{new Date(a.assignedAt).toLocaleString()}</td>
                      <td>
                        <button className="fm-text-danger" onClick={() => remove(a._id)}>
                          <Unlink size={15} /> Unassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={pagination?.page || page}
            totalPages={pagination?.totalPages || 1}
            total={pagination?.total || assignments.length}
            limit={pagination?.limit || 10}
            onPageChange={setPage}
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
          />
        </section>
      </div>
    </FleetManagerLayout>
  );
}
