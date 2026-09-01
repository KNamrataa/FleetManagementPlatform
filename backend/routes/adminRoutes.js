const express = require("express");
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  assignRole,
  updateUserStatus,
  deleteUser,
} = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const superAdminOnly = [authenticate, authorize("SUPER_ADMIN")];

router.get("/users", ...superAdminOnly, getUsers);
router.get("/users/:userId", ...superAdminOnly, getUserById);
router.post("/users", ...superAdminOnly, createUser);
router.put("/users/:userId", ...superAdminOnly, updateUser);
router.put("/users/:userId/role", ...superAdminOnly, assignRole);
router.patch("/users/:userId/status", ...superAdminOnly, updateUserStatus);
router.delete("/users/:userId", ...superAdminOnly, deleteUser);

module.exports = router;
