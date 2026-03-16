// routes/policeAlertRoutes.js
import express from "express";
import multer from "multer";
import {
  createAlert,
  getMyAlerts,
  getAlertDetails,
  updateAlert,
  resolveAlert,
  deleteAlert,
  getAlertTips,
  updateTipStatus,
  getPoliceDashboardStats,
  getAlertById,
  getAlertsByStatus,
  getRecentAlerts,
} from "../controller/policealertcontroller.js";

import { authMiddleware } from "../middlewares/auth.js";
import { authRole } from "../middlewares/authRole.js";

const router = express.Router();

/* Multer memory storage (no uploads folder) */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/*
🚔 Police Routes - All routes require authentication and police role
*/

// Dashboard & Stats
router.get(
  "/dashboard/stats",
  authMiddleware,
  authRole(["police", "admin"]),
  getPoliceDashboardStats
);

// Get all alerts created by the logged-in police officer
router.get(
  "/my-alerts",
  authMiddleware,
  authRole(["police", "admin"]),
  getMyAlerts
);

// Get alerts by status
router.get(
  "/alerts/status/:status",
  authMiddleware,
  authRole(["police", "admin"]),
  getAlertsByStatus
);

// Get recent alerts
router.get(
  "/alerts/recent",
  authMiddleware,
  authRole(["police", "admin"]),
  getRecentAlerts
);

// Create new alert
router.post(
  "/alerts",
  authMiddleware,
  authRole(["police", "admin"]),
  upload.fields([
    { name: "childPhoto", maxCount: 1 },
    { name: "additionalImages", maxCount: 5 },
  ]),
  createAlert
);

// Get single alert
router.get(
  "/alerts/:id",
  authMiddleware,
  authRole(["police", "admin"]),
  getAlertDetails
);

// Alternative route
router.get(
  "/alert/:id",
  authMiddleware,
  authRole(["police", "admin"]),
  getAlertById
);

// Update alert
router.put(
  "/alerts/:id",
  authMiddleware,
  authRole(["police", "admin"]),
  upload.fields([
    { name: "childPhoto", maxCount: 1 },
    { name: "additionalImages", maxCount: 5 },
  ]),
  updateAlert
);

// Resolve alert
router.put(
  "/alerts/:id/resolve",
  authMiddleware,
  authRole(["police", "admin"]),
  resolveAlert
);

// Delete alert
router.delete(
  "/alerts/:id",
  authMiddleware,
  authRole(["police", "admin"]),
  deleteAlert
);

// Get alert tips
router.get("/alerts/:id/tips", authMiddleware, getAlertTips);

// Update tip status
router.put(
  "/tips/:tipId/status",
  authMiddleware,
  authRole(["police", "admin"]),
  updateTipStatus
);

export default router;
