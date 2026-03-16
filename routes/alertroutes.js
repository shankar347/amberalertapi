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

const router = express.Router();

/* Multer with memory storage */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/*
🌍 Public Routes
*/

router.get("/homepage", getHomepageAlerts);
router.get("/alerts", getActiveAlerts);
router.get("/alerts/search", searchAlerts);
router.get("/alerts/:id", getPublicAlertDetails);

/*
👤 User Routes
*/

router.get("/my-area", authMiddleware, getAlertsInMyArea);

router.post(
  "/report-sighting",
  authMiddleware,
  upload.array("sightingImages", 5),
  reportSighting
);

router.get("/my-reports", authMiddleware, getMySightingReports);

router.get("/my-reports/:id", authMiddleware, getSightingReportById);

router.delete("/my-reports/:id", authMiddleware, deleteSightingReport);

router.post(
  "/alerts/:alertId/report",
  authMiddleware,
  upload.array("sightingImages", 5),
  reportSighting
);

export default router;
