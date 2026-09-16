const express = require("express");
const router = express.Router();
const {
  signup,
  login,
  logout,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  changePassword,
} = require("../controllers/authController");
const {
  authenticate,
} = require("../middleware/authMiddleware");
router.post("/signup", signup);
router.post("/login", login);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/change-password", authenticate, changePassword);
router.post("/logout", logout);
router.get(
  "/me",
  authenticate,
  getCurrentUser
);
module.exports = router;