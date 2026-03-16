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

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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

// Get alerts by status (active, resolved, draft)
router.get(
  "/alerts/status/:status",
  authMiddleware,
  authRole(["police", "admin"]),
  getAlertsByStatus
);

// Get recent alerts (last 7 days)
router.get(
  "/alerts/recent",
  authMiddleware,
  authRole(["police", "admin"]),
  getRecentAlerts
);

// Create new AMBER Alert
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

// Get single alert by ID
router.get(
  "/alerts/:id",
  authMiddleware,
  authRole(["police", "admin"]),
  getAlertDetails
);

// Alternative route for getting alert by ID (for consistency)
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

// Mark alert as resolved
router.put(
  "/alerts/:id/resolve",
  authMiddleware,
  authRole(["police", "admin"]),
  resolveAlert
);

// Delete/cancel alert
router.delete(
  "/alerts/:id",
  authMiddleware,
  authRole(["police", "admin"]),
  deleteAlert
);

// Get all tips/reports for a specific alert
router.get("/alerts/:id/tips", authMiddleware, getAlertTips);

// Update tip/report status
router.put(
  "/tips/:tipId/status",
  authMiddleware,
  authRole(["police", "admin"]),
  updateTipStatus
);

// // Bulk operations
// router.post(
//   "/alerts/bulk/resolve",
//   authMiddleware,
//   authRole(["police", "admin"]),
//   resolveMultipleAlerts
// );

export default router;
