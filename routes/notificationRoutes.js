// routes/notificationRoutes.js
import express from "express";
import {
  saveFCMToken,
  removeFCMToken,
  updateNotificationPreferences,
  getNotificationHistory,
  getNotificationStats,
} from "../controller/notificationcontroller.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// FCM Token management
router.post("/fcm-token", saveFCMToken);
router.delete("/fcm-token", removeFCMToken);

// Preferences
router.put("/preferences", updateNotificationPreferences);

// History and stats
router.get("/history", getNotificationHistory);
router.get("/stats", getNotificationStats);

export default router;
