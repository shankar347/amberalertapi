// routes/userAlertRoutes.js
import express from "express";
import multer from "multer";
import {
  getActiveAlerts,
  getPublicAlertDetails,
  reportSighting,
  getAlertsInMyArea,
  getHomepageAlerts,
  searchAlerts,
  getMySightingReports,
  getSightingReportById,
  deleteSightingReport,
} from "../controller/alertcontrller.js";

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
🌍 Public Routes - No authentication required
*/
// Get homepage alerts (critical + recent)
router.get("/homepage", getHomepageAlerts);

// Get all active alerts with filters
router.get("/alerts", getActiveAlerts);

// Search alerts
router.get("/alerts/search", searchAlerts);

// Get single alert details
router.get("/alerts/:id", getPublicAlertDetails);

/*
👤 User Routes - Authentication required
*/
// Get alerts in my area (based on user's district)
router.get("/my-area", authMiddleware, getAlertsInMyArea);

// Report a sighting (with image upload)
router.post(
  "/report-sighting",
  authMiddleware,
  upload.array("sightingImages", 5), // Max 5 images
  reportSighting
);

// Get all my sighting reports
router.get("/my-reports", authMiddleware, getMySightingReports);

// Get single sighting report by ID
router.get("/my-reports/:id", authMiddleware, getSightingReportById);

// Delete a sighting report
router.delete("/my-reports/:id", authMiddleware, deleteSightingReport);

// Alternative route for reporting sighting (with alertId in URL)
router.post(
  "/alerts/:alertId/report",
  authMiddleware,
  upload.array("sightingImages", 5),
  reportSighting
);

export default router;
