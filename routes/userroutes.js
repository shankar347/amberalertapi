import express from "express";
import multer from "multer";
import {
  Login,
  Signup,
  updateProfile,
  getRegisteredPolice,
  approvePolice,
  getUserAlerts,
} from "../controller/usercontroller.js";

import { authMiddleware } from "../middlewares/auth.js";
import { authRole } from "../middlewares/authRole.js";

const router = express.Router();

const upload = multer({ dest: "uploads/" });

/*
🔓 Public Routes
*/
router.post(
  "/signup",
  upload.fields([
    { name: "selfie", maxCount: 1 },
    { name: "idProof", maxCount: 1 },
    { name: "badge", maxCount: 1 },
  ]),
  Signup
);

router.post("/login", Login);

/*
🔐 Authenticated Routes
*/
router.put(
  "/:id",
  upload.fields([
    { name: "selfie", maxCount: 1 },
    { name: "idProof", maxCount: 1 },
    { name: "badge", maxCount: 1 },
  ]),
  updateProfile
);

router.get("/:id/alerts", authMiddleware, getUserAlerts);

/*
👑 Admin Only Routes
*/
router.get(
  "/registered-police",
  authMiddleware,
  authRole("admin"),
  getRegisteredPolice
);

router.put(
  "/approve-police/:id",
  authMiddleware,
  authRole("admin"),
  approvePolice
);

export default router;
