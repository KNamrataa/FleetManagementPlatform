import { useCallback, useEffect, useState } from "react";
import {
  Car,
  CheckCircle,
  FileText,
  Gauge,
  RefreshCw,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { apiRequest } from "../services/api";
import { useLocation, useNavigate } from "react-router-dom";
import DriverLayout from "./DriverLayout";
import "./DriverDashboard.css";

const cls = (s = "") => s.toLowerCase().replaceAll("_", "-");
const label = (s = "") => s.replaceAll("_", " ");

const empty = {
  registrationNumber: "",
  vehicleNumber: "",
  vehicleType: "Truck",
  make: "",
  model: "",
  year: new Date().getFullYear(),
  fuelType: "DIESEL",
  capacity: 0,
  currentOdometer: 0,
};

const documentTypes = ["RC", "INSURANCE", "PUC", "PERMIT", "OTHER"];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);

    reader.onerror = () =>
      reject(new Error("Unable to read the selected document."));

    reader.readAsDataURL(file);
  });
}

export default function DriverVehicle() {
  const routerLocation = useLocation();
  const navigate = useNavigate();

  const [v, setV] = useState(null);
  const [driverType, setDriverType] = useState("COMPANY_DRIVER");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState("RC");
  const [documentExpiry, setDocumentExpiry] = useState("");

  const registrationRoute =
    routerLocation.pathname === "/driver/vehicle/register";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest("/api/driver/vehicle");

      setDriverType(response.driverType || "COMPANY_DRIVER");
      setV(response.vehicle || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (registrationRoute && !v && !editing) {
      setForm(empty);
      setEditing(true);
      setError("");
      setMessage("");
    }
  }, [registrationRoute, v, editing]);

  const beginEdit = () => {
    setError("");
    setMessage("");

    if (!v) {
      setForm(empty);
      setEditing(true);
      return;
    }

    setForm({
      registrationNumber: v.registrationNumber || "",
      vehicleNumber: v.vehicleNumber || "",
      vehicleType: v.vehicleType || "Truck",
      make: v.make || "",
      model: v.model || "",
      year: v.year || new Date().getFullYear(),
      fuelType: v.fuelType || "DIESEL",
      capacity: v.capacity || 0,
      currentOdometer: v.currentOdometer || 0,
    });

    setEditing(true);
  };

  const openRegistration = () => {
    setError("");
    setMessage("");
    setForm(empty);
    setEditing(true);

    navigate("/driver/vehicle/register");
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(empty);
    setError("");
    setMessage("");

    if (registrationRoute) {
      navigate("/driver/vehicle", { replace: true });
    }
  };

  const saveOwnerVehicle = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const path = v
        ? `/api/driver/vehicle/${v._id}`
        : "/api/driver/vehicle";

      const response = await apiRequest(path, {
        method: v ? "PUT" : "POST",
        body: JSON.stringify(form),
      });

      setMessage(response.message);
      setV(response.vehicle);
      setEditing(false);
      setForm(empty);

      navigate("/driver/vehicle", { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file || !v) return;

    if (file.size > 2.5 * 1024 * 1024) {
      setError("Please select a document smaller than 2.5 MB.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const data = await fileToDataUrl(file);

      const response = await apiRequest(
        `/api/driver/vehicle/${v._id}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            documentType,
            fileName: file.name,
            data,
            mimeType: file.type || "application/octet-stream",
            expiryDate: documentExpiry || null,
          }),
        }
      );

      setV(response.vehicle);
      setMessage(response.message);
      setDocumentExpiry("");
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const submitApproval = async () => {
    if (!v) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/driver/vehicle/${v._id}/submit-approval`,
        {
          method: "POST",
        }
      );

      setV(response.vehicle);
      setMessage(response.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const approval = v?.approvalStatus || "APPROVED";
  const docs = v?.documents || [];

  const isOwner = driverType === "OWNER_DRIVER";

  return (
    <DriverLayout
      title="My Vehicle"
      subtitle={
        isOwner
          ? "Manage your driver-owned vehicle and approval status"
          : "View the vehicle currently assigned to you"
      }
    >
      <div className="driver-toolbar">
        <div>
          <h2>{isOwner ? "My Vehicle" : "Assigned Vehicle"}</h2>

          <p>
            {isOwner
              ? "Your vehicle is linked to your Owner-Driver account."
              : "Fleet-controlled vehicle information"}
          </p>
        </div>

        <button
          className="driver-button"
          onClick={load}
          disabled={loading}
          type="button"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && <div className="driver-alert error">{error}</div>}

      {message && <div className="driver-alert success">{message}</div>}

      {loading ? (
        <div className="driver-loading">
          <div className="driver-loading-text">
            <div className="driver-spinner" />
            <p>Loading vehicle...</p>
          </div>
        </div>
      ) : registrationRoute && !v ? (
        
        <section className="driver-panel">
          <div className="driver-toolbar">
            <div>
              <h2>Register My Vehicle</h2>

              <p>
                Enter your vehicle details. Your vehicle will be submitted for
                Fleet Manager approval.
              </p>
            </div>

            <button
              className="driver-button"
              type="button"
              onClick={cancelEdit}
            >
              <X size={16} />
              Cancel
            </button>
          </div>

          <form onSubmit={saveOwnerVehicle}>
            <div className="driver-detail-grid">
              {[
                ["registrationNumber", "Registration Number", "text"],
                ["vehicleNumber", "Vehicle Number", "text"],
                ["vehicleType", "Vehicle Type", "text"],
                ["make", "Make", "text"],
                ["model", "Model", "text"],
                ["year", "Year", "number"],
                ["capacity", "Capacity", "number"],
                ["currentOdometer", "Current Odometer", "number"],
              ].map(([key, labelText, type]) => (
                <label className="driver-detail" key={key}>
                  <span>{labelText}</span>

                  <input
                    className="driver-input"
                    required
                    type={type}
                    value={form[key] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [key]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}

              <label className="driver-detail">
                <span>Fuel Type</span>

                <select
                  className="driver-select"
                  value={form.fuelType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fuelType: e.target.value,
                    })
                  }
                >
                  {[
                    "PETROL",
                    "DIESEL",
                    "CNG",
                    "ELECTRIC",
                    "HYBRID",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className="driver-actions"
              style={{ marginTop: 18 }}
            >
              <button
                className="driver-button primary"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </form>
        </section>
      ) : !isOwner ? (
        v ? (
          <section className="driver-panel">
            <div
              className="driver-inline"
              style={{ marginBottom: 18 }}
            >
              <div className="driver-card-icon">
                <Car size={23} />
              </div>

              <div>
                <h2 style={{ margin: 0 }}>
                  {v.registrationNumber}
                </h2>

                <span className="driver-muted">
                  {v.make} {v.model} · {v.vehicleType}
                </span>
              </div>

              <span
                className={`driver-badge ${cls(v.status)}`}
                style={{ marginLeft: "auto" }}
              >
                {label(v.status)}
              </span>
            </div>

            <div className="driver-detail-grid">
              {[
                ["Registration", v.registrationNumber],
                ["Vehicle Number", v.vehicleNumber || "—"],
                ["Type", v.vehicleType],
                ["Make", v.make],
                ["Model", v.model],
                ["Year", v.year],
                ["Fuel", v.fuelType],
                ["Capacity", v.capacity],
                [
                  "Current Odometer",
                  `${Number(
                    v.currentOdometer || 0
                  ).toLocaleString()} km`,
                ],
                ["Status", label(v.status)],
              ].map(([a, b]) => (
                <div className="driver-detail" key={a}>
                  <span>{a}</span>
                  <strong>{b}</strong>
                </div>
              ))}
            </div>

            <section
              className="driver-panel"
              style={{ marginTop: 18 }}
            >
              <h2>Vehicle Readiness</h2>

              <p className="driver-muted">
                Vehicle fields are controlled by Fleet Management. You can
                report issues from the Vehicle Issues section.
              </p>

              <button
                className="driver-button primary"
                type="button"
                onClick={() => navigate("/driver/issues")}
              >
                <Gauge size={16} />
                Report / View Issues
              </button>
            </section>
          </section>
        ) : (
          <section className="driver-panel">
            <div className="driver-empty">
              <Car size={42} />

              <h3>No vehicle is currently assigned to you.</h3>

              <p>
                Contact your Fleet Manager if you need a vehicle assignment.
              </p>
            </div>
          </section>
        )
      ) : (
        <>
          {!v && !editing && (
            <section className="driver-panel">
              <div className="driver-empty">
                <Car size={42} />

                <h3>Register your own vehicle</h3>

                <p>
                  Register a vehicle to use it for FleetFlow trips after
                  Fleet Manager approval.
                </p>

                <button
                  type="button"
                  className="driver-button primary"
                  onClick={openRegistration}
                >
                  <Car size={16} />
                  Register Vehicle
                </button>
              </div>
            </section>
          )}

          {editing && (
            <section className="driver-panel">
              <div className="driver-toolbar">
                <div>
                  <h2>
                    {v ? "Edit My Vehicle" : "Register My Vehicle"}
                  </h2>

                  <p>
                    Vehicle ownership is automatically assigned to your
                    authenticated Owner-Driver account.
                  </p>
                </div>

                <button
                  className="driver-button"
                  type="button"
                  onClick={cancelEdit}
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>

              <form onSubmit={saveOwnerVehicle}>
                <div className="driver-detail-grid">
                  {[
                    [
                      "registrationNumber",
                      "Registration Number",
                      "text",
                    ],
                    ["vehicleNumber", "Vehicle Number", "text"],
                    ["vehicleType", "Vehicle Type", "text"],
                    ["make", "Make", "text"],
                    ["model", "Model", "text"],
                    ["year", "Year", "number"],
                    ["capacity", "Capacity", "number"],
                    [
                      "currentOdometer",
                      "Current Odometer",
                      "number",
                    ],
                  ].map(([key, labelText, type]) => (
                    <label
                      className="driver-detail"
                      key={key}
                    >
                      <span>{labelText}</span>

                      <input
                        className="driver-input"
                        required
                        type={type}
                        value={form[key] ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [key]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}

                  <label className="driver-detail">
                    <span>Fuel Type</span>

                    <select
                      className="driver-select"
                      value={form.fuelType}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          fuelType: e.target.value,
                        })
                      }
                    >
                      {[
                        "PETROL",
                        "DIESEL",
                        "CNG",
                        "ELECTRIC",
                        "HYBRID",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div
                  className="driver-actions"
                  style={{ marginTop: 18 }}
                >
                  <button
                    className="driver-button primary"
                    disabled={saving}
                    type="submit"
                  >
                    {saving ? "Saving..." : "Save Vehicle"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {v && !editing && (
            <>
              <section className="driver-panel">
                <div
                  className="driver-inline"
                  style={{ marginBottom: 18 }}
                >
                  <div className="driver-card-icon">
                    <Car size={23} />
                  </div>

                  <div>
                    <h2 style={{ margin: 0 }}>
                      {v.registrationNumber}
                    </h2>

                    <span className="driver-muted">
                      {v.make} {v.model} · {v.vehicleType}
                    </span>
                  </div>

                  <span
                    className={`driver-badge ${cls(v.status)}`}
                    style={{ marginLeft: "auto" }}
                  >
                    {label(v.status)}
                  </span>
                </div>

                <div className="driver-detail-grid">
                  {[
                    ["Registration", v.registrationNumber],
                    [
                      "Vehicle Number",
                      v.vehicleNumber || "—",
                    ],
                    ["Type", v.vehicleType],
                    ["Make", v.make],
                    ["Model", v.model],
                    ["Year", v.year],
                    ["Fuel", v.fuelType],
                    ["Capacity", v.capacity],
                    [
                      "Current Odometer",
                      `${Number(
                        v.currentOdometer || 0
                      ).toLocaleString()} km`,
                    ],
                    [
                      "Ownership",
                      label(v.ownershipType || "DRIVER_OWNED"),
                    ],
                    ["Approval Status", label(approval)],
                    [
                      "Approval Reason",
                      v.approvalReason || "—",
                    ],
                  ].map(([a, b]) => (
                    <div className="driver-detail" key={a}>
                      <span>{a}</span>
                      <strong>{b}</strong>
                    </div>
                  ))}
                </div>

                <div
                  className="driver-actions"
                  style={{ marginTop: 18 }}
                >
                  <button
                    className="driver-button"
                    type="button"
                    onClick={beginEdit}
                  >
                    <Car size={16} />
                    Edit Vehicle
                  </button>
                </div>
              </section>

              <section
                className="driver-panel"
                style={{ marginTop: 18 }}
              >
                <div className="driver-toolbar">
                  <div>
                    <h2>Vehicle Documents</h2>

                    <p>
                      Upload RC and Insurance before requesting
                      approval.
                    </p>
                  </div>

                  <div className="driver-inline">
                    <select
                      className="driver-select"
                      value={documentType}
                      onChange={(e) =>
                        setDocumentType(e.target.value)
                      }
                    >
                      {documentTypes.map((x) => (
                        <option key={x} value={x}>
                          {label(x)}
                        </option>
                      ))}
                    </select>

                    <label
                      className="driver-button primary"
                      style={{
                        cursor: uploading
                          ? "not-allowed"
                          : "pointer",
                      }}
                    >
                      <Upload size={16} />

                      {uploading
                        ? "Uploading..."
                        : "Upload Document"}

                      <input
                        type="file"
                        hidden
                        accept="image/*,.pdf"
                        disabled={uploading}
                        onChange={uploadDocument}
                      />
                    </label>
                  </div>
                </div>

                <div className="driver-detail-grid">
                  <label className="driver-detail">
                    <span>
                      Document expiry (optional)
                    </span>

                    <input
                      className="driver-input"
                      type="date"
                      value={documentExpiry}
                      onChange={(e) =>
                        setDocumentExpiry(e.target.value)
                      }
                    />
                  </label>
                </div>

                {docs.length ? (
                  <div className="driver-table-wrap">
                    <table className="driver-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>File</th>
                          <th>Expiry</th>
                          <th>Uploaded</th>
                          <th>Open</th>
                        </tr>
                      </thead>

                      <tbody>
                        {docs.map((doc) => (
                          <tr
                            key={`${doc.documentType}-${doc.uploadedAt}`}
                          >
                            <td>
                              {label(doc.documentType)}
                            </td>

                            <td>{doc.fileName}</td>

                            <td>
                              {doc.expiryDate
                                ? new Date(
                                    doc.expiryDate
                                  ).toLocaleDateString()
                                : "—"}
                            </td>

                            <td>
                              {doc.uploadedAt
                                ? new Date(
                                    doc.uploadedAt
                                  ).toLocaleString()
                                : "—"}
                            </td>

                            <td>
                              <a
                                className="driver-button"
                                href={doc.data}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <FileText size={15} />
                                View
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="driver-empty">
                    <FileText size={34} />

                    <h3>
                      No vehicle documents uploaded
                    </h3>

                    <p>
                      Upload at least the RC and Insurance
                      documents before submission.
                    </p>
                  </div>
                )}
              </section>

              <section
                className="driver-panel"
                style={{ marginTop: 18 }}
              >
                <h2>Approval</h2>

                <div
                  className="driver-inline"
                  style={{ marginBottom: 12 }}
                >
                  {approval === "APPROVED" ? (
                    <CheckCircle size={20} />
                  ) : (
                    <XCircle size={20} />
                  )}

                  <strong>{label(approval)}</strong>
                </div>

                <p className="driver-muted">
                  Only Fleet Manager or Super Admin can approve a
                  driver-owned vehicle. A pending, rejected, or
                  suspended vehicle is not eligible for new trips.
                </p>

                {["PENDING_APPROVAL", "REJECTED"].includes(
                  approval
                ) && (
                  <button
                    className="driver-button primary"
                    onClick={submitApproval}
                    disabled={saving}
                    type="button"
                  >
                    {saving
                      ? "Submitting..."
                      : approval === "REJECTED"
                      ? "Resubmit for Approval"
                      : "Submit for Approval"}
                  </button>
                )}
              </section>
            </>
          )}
        </>
      )}
    </DriverLayout>
  );
}