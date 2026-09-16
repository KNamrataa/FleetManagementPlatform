import { useCallback, useEffect, useMemo, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { authFetch } from "../services/api";

import {
  Activity,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  FileText,
  Fuel,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Wrench,
  X,
} from "lucide-react";

import "../Dashboard.css";
import "./UserManagementPage.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const PAGE_SIZE = 10;

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "FLEET_MANAGER", label: "Fleet Manager" },
  { value: "TRIP_MANAGER", label: "Trip Manager" },
  { value: "DRIVER", label: "Driver" },
  { value: "MAINTENANCE_MANAGER", label: "Maintenance Manager" },
  { value: "FINANCE_MANAGER", label: "Finance Manager" },
  { value: "VIEWER", label: "Management / Viewer" },
  { value: "CUSTOMER", label: "Customer" },
];

const ROLE_LABELS = {
  ...Object.fromEntries(ROLES.map((role) => [role.value, role.label])),
  DISPATCHER: "Trip Manager",
};

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  role: "CUSTOMER",
  accountStatus: "ACTIVE",
};

function getId(user) {
  return user?._id || user?.id;
}

function normalizeUser(user) {
  const isActive =
    user?.isActive !== false && user?.accountStatus !== "INACTIVE";

  return {
    ...user,
    id: getId(user),
    _id: getId(user),
    isActive,
    accountStatus: isActive ? "ACTIVE" : "INACTIVE",
  };
}

async function readResponse(response) {
  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }

    if (response.status === 403) {
      throw new Error(
        data.message || "You are not authorized to manage users."
      );
    }

    throw new Error(
      data.message || "The request could not be completed."
    );
  }

  return data;
}

function UserManagementPage() {
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedRoles, setSelectedRoles] = useState({});
  const [busy, setBusy] = useState({});
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async (showRefresh = false) => {
    try {
      showRefresh ? setRefreshing(true) : setLoading(true);

      setError("");

      const response = await authFetch(`/api/admin/users`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      const data = await readResponse(response);

      const loaded = (data.users || []).map(normalizeUser);

      setUsers(loaded);

      setSelectedRoles(
        loaded.reduce(
          (acc, user) => ({
            ...acc,
            [getId(user)]: user.role,
          }),
          {}
        )
      );
    } catch (err) {
      console.error(err);

      setError(err.message || "Unable to load users.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("fleetUser");

    if (!storedUser) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      const currentUser = JSON.parse(storedUser);

      if (currentUser.role !== "SUPER_ADMIN") {
        navigate("/dashboard", { replace: true });
        return;
      }
    } catch {
      sessionStorage.removeItem("fleetUser");
      sessionStorage.removeItem("fleetToken");

      navigate("/login", { replace: true });

      return;
    }

    fetchUsers();
  }, [fetchUsers, navigate]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !query ||
        [user.fullName, user.email, user.phone]
          .filter(Boolean)
          .some((value) =>
            value.toLowerCase().includes(query)
          );

      const matchesRole =
        roleFilter === "ALL" || user.role === roleFilter;

      const matchesStatus =
        statusFilter === "ALL" ||
        (user.isActive ? "ACTIVE" : "INACTIVE") === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const pageUsers = useMemo(
    () =>
      filteredUsers.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [filteredUsers, currentPage]
  );

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.isActive).length,
      inactive: users.filter((user) => !user.isActive).length,
      admins: users.filter(
        (user) => user.role === "SUPER_ADMIN"
      ).length,
    }),
    [users]
  );

  const setBusyFor = (id, action, value) => {
    setBusy((previous) => ({
      ...previous,
      [`${action}:${id}`]: value,
    }));
  };

  const showSuccess = (message) => {
    setSuccess(message);
    setError("");

    window.setTimeout(() => {
      setSuccess((current) =>
        current === message ? "" : current
      );
    }, 3500);
  };

  const handleRoleChange = (userId, role) => {
    setSelectedRoles((previous) => ({
      ...previous,
      [userId]: role,
    }));
  };

  const assignRole = async (user) => {
    const userId = getId(user);
    const role = selectedRoles[userId];

    if (!role || role === user.role) return;

    try {
      setBusyFor(userId, "role", true);
      setError("");

      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(userId)}/role`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ role }),
        }
      );

      const data = await readResponse(response);

      setUsers((previous) =>
        previous.map((item) =>
          getId(item) === userId
            ? normalizeUser(data.user)
            : item
        )
      );

      setSelectedRoles((previous) => ({
        ...previous,
        [userId]: data.user.role,
      }));

      showSuccess("Role assigned successfully.");
    } catch (err) {
      setError(err.message || "Failed to assign role.");
    } finally {
      setBusyFor(userId, "role", false);
    }
  };

  const toggleStatus = async (user) => {
    const userId = getId(user);
    const nextStatus = !user.isActive;

    if (user.role === "SUPER_ADMIN") return;

    if (
      !window.confirm(
        `Are you sure you want to ${
          nextStatus ? "activate" : "deactivate"
        } ${user.fullName}?`
      )
    ) {
      return;
    }

    try {
      setBusyFor(userId, "status", true);
      setError("");

      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(userId)}/status`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            isActive: nextStatus,
          }),
        }
      );

      const data = await readResponse(response);

      setUsers((previous) =>
        previous.map((item) =>
          getId(item) === userId
            ? normalizeUser(data.user)
            : item
        )
      );

      showSuccess(
        nextStatus
          ? "Account activated successfully."
          : "Account deactivated successfully."
      );
    } catch (err) {
      setError(
        err.message || "Failed to update account status."
      );
    } finally {
      setBusyFor(userId, "status", false);
    }
  };

  const deleteUser = async (user) => {
    const userId = getId(user);

    if (user.role === "SUPER_ADMIN") return;

    if (
      !window.confirm(
        `Delete ${user.fullName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setBusyFor(userId, "delete", true);
      setError("");

      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        }
      );

      await readResponse(response);

      setUsers((previous) =>
        previous.filter(
          (item) => getId(item) !== userId
        )
      );

      showSuccess("User deleted successfully.");
    } catch (err) {
      setError(err.message || "Failed to delete user.");
    } finally {
      setBusyFor(userId, "delete", false);
    }
  };

  const openAdd = () => {
    setForm(emptyForm);
    setFormError("");
    setModal({ type: "add" });
  };

  const openEdit = (user) => {
    setForm({
      fullName: user.fullName || "",
      email: user.email || "",
      phone: user.phone || "",
      password: "",
      confirmPassword: "",
      role:
        user.role === "DISPATCHER"
          ? "TRIP_MANAGER"
          : user.role || "CUSTOMER",
      accountStatus: user.isActive
        ? "ACTIVE"
        : "INACTIVE",
    });

    setFormError("");
    setModal({ type: "edit", user });
  };

  const openView = async (user) => {
    setModal({
      type: "view",
      user,
      loading: true,
    });

    try {
      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(getId(user))}`,
        {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data = await readResponse(response);

      setModal({
        type: "view",
        user: normalizeUser(data.user),
        loading: false,
      });
    } catch (err) {
      setModal(null);

      setError(
        err.message || "Failed to load user details."
      );
    }
  };

  const validateForm = () => {
    if (
      !form.fullName.trim() ||
      form.fullName.trim().length < 2
    ) {
      return "Full name must be at least 2 characters.";
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email.trim()
      )
    ) {
      return "Please enter a valid email address.";
    }

    if (
      form.phone &&
      !/^[+\d][\d\s().-]{6,19}$/.test(
        form.phone.trim()
      )
    ) {
      return "Please enter a valid phone number.";
    }

    if (!ROLES.some((item) => item.value === form.role)) {
      return "Please select a valid role.";
    }

    if (!form.role) {
      return "Role is required.";
    }

    if (
      !form.accountStatus ||
      !["ACTIVE", "INACTIVE"].includes(
        form.accountStatus
      )
    ) {
      return "Please select a valid account status.";
    }

    if (modal?.type === "add") {
      if (!form.password || form.password.length < 8) {
        return "Password must be at least 8 characters.";
      }

      if (form.password !== form.confirmPassword) {
        return "Password and confirm password do not match.";
      }
    }

    return "";
  };

  const submitForm = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setSubmitting(true);
      setFormError("");
      setError("");

      const isEdit = modal.type === "edit";

      const userId = isEdit
        ? getId(modal.user)
        : null;

      const payload = isEdit
        ? {
            fullName: form.fullName.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim(),
            role: form.role,
            accountStatus: form.accountStatus,
          }
        : {
            ...form,
            fullName: form.fullName.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim(),
          };

      const response = await authFetch(
        isEdit
          ? `/api/admin/users/${encodeURIComponent(userId)}`
          : `/api/admin/users`,
        {
          method: isEdit ? "PUT" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await readResponse(response);

      const updated = normalizeUser(data.user);

      if (isEdit) {
        setUsers((previous) =>
          previous.map((item) =>
            getId(item) === userId ? updated : item
          )
        );

        setSelectedRoles((previous) => ({
          ...previous,
          [userId]: updated.role,
        }));

        showSuccess("User updated successfully.");
      } else {
        setUsers((previous) => [
          updated,
          ...previous,
        ]);

        setSelectedRoles((previous) => ({
          ...previous,
          [getId(updated)]: updated.role,
        }));

        showSuccess("User created successfully.");
      }

      setModal(null);
    } catch (err) {
      setFormError(
        err.message ||
          (modal.type === "edit"
            ? "Failed to update user."
            : "Failed to create user.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    try {
      await authFetch(`/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error(err);
    } finally {
      sessionStorage.removeItem("fleetUser");
      sessionStorage.removeItem("fleetToken");

      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="dashboard-page">

      {/* =========================
          SIDEBAR
      ========================== */}
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

          {/* Overview */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>

          {/* Vehicles */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <Car size={18} />
            Vehicles
          </button>

          {/* Drivers */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <Users size={18} />
            Drivers
          </button>

          {/* Trips */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <Activity size={18} />
            Trips
          </button>

          {/* Live Tracking */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <MapPin size={18} />
            Live Tracking
          </button>

          {/* Fuel */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <Fuel size={18} />
            Fuel
          </button>

          {/* Maintenance */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <Wrench size={18} />
            Maintenance
          </button>

          {/* Expenses */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <CircleDollarSign size={18} />
            Expenses
          </button>

          {/* Reports */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <FileText size={18} />
            Reports
          </button>

          {/* User Management - CURRENT PAGE */}
          <button
            className="nav-item active"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin/users");
            }}
          >
            <Users size={18} />
            User Management
          </button>

          {/* Permissions & Access - NEW */}
          <Link
            to="/super-admin/security"
            className="nav-item"
            onClick={() => setSidebarOpen(false)}
          >
            <ShieldCheck size={18} />
            Permissions & Access
          </Link>

          {/* Settings */}
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              navigate("/super-admin");
            }}
          >
            <Settings size={18} />
            Settings
          </button>

        </nav>

        {/* Sign Out */}
        <button
          className="logout-button"
          onClick={logout}
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </aside>

      {/* =========================
          MAIN CONTENT
      ========================== */}
      <main className="dashboard-main user-management-page">

        <header className="dashboard-header">

          <div className="user-page-title-wrap">

            <button
              className="mobile-menu-button"
              onClick={() =>
                setSidebarOpen((open) => !open)
              }
              aria-label="Open navigation"
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

              <h1>User Management</h1>

              <p className="dashboard-subtitle">
                Manage platform users, roles, and
                account access.
              </p>
            </div>

          </div>

          <button
            className="um-primary-button"
            onClick={openAdd}
          >
            <Plus size={18} />
            Add User
          </button>

        </header>

        {error && (
          <div
            className="um-alert error"
            role="alert"
          >
            <UserX size={17} />
            {error}

            <button onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}

        {success && (
          <div
            className="um-alert success"
            role="status"
          >
            <CheckCircle2 size={17} />
            {success}
          </div>
        )}

        <section className="um-summary-grid">

          <SummaryCard
            icon={<Users />}
            label="Total Users"
            value={stats.total}
          />

          <SummaryCard
            icon={<UserCheck />}
            label="Active Users"
            value={stats.active}
          />

          <SummaryCard
            icon={<UserX />}
            label="Inactive Users"
            value={stats.inactive}
          />

          <SummaryCard
            icon={<ShieldCheck />}
            label="Super Admins"
            value={stats.admins}
          />

        </section>

        <section className="um-panel">

          <div className="um-toolbar">

            <div className="um-search">
              <Search size={18} />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search by name, email or phone..."
                aria-label="Search users"
              />
            </div>

            <div className="um-filters">

              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value)
                }
                aria-label="Filter by role"
              >
                <option value="ALL">
                  All Roles
                </option>

                {ROLES.map((role) => (
                  <option
                    key={role.value}
                    value={role.value}
                  >
                    {role.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                aria-label="Filter by status"
              >
                <option value="ALL">
                  All Status
                </option>

                <option value="ACTIVE">
                  Active
                </option>

                <option value="INACTIVE">
                  Inactive
                </option>
              </select>

              <button
                className="um-refresh-button"
                onClick={() => fetchUsers(true)}
                disabled={loading || refreshing}
              >
                <RefreshCw
                  size={17}
                  className={
                    refreshing ? "spin" : ""
                  }
                />

                {refreshing
                  ? "Refreshing"
                  : "Refresh"}
              </button>

            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : filteredUsers.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="um-table-scroll">

                <table className="um-table">

                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Current Role</th>
                      <th>Account Status</th>
                      <th>Created Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>

                    {pageUsers.map((user) => {

                      const userId = getId(user);

                      const protectedUser =
                        user.role === "SUPER_ADMIN";

                      return (
                        <tr key={userId}>

                          <td>
                            <div className="um-user-name">

                              <span className="um-avatar">
                                {user.fullName
                                  ?.charAt(0)
                                  ?.toUpperCase() || "U"}
                              </span>

                              <strong>
                                {user.fullName}
                              </strong>

                            </div>
                          </td>

                          <td>
                            <span className="um-email">
                              <Mail size={14} />
                              {user.email}
                            </span>
                          </td>

                          <td>
                            {user.phone || "—"}
                          </td>

                          <td>

                            <span
                              className={`um-role-badge role-${user.role?.toLowerCase()}`}
                            >
                              {ROLE_LABELS[user.role] ||
                                user.role}
                            </span>

                            {!protectedUser && (
                              <div className="um-role-control">

                                <select
                                  value={
                                    selectedRoles[userId] ||
                                    user.role
                                  }
                                  onChange={(event) =>
                                    handleRoleChange(
                                      userId,
                                      event.target.value
                                    )
                                  }
                                  aria-label={`Role for ${user.fullName}`}
                                >
                                  {ROLES.map((role) => (
                                    <option
                                      key={role.value}
                                      value={role.value}
                                    >
                                      {role.label}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  onClick={() =>
                                    assignRole(user)
                                  }
                                  disabled={
                                    busy[
                                      `role:${userId}`
                                    ] ||
                                    selectedRoles[userId] ===
                                      user.role
                                  }
                                >
                                  {busy[
                                    `role:${userId}`
                                  ]
                                    ? "Saving"
                                    : "Assign"}
                                </button>

                              </div>
                            )}

                          </td>

                          <td>

                            <span
                              className={`um-status-badge ${
                                user.isActive
                                  ? "active"
                                  : "inactive"
                              }`}
                            >
                              <span />

                              {user.isActive
                                ? "Active"
                                : "Inactive"}
                            </span>

                          </td>

                          <td>
                            {formatDate(
                              user.createdAt
                            )}
                          </td>

                          <td>

                            <div className="um-actions">

                              <button
                                className="icon-action view"
                                onClick={() =>
                                  openView(user)
                                }
                                title="View user"
                              >
                                <Eye size={16} />
                              </button>

                              <button
                                className="icon-action edit"
                                onClick={() =>
                                  openEdit(user)
                                }
                                title="Edit user"
                              >
                                <Pencil size={16} />
                              </button>

                              {protectedUser ? (
                                <span className="protected-pill">
                                  <ShieldCheck
                                    size={15}
                                  />
                                  Protected
                                </span>
                              ) : (
                                <>
                                  <button
                                    className={`icon-action ${
                                      user.isActive
                                        ? "danger"
                                        : "success"
                                    }`}
                                    onClick={() =>
                                      toggleStatus(user)
                                    }
                                    disabled={
                                      busy[
                                        `status:${userId}`
                                      ]
                                    }
                                    title={
                                      user.isActive
                                        ? "Deactivate user"
                                        : "Activate user"
                                    }
                                  >
                                    {user.isActive ? (
                                      <UserX size={16} />
                                    ) : (
                                      <UserCheck
                                        size={16}
                                      />
                                    )}
                                  </button>

                                  <button
                                    className="icon-action delete"
                                    onClick={() =>
                                      deleteUser(user)
                                    }
                                    disabled={
                                      busy[
                                        `delete:${userId}`
                                      ]
                                    }
                                    title="Delete user"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}

                            </div>

                          </td>

                        </tr>
                      );
                    })}

                  </tbody>

                </table>

              </div>

              <Pagination
                page={currentPage}
                totalPages={totalPages}
                total={filteredUsers.length}
                onPage={setPage}
              />
            </>
          )}

        </section>

      </main>

      {modal?.type === "view" && (
        <ViewModal
          user={modal.user}
          loading={modal.loading}
          onClose={() => setModal(null)}
          onEdit={() => openEdit(modal.user)}
        />
      )}

      {(modal?.type === "add" ||
        modal?.type === "edit") && (
        <UserFormModal
          modal={modal}
          form={form}
          setForm={setForm}
          error={formError}
          submitting={submitting}
          onClose={() => setModal(null)}
          onSubmit={submitForm}
        />
      )}

    </div>
  );
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="um-summary-card">
      <div className="um-summary-icon">
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="um-state">
      <div className="um-spinner" />

      <h3>Loading users</h3>

      <p>
        Fetching the latest platform users from
        MongoDB...
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="um-state">

      <div className="um-empty-icon">
        <Users size={28} />
      </div>

      <h3>No users found</h3>

      <p>
        Try changing your search or filters, or add a
        new platform user.
      </p>

    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPage,
}) {
  const start = (page - 1) * PAGE_SIZE + 1;

  const end = Math.min(
    page * PAGE_SIZE,
    total
  );

  const numbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter(
    (number) =>
      totalPages <= 7 ||
      number === 1 ||
      number === totalPages ||
      Math.abs(number - page) <= 1
  );

  return (
    <div className="um-pagination">

      <span>
        Showing {start}–{end} of {total} users
      </span>

      <div className="um-page-buttons">

        <button
          onClick={() =>
            onPage(Math.max(1, page - 1))
          }
          disabled={page === 1}
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        {numbers.map((number, index) => (
          <span key={number}>

            {index > 0 &&
            numbers[index - 1] !== number - 1 ? (
              <b>…</b>
            ) : null}

            <button
              className={
                page === number ? "current" : ""
              }
              onClick={() => onPage(number)}
            >
              {number}
            </button>

          </span>
        ))}

        <button
          onClick={() =>
            onPage(
              Math.min(totalPages, page + 1)
            )
          }
          disabled={page === totalPages}
        >
          Next
          <ChevronRight size={16} />
        </button>

      </div>
    </div>
  );
}

function ViewModal({
  user,
  loading,
  onClose,
  onEdit,
}) {
  return (
    <ModalShell
      title="User Details"
      subtitle="Read-only account information"
      onClose={onClose}
    >
      {loading ? (
        <LoadingState />
      ) : (
        <div className="um-detail-layout">

          <div className="um-profile-card">

            <div className="um-large-avatar">
              {user?.fullName
                ?.charAt(0)
                ?.toUpperCase()}
            </div>

            <h3>{user?.fullName}</h3>

            <span
              className={`um-role-badge role-${user?.role?.toLowerCase()}`}
            >
              {ROLE_LABELS[user?.role] ||
                user?.role}
            </span>

          </div>

          <div className="um-details-grid">

            <Detail
              label="Full Name"
              value={user?.fullName}
            />

            <Detail
              label="Email"
              value={user?.email}
            />

            <Detail
              label="Phone"
              value={
                user?.phone || "Not provided"
              }
            />

            <Detail
              label="Role"
              value={
                ROLE_LABELS[user?.role] ||
                user?.role
              }
            />

            <Detail
              label="Account Status"
              value={
                user?.isActive
                  ? "Active"
                  : "Inactive"
              }
              status={user?.isActive}
            />

            <Detail
              label="Created Date"
              value={formatDateTime(
                user?.createdAt
              )}
            />

            <Detail
              label="Updated Date"
              value={formatDateTime(
                user?.updatedAt
              )}
            />

            <Detail
              label="Last Login"
              value={formatDateTime(
                user?.lastLoginAt,
                "Never"
              )}
            />

          </div>

          <div className="um-modal-footer">

            <button
              className="um-secondary-button"
              onClick={onClose}
            >
              Close
            </button>

            <button
              className="um-primary-button"
              onClick={onEdit}
            >
              <Pencil size={16} />
              Edit User
            </button>

          </div>

        </div>
      )}
    </ModalShell>
  );
}

function Detail({
  label,
  value,
  status,
}) {
  return (
    <div className="um-detail">

      <span>{label}</span>

      {status === undefined ? (
        <strong>{value}</strong>
      ) : (
        <span
          className={`um-status-badge ${
            status ? "active" : "inactive"
          }`}
        >
          <span />
          {value}
        </span>
      )}

    </div>
  );
}

function UserFormModal({
  modal,
  form,
  setForm,
  error,
  submitting,
  onClose,
  onSubmit,
}) {
  const isEdit = modal.type === "edit";

  const protectedUser =
    isEdit &&
    modal.user?.role === "SUPER_ADMIN";

  const update = (field) => (event) =>
    setForm((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));

  return (
    <ModalShell
      title={isEdit ? "Edit User" : "Add User"}
      subtitle={
        isEdit
          ? "Update account information and access"
          : "Create a new FleetFlow platform account"
      }
      onClose={onClose}
    >
      <form
        className="um-form"
        onSubmit={onSubmit}
      >

        {error && (
          <div className="um-form-error">
            {error}
          </div>
        )}

        <div className="um-form-grid">

          <label>
            Full Name

            <input
              value={form.fullName}
              onChange={update("fullName")}
              placeholder="Enter full name"
              autoComplete="name"
            />
          </label>

          <label>
            Email

            <input
              type="email"
              value={form.email}
              onChange={update("email")}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </label>

          <label>
            Phone

            <input
              value={form.phone}
              onChange={update("phone")}
              placeholder="+91 98765 43210"
              autoComplete="tel"
            />
          </label>

          <label>
            Role

            <select
              value={form.role}
              onChange={update("role")}
              disabled={protectedUser}
            >
              {ROLES.map((role) => (
                <option
                  key={role.value}
                  value={role.value}
                >
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Account Status

            <select
              value={form.accountStatus}
              onChange={update("accountStatus")}
              disabled={protectedUser}
            >
              <option value="ACTIVE">
                Active
              </option>

              <option value="INACTIVE">
                Inactive
              </option>
            </select>
          </label>

          {!isEdit && (
            <>
              <label>
                Password

                <input
                  type="password"
                  value={form.password}
                  onChange={update("password")}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
              </label>

              <label>
                Confirm Password

                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={update(
                    "confirmPassword"
                  )}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
              </label>
            </>
          )}

        </div>

        {protectedUser && (
          <div className="um-protection-note">

            <ShieldCheck size={17} />

            <span>
              <strong>
                Protected Super Admin
              </strong>

              Role and account status cannot be
              changed.
            </span>

          </div>
        )}

        <div className="um-modal-footer">

          <button
            type="button"
            className="um-secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="um-primary-button"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <RefreshCw
                  size={16}
                  className="spin"
                />
                Saving...
              </>
            ) : isEdit ? (
              <>
                <CheckCircle2 size={16} />
                Save Changes
              </>
            ) : (
              <>
                <UserPlus size={16} />
                Create User
              </>
            )}
          </button>

        </div>

      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}) {
  return (
    <div
      className="um-modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="um-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >

        <div className="um-modal-header">

          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
          >
            <X size={19} />
          </button>

        </div>

        {children}

      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function formatDateTime(
  value,
  empty = "Never"
) {
  if (!value) return empty;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? empty
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default UserManagementPage;