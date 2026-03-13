// controller/policeAlertController.js
import Alert, { generateCaseId } from "../model/alertschema.js";
import SightingReport from "../model/SightingReportschema.js";
import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.js";

import {
  sendAlertToUsers,
  NOTIFICATION_TEMPLATES,
} from "../utils/notificationHelper.js";

export const createAlert = async (req, res) => {
  try {
    const {
      childName,
      age,
      gender,
      lastSeenDate,
      lastSeenTime,
      lastSeenLocation,
      locationCoordinates,
      description,
      distinguishingFeatures,
      clothing,
      contactInfo,
      additionalInfo,
      priority,
    } = req.body;

    console.log("Request body:", req.body);
    console.log("User:", req.user);

    // Allow only police/admin
    if (req.user.role !== "police" && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only police officers can create alerts",
      });
    }

    // Required fields
    if (
      !childName ||
      !age ||
      !lastSeenLocation ||
      !description ||
      !contactInfo
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide childName, age, lastSeenLocation, description, contactInfo",
      });
    }

    /* ------------------ IMAGE UPLOADS ------------------ */

    let childPhoto = null;
    let additionalImages = [];

    // CHILD PHOTO
    if (req.files?.childPhoto) {
      const result = await cloudinary.uploader.upload(
        req.files.childPhoto[0].path,
        {
          folder: "amber_alert/child_photos",
        }
      );

      childPhoto = result.secure_url;
    }

    // ADDITIONAL IMAGES
    if (req.files?.additionalImages) {
      for (const file of req.files.additionalImages) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "amber_alert/additional_images",
        });

        additionalImages.push(result.secure_url);
      }
    }

    /* ------------------ COORDINATES ------------------ */

    /* ------------------ COORDINATES ------------------ */

    let formattedCoordinates = null;

    if (locationCoordinates) {
      try {
        const coords =
          typeof locationCoordinates === "string"
            ? JSON.parse(locationCoordinates)
            : locationCoordinates;

        if (Array.isArray(coords) && coords.length === 2) {
          formattedCoordinates = {
            type: "Point",
            coordinates: [Number(coords[0]), Number(coords[1])],
          };
        } else if (coords?.lat && coords?.lng) {
          formattedCoordinates = {
            type: "Point",
            coordinates: [Number(coords.lng), Number(coords.lat)],
          };
        } else if (coords?.latitude && coords?.longitude) {
          formattedCoordinates = {
            type: "Point",
            coordinates: [Number(coords.longitude), Number(coords.latitude)],
          };
        }
      } catch (error) {
        console.log("Coordinate parse error:", error);
      }
    }

    /* If locationCoordinates not sent, extract from lastSeenLocation */

    if (!formattedCoordinates && lastSeenLocation) {
      const parts = lastSeenLocation.split(",");

      if (parts.length === 2) {
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);

        if (!isNaN(lat) && !isNaN(lng)) {
          formattedCoordinates = {
            type: "Point",
            coordinates: [lng, lat],
          };
        }
      }
    }

    /* ------------------ CREATE CASE ID ------------------ */

    const caseId = await generateCaseId();

    /* ------------------ ALERT DATA ------------------ */

    const alertData = {
      caseId,
      childName,
      age: parseInt(age),
      gender: gender || "Other",
      description,
      distinguishingFeatures: distinguishingFeatures || "",
      lastSeenLocation,
      lastSeenDate: lastSeenDate ? new Date(lastSeenDate) : new Date(),
      contactInfo,
      priority: priority || "high",
      issuedBy: req.user._id,
      status: "active",
    };

    if (formattedCoordinates) {
      alertData.locationCoordinates = formattedCoordinates;
    }

    if (lastSeenTime) alertData.lastSeenTime = lastSeenTime;
    if (clothing) alertData.clothing = clothing;
    if (childPhoto) alertData.childPhoto = childPhoto;
    if (additionalImages.length > 0)
      alertData.additionalImages = additionalImages;
    if (additionalInfo) alertData.additionalInfo = additionalInfo;
    if (req.user.policeStation) alertData.department = req.user.policeStation;
    if (req.user.badgeNumber) alertData.badgeNumber = req.user.badgeNumber;

    /* ------------------ SAVE ALERT ------------------ */

    const alert = new Alert(alertData);
    const savedAlert = await alert.save();

    await savedAlert.populate("issuedBy", "name badgeNumber policeStation");

    /* ------------------ SEND NOTIFICATIONS TO USERS ------------------ */

    let notificationResult = null;

    try {
      // Send notifications to all eligible users
      notificationResult = await sendAlertToUsers(savedAlert);

      console.log("Notification sending completed:", {
        sentCount: notificationResult.sentCount,
        failedCount: notificationResult.failedCount,
        totalUsers: notificationResult.totalUsers,
      });

      // If this is a critical alert, also notify nearby police stations
      if (savedAlert.priority === "critical") {
        await notifyNearbyPoliceStations(savedAlert);
      }
    } catch (notifError) {
      console.error("Error in notification process:", notifError);
      // Don't fail the alert creation if notifications fail
    }

    /* ------------------ RETURN RESPONSE ------------------ */

    res.status(201).json({
      success: true,
      data: {
        ...savedAlert.toObject(),
        notifications: notificationResult
          ? {
              sent: notificationResult.sentCount,
              failed: notificationResult.failedCount,
              total: notificationResult.totalUsers,
            }
          : null,
      },
      message: "AMBER Alert created successfully",
      notificationStatus: notificationResult
        ? `Notifications sent to ${notificationResult.sentCount} devices`
        : "No notifications sent",
    });
  } catch (error) {
    console.error("Create alert error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate case ID generated. Please try again.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating alert",
      error: error.message,
    });
  }
};

// Helper function to notify nearby police stations
const notifyNearbyPoliceStations = async (alertData) => {
  try {
    // Find police users in the same state/district
    const policeUsers = await User.find({
      role: "police",
      isAccepted: true,
      "fcmTokens.0": { $exists: true },
      $or: [{ state: alertData.state }, { distric: alertData.distric }],
    }).select("fcmTokens");

    if (policeUsers.length === 0) return;

    const policeTokens = [];
    policeUsers.forEach((user) => {
      user.fcmTokens.forEach((t) => policeTokens.push(t.token));
    });

    if (policeTokens.length > 0) {
      const { sendPushNotification } = await import(
        "../utils/notificationHelper.js"
      );
      await sendPushNotification(
        policeTokens,
        {
          title: `🚔 CRITICAL ALERT IN YOUR AREA: ${alertData.childName}`,
          body: `Immediate police attention required. Child last seen at ${alertData.lastSeenLocation}. Case: ${alertData.caseId}`,
        },
        alertData,
        "high"
      );
    }
  } catch (error) {
    console.error("Error notifying police stations:", error);
  }
};

// Additional function to handle alert resolution notifications
/*
🚔 Get all alerts created by the logged-in police officer
*/
export const getMyAlerts = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { issuedBy: req.user._id };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("tips");

    const total = await Alert.countDocuments(query);

    // Get stats
    const stats = {
      active: await Alert.countDocuments({
        issuedBy: req.user._id,
        status: "active",
      }),
      resolved: await Alert.countDocuments({
        issuedBy: req.user._id,
        status: "resolved",
      }),
      total: total,
    };

    res.json({
      success: true,
      data: alerts,
      stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error("Get my alerts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alerts",
      error: error.message,
    });
  }
};

/*
🚔 Get alerts by status
*/
export const getAlertsByStatus = async (req, res) => {
  try {
    const { status } = req.params;

    if (!["active", "resolved", "draft", "cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use: active, resolved, draft, cancelled",
      });
    }

    const alerts = await Alert.find({
      issuedBy: req.user._id,
      status: status,
    })
      .sort({ createdAt: -1 })
      .populate("tips");

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    console.error("Get alerts by status error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alerts",
      error: error.message,
    });
  }
};

/*
🚔 Get recent alerts (last 7 days)
*/
export const getRecentAlerts = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const alerts = await Alert.find({
      issuedBy: req.user._id,
      createdAt: { $gte: sevenDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    console.error("Get recent alerts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recent alerts",
      error: error.message,
    });
  }
};

/*
🚔 Get single alert details by ID
*/
export const getAlertDetails = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate("issuedBy", "name badgeNumber policeStation email phoneno")
      .populate({
        path: "tips",
        populate: {
          path: "reportedBy",
          select: "name phoneno",
        },
      });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    // Check if police officer owns this alert
    if (
      alert.issuedBy._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this alert",
      });
    }

    // Increment views
    await alert.incrementViews();

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error("Get alert details error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alert details",
      error: error.message,
    });
  }
};

/*
🚔 Get alert by ID (alternative)
*/
export const getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id).populate(
      "issuedBy",
      "name badgeNumber policeStation"
    );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    // Check ownership
    if (
      alert.issuedBy._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error("Get alert by id error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alert",
      error: error.message,
    });
  }
};

/*
🚔 Update alert
*/
export const updateAlert = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    // Check ownership
    if (
      alert.issuedBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own alerts",
      });
    }

    // Don't allow updates if resolved
    if (alert.status === "resolved") {
      return res.status(400).json({
        success: false,
        message: "Cannot update resolved alerts",
      });
    }

    // Handle new photo upload if provided
    let updatedData = { ...req.body, updatedAt: Date.now() };

    if (req.files && req.files.childPhoto) {
      // Delete old photo if exists
      if (alert.childPhoto && alert.childPhoto.uri) {
        try {
          fs.unlinkSync(alert.childPhoto.uri);
        } catch (e) {
          console.log("Error deleting old photo:", e);
        }
      }

      const file = req.files.childPhoto[0];
      updatedData.childPhoto = {
        uri: file.path,
        filename: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
      };
    }

    // Handle additional images
    if (req.files && req.files.additionalImages) {
      const newImages = req.files.additionalImages.map((file) => ({
        uri: file.path,
        filename: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
      }));
      updatedData.additionalImages = [
        ...(alert.additionalImages || []),
        ...newImages,
      ];
    }

    const updatedAlert = await Alert.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedAlert,
      message: "Alert updated successfully",
    });
  } catch (error) {
    console.error("Update alert error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating alert",
      error: error.message,
    });
  }
};

/*
🚔 Mark alert as resolved
*/
export const resolveAlert = async (req, res) => {
  try {
    const { notes, type } = req.body;

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    // Check ownership
    if (
      alert.issuedBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only resolve your own alerts",
      });
    }

    // Call the schema method - this already saves the document
    await alert.resolveAlert({
      userId: req.user._id,
      notes,
      type: type || "found_safe",
      resolvedAt: new Date(),
    });

    // DON'T call save() again - it's already done in resolveAlert()

    res.json({
      success: true,
      data: alert,
      message: "Alert marked as resolved",
    });
  } catch (error) {
    console.error("Resolve alert error:", error);
    res.status(500).json({
      success: false,
      message: "Error resolving alert",
      error: error.message,
    });
  }
};

/*
🚔 Resolve multiple alerts
*/
export const resolveMultipleAlerts = async (req, res) => {
  try {
    const { alertIds, notes, type } = req.body;

    if (!alertIds || !Array.isArray(alertIds)) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of alert IDs",
      });
    }

    const results = await Promise.all(
      alertIds.map(async (id) => {
        const alert = await Alert.findById(id);
        if (alert && alert.issuedBy.toString() === req.user._id.toString()) {
          alert.markAsResolved({
            userId: req.user._id,
            notes,
            type: type || "found_safe",
          });
          await alert.save();
          return { id, success: true };
        }
        return { id, success: false, reason: "Not found or not authorized" };
      })
    );

    res.json({
      success: true,
      data: results,
      message: `${results.filter((r) => r.success).length} alerts resolved`,
    });
  } catch (error) {
    console.error("Resolve multiple alerts error:", error);
    res.status(500).json({
      success: false,
      message: "Error resolving alerts",
      error: error.message,
    });
  }
};

/*
🚔 Delete/cancel alert
*/
export const deleteAlert = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    // Check ownership
    if (
      alert.issuedBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this alert",
      });
    }

    // Soft delete - mark as cancelled
    alert.status = "cancelled";
    alert.resolutionNotes = "Alert cancelled by officer";
    alert.resolvedAt = Date.now();
    alert.resolvedBy = req.user._id;

    await alert.save();

    // Delete associated images (optional)
    if (alert.childPhoto && alert.childPhoto.uri) {
      try {
        fs.unlinkSync(alert.childPhoto.uri);
      } catch (e) {
        console.log("Error deleting child photo:", e);
      }
    }

    if (alert.additionalImages && alert.additionalImages.length > 0) {
      alert.additionalImages.forEach((img) => {
        if (img.uri) {
          try {
            fs.unlinkSync(img.uri);
          } catch (e) {
            console.log("Error deleting additional image:", e);
          }
        }
      });
    }

    res.json({
      success: true,
      message: "Alert cancelled successfully",
    });
  } catch (error) {
    console.error("Delete alert error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting alert",
      error: error.message,
    });
  }
};

/*
🚔 Get all tips/reports for an alert
*/
export const getAlertTips = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    // Check ownership
    // if (
    //   alert.issuedBy.toString() !== req.user._id.toString() &&
    //   req.user.role !== "admin"
    // ) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Not authorized",
    //   });
    // }

    const tips = await SightingReport.find({ alertId: req.params.id })
      .populate("reportedBy", "name phoneno")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: tips,
      count: tips.length,
    });
  } catch (error) {
    console.error("Get alert tips error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching tips",
      error: error.message,
    });
  }
};

/*
🚔 Update tip/report status
*/
export const updateTipStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    const tip = await SightingReport.findById(req.params.tipId).populate(
      "alertId"
    );

    if (!tip) {
      return res.status(404).json({
        success: false,
        message: "Tip not found",
      });
    }

    // Check if this tip belongs to police officer's alert
    if (
      tip.alertId.issuedBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    tip.status = status;
    tip.reviewedBy = req.user._id;
    tip.reviewedAt = Date.now();
    tip.notes = notes || tip.notes;
    await tip.save();

    res.json({
      success: true,
      data: tip,
      message: "Tip status updated",
    });
  } catch (error) {
    console.error("Update tip error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating tip",
      error: error.message,
    });
  }
};

/*
🚔 Get police dashboard statistics
*/
export const getPoliceDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      activeAlerts,
      resolvedToday,
      totalAlerts,
      criticalAlerts,
      totalTips,
      newTips,
    ] = await Promise.all([
      Alert.countDocuments({ issuedBy: req.user._id, status: "active" }),
      Alert.countDocuments({
        issuedBy: req.user._id,
        status: "resolved",
        resolvedAt: { $gte: today },
      }),
      Alert.countDocuments({ issuedBy: req.user._id }),
      Alert.countDocuments({
        issuedBy: req.user._id,
        status: "active",
        priority: "critical",
      }),
      SightingReport.countDocuments().populate({
        path: "alertId",
        match: { issuedBy: req.user._id },
      }),
      SightingReport.countDocuments({
        status: "new",
      }).populate({
        path: "alertId",
        match: { issuedBy: req.user._id },
      }),
    ]);

    // Get recent tips
    const recentTips = await SightingReport.find()
      .populate({
        path: "alertId",
        match: { issuedBy: req.user._id },
        select: "childName caseId",
      })
      .sort({ createdAt: -1 })
      .limit(5);

    // Filter out tips where alertId is null (not belonging to this officer)
    const filteredRecentTips = recentTips.filter((tip) => tip.alertId);

    res.json({
      success: true,
      data: {
        stats: {
          activeAlerts,
          resolvedToday,
          totalAlerts,
          criticalAlerts,
          totalTips,
          newTips,
        },
        recentTips: filteredRecentTips,
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard stats",
      error: error.message,
    });
  }
};
