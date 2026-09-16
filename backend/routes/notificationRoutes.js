const express = require("express");
const c = require("../controllers/notificationController");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();
router.get("/", authenticate, c.listNotifications);
router.get("/unread-count", authenticate, c.unreadCount);
router.patch("/:id/read", authenticate, c.markRead);
router.patch("/read-all", authenticate, c.markAllRead);
router.delete("/:id", authenticate, c.deleteNotification);

module.exports = router;
