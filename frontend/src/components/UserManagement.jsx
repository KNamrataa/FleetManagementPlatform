import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  UserCheck,
  UserX,
  RefreshCw,
} from "lucide-react";
const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

const ROLE_OPTIONS = [
  {
    value: "CUSTOMER",
    label: "Customer",
  },
  {
    value: "FLEET_MANAGER",
    label: "Fleet Manager",
  },
  {
    value: "DISPATCHER",
    label: "Dispatcher",
  },
  {
    value: "DRIVER",
    label: "Driver",
  },
  {
    value: "MAINTENANCE_MANAGER",
    label: "Maintenance Manager",
  },
  {
    value: "FINANCE_MANAGER",
    label: "Finance Manager",
  },
  {
    value: "VIEWER",
    label: "Management / Viewer",
  },
];

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [roleSelections, setRoleSelections] =
    useState({});

  const [savingRole, setSavingRole] =
    useState({});

  const [changingStatus, setChangingStatus] =
    useState({});

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/api/admin/users`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to load users."
        );
      }

      const loadedUsers = Array.isArray(
        data.users
      )
        ? data.users
        : [];

      setUsers(loadedUsers);

      // IMPORTANT:
      // Initialize each user's dropdown
      // with THEIR CURRENT ROLE.
      const initialRoles = {};

      loadedUsers.forEach((user) => {
        const userId =
          user.id || user._id;

        if (userId) {
          initialRoles[userId] =
            user.role || "CUSTOMER";
        }
      });

      setRoleSelections(initialRoles);
    } catch (err) {
      console.error(
        "Fetch users error:",
        err
      );

      setError(
        err.message ||
          "Unable to load users."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);
  const handleRoleChange = (
    userId,
    newRole
  ) => {
    if (!userId) {
      console.error(
        "Cannot change role: user ID is missing."
      );
      return;
    }

    setRoleSelections((previous) => ({
      ...previous,

      // Only THIS user's dropdown changes.
      [userId]: newRole,
    }));

    setError("");
    setSuccess("");
  };
  const handleAssignRole = async (user) => {
    const userId =
      user.id || user._id;

    if (!userId) {
      setError(
        "Cannot assign role because this user has no ID."
      );
      return;
    }
    const selectedRole =
      roleSelections[userId];

    if (!selectedRole) {
      setError(
        "Please select a role."
      );
      return;
    }
    if (
      selectedRole === user.role
    ) {
      setSuccess(
        `${user.fullName} already has this role.`
      );
      return;
    }
    try {
      setSavingRole((previous) => ({
        ...previous,
        [userId]: true,
      }));
      setError("");
      setSuccess("");
      const response = await fetch(
        `${API_URL}/api/admin/users/${encodeURIComponent(
          userId
        )}/role`,
        {
          method: "PUT",

          credentials: "include",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",
          },

          body: JSON.stringify({
            role: selectedRole,
          }),
        }
      );
      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to assign role."
        );
      }
      setUsers((previousUsers) =>
        previousUsers.map(
          (currentUser) => {
            const currentId =
              currentUser.id ||
              currentUser._id;

            if (
              currentId === userId
            ) {
              return {
                ...currentUser,
                ...data.user,
                role: selectedRole,
              };
            }

            return currentUser;
          }
        )
      );
      setRoleSelections((previous) => ({
        ...previous,
        [userId]: selectedRole,
      }));

      setSuccess(
        `${user.fullName}'s role was updated successfully.`
      );
    } catch (err) {
      console.error(
        "Assign role error:",
        err
      );

      setError(
        err.message ||
          "Unable to assign role."
      );
    } finally {
      setSavingRole((previous) => ({
        ...previous,
        [userId]: false,
      }));
    }
  };
  const handleStatusChange = async (
    user
  ) => {
    const userId =
      user.id || user._id;

    if (!userId) {
      setError(
        "Cannot change account status because user ID is missing."
      );
      return;
    }

    const newStatus =
      user.isActive === false;

    try {
      setChangingStatus(
        (previous) => ({
          ...previous,
          [userId]: true,
        })
      );

      setError("");
      setSuccess("");

      const response = await fetch(
        `${API_URL}/api/admin/users/${encodeURIComponent(
          userId
        )}/status`,
        {
          method: "PUT",

          credentials: "include",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",
          },

          body: JSON.stringify({
            isActive: newStatus,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to update account status."
        );
      }

      setUsers((previousUsers) =>
        previousUsers.map(
          (currentUser) => {
            const currentId =
              currentUser.id ||
              currentUser._id;

            if (
              currentId === userId
            ) {
              return {
                ...currentUser,
                ...data.user,
                isActive: newStatus,
              };
            }

            return currentUser;
          }
        )
      );

      setSuccess(
        `${user.fullName}'s account was ${
          newStatus
            ? "activated"
            : "deactivated"
        }.`
      );
    } catch (err) {
      console.error(
        "Status update error:",
        err
      );

      setError(
        err.message ||
          "Unable to update account status."
      );
    } finally {
      setChangingStatus(
        (previous) => ({
          ...previous,
          [userId]: false,
        })
      );
    }
  };
  const getRoleLabel = (role) => {
    const found =
      ROLE_OPTIONS.find(
        (item) =>
          item.value === role
      );

    if (found) {
      return found.label;
    }

    if (role === "SUPER_ADMIN") {
      return "Super Admin";
    }

    return role || "Customer";
  };

  return (
    <section className="user-management-section">
      <div className="user-management-header">
        <div>
          <div className="section-title-row">
            <ShieldCheck size={22} />

            <h2>
              User Management & Role Assignment
            </h2>
          </div>

          <h3>
            Platform Users
          </h3>

          <p>
            Assign roles and control account
            access.
          </p>
        </div>

        <button
          type="button"
          className="refresh-users-btn"
          onClick={fetchUsers}
          disabled={loading}
        >
          <RefreshCw
            size={17}
            className={
              loading
                ? "spin"
                : ""
            }
          />

          {loading
            ? "Loading..."
            : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          className="user-management-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="user-management-success"
          role="status"
        >
          {success}
        </div>
      )}

      {loading ? (
        <div className="users-loading">
          Loading users...
        </div>
      ) : users.length === 0 ? (
        <div className="users-empty">
          No users found.
        </div>
      ) : (
        <div className="users-table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>

                <th>Email</th>

                <th>
                  Current Role
                </th>

                <th>Status</th>

                <th>
                  Assign Role
                </th>

                <th>
                  Access
                </th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => {
                // CRITICAL:
                // Always get the MongoDB ID.
                const userId =
                  user.id ||
                  user._id;

                const isSuperAdmin =
                  user.role ===
                  "SUPER_ADMIN";

                const isActive =
                  user.isActive !== false;

                const selectedRole =
                  roleSelections[
                    userId
                  ] ||
                  user.role ||
                  "CUSTOMER";

                return (
                  <tr
                    key={userId}
                  >
                    <td>
                      <strong>
                        {user.fullName ||
                          "Unnamed User"}
                      </strong>
                    </td>

                    <td>
                      {user.email}
                    </td>

                    <td>
                      {getRoleLabel(
                        user.role
                      )}
                    </td>

                    <td>
                      <span
                        className={`status-badge ${
                          isActive
                            ? "active"
                            : "inactive"
                        }`}
                      >
                        {isActive
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    <td>
                      {isSuperAdmin ? (
                        <span className="protected-role">
                          <ShieldCheck
                            size={16}
                          />

                          Protected
                        </span>
                      ) : (
                        <div className="role-assignment">
                          <select
                            value={
                              selectedRole
                            }
                            onChange={(
                              event
                            ) =>
                              handleRoleChange(
                                userId,
                                event
                                  .target
                                  .value
                              )
                            }
                          >
                            {ROLE_OPTIONS.map(
                              (
                                option
                              ) => (
                                <option
                                  key={
                                    option.value
                                  }
                                  value={
                                    option.value
                                  }
                                >
                                  {
                                    option.label
                                  }
                                </option>
                              )
                            )}
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              handleAssignRole(
                                user
                              )
                            }
                            disabled={
                              savingRole[
                                userId
                              ] ||
                              selectedRole ===
                                user.role
                            }
                          >
                            {savingRole[
                              userId
                            ]
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
                          type="button"
                          className={
                            isActive
                              ? "deactivate-btn"
                              : "activate-btn"
                          }
                          onClick={() =>
                            handleStatusChange(
                              user
                            )
                          }
                          disabled={
                            changingStatus[
                              userId
                            ]
                          }
                        >
                          {changingStatus[
                            userId
                          ]
                            ? "Updating..."
                            : isActive
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
    </section>
  );
}
export default UserManagement;