// controller/publicAlertController.js
import Alert from "../model/alertschema.js";
import SightingReport from "../model/SightingReportschema.js";
import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.js";

/*
🌍 Public: Get active alerts with location-based filtering
*/
export const getActiveAlerts = async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radius = 10, // radius in km
      district,
      state,
      page = 1,
      limit = 20,
      priority,
    } = req.query;

    let query = { status: "active" };

    // Filter by priority if provided
    if (priority) {
      query.priority = priority;
    }

    // Filter by location if coordinates provided
    if (latitude && longitude) {
      // Using geospatial query if you have coordinates stored
      query.locationCoordinates = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius) * 1000, // Convert km to meters
        },
      };
    }
    // Filter by district if provided
    else if (district) {
      query.lastSeenLocation = { $regex: district, $options: "i" };
    }
    // Filter by state if provided
    else if (state) {
      query.lastSeenLocation = { $regex: state, $options: "i" };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const alerts = await Alert.find(query)
      .select("-tips -broadcastChannels -__v") // Exclude sensitive data
      .populate("issuedBy", "name policeStation badgeNumber")
      .sort({ priority: 1, createdAt: -1 }) // Critical alerts first
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Alert.countDocuments(query);

    // Get total active alerts count
    const totalActive = await Alert.countDocuments({ status: "active" });

    // Get counts by priority
    const priorityCounts = await Alert.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: alerts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        totalActive,
      },
      priorityCounts: priorityCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Get active alerts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alerts",
      error: error.message,
    });
  }
};

/*
🌍 Public: Get single alert details
*/
export const getPublicAlertDetails = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .select("-tips -broadcastChannels -__v")
      .populate("issuedBy", "name policeStation badgeNumber");

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
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
👤 User: Report a sighting (with image upload)
*/
export const reportSighting = async (req, res) => {
  try {
    const alertId = req.params.alertId || req.body.alertId;

    const {
      seenLocation,
      seenTime,
      description,
      contactNumber,
      additionalInfo,
      latitude,
      longitude,
    } = req.body;

    if (!alertId) {
      return res.status(400).json({
        success: false,
        message: "Alert ID is required",
      });
    }

    if (!seenLocation || !description) {
      return res.status(400).json({
        success: false,
        message: "Please provide location and description",
      });
    }

    // Check alert
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    if (alert.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "This alert is no longer active",
      });
    }

    // ==============================
    // Upload images to Cloudinary
    // ==============================

    let sightingImages = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "amber_alert/sightings",
        });

        sightingImages.push({
          uri: result.secure_url,
          filename: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
        });
      }
    }

    // ==============================
    // Parse coordinates
    // ==============================

    let parsedCoordinates = null;

    if (latitude && longitude) {
      parsedCoordinates = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      };
    }

    // ==============================
    // Create report
    // ==============================

    const reportData = {
      alertId,
      reportedBy: req.user?._id || null,
      seenLocation,
      seenTime: seenTime || new Date(),
      description,
      contactNumber: contactNumber || req.user?.phoneno,
      additionalInfo,
      locationCoordinates: parsedCoordinates,
      images: sightingImages,
      status: "new",
    };

    const report = new SightingReport(reportData);
    await report.save();

    // ==============================
    // Push report into alert tips
    // ==============================

    alert.tips.push(report._id);
    await alert.save();

    res.status(201).json({
      success: true,
      data: {
        id: report._id,
        alertId: report.alertId,
        seenLocation: report.seenLocation,
        seenTime: report.seenTime,
        description: report.description,
        imagesCount: report.images.length,
        status: report.status,
        createdAt: report.createdAt,
      },
      message: "Sighting report submitted successfully. Thank you for helping!",
    });
  } catch (error) {
    console.error("Report sighting error:", error);

    res.status(500).json({
      success: false,
      message: "Error submitting report",
      error: error.message,
    });
  }
};

/*
👤 User: Get alerts in user's area (based on profile)
*/
export const getAlertsInMyArea = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Please login to use this feature",
      });
    }

    // Get user's district from profile
    const userDistrict = req.user.distric;
    const userState = req.user.state;

    let query = { status: "active" };

    if (userDistrict) {
      // Search in user's district
      query.lastSeenLocation = { $regex: userDistrict, $options: "i" };
    } else if (userState) {
      // Search in user's state
      query.lastSeenLocation = { $regex: userState, $options: "i" };
    } else {
      // If no location in profile, return empty array
      return res.json({
        success: true,
        data: [],
        area: "unknown",
        count: 0,
        message: "Please update your profile with location information",
      });
    }

    const alerts = await Alert.find(query)
      .select("-tips -broadcastChannels -__v")
      .populate("issuedBy", "name policeStation")
      .sort({ priority: 1, createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: alerts,
      area: userDistrict || userState,
      count: alerts.length,
    });
  } catch (error) {
    console.error("Get area alerts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alerts in your area",
      error: error.message,
    });
  }
};

/*
👤 User: Get my sighting reports
*/
export const getMySightingReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { reportedBy: req.user._id };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await SightingReport.find(query)
      .populate("alertId", "childName caseId status priority")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SightingReport.countDocuments(query);

    // Get stats
    const stats = {
      total: await SightingReport.countDocuments({ reportedBy: req.user._id }),
      new: await SightingReport.countDocuments({
        reportedBy: req.user._id,
        status: "new",
      }),
      reviewed: await SightingReport.countDocuments({
        reportedBy: req.user._id,
        status: "reviewed",
      }),
      actioned: await SightingReport.countDocuments({
        reportedBy: req.user._id,
        status: "actioned",
      }),
    };

    res.json({
      success: true,
      data: reports,
      stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error("Get my reports error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching your reports",
      error: error.message,
    });
  }
};

/*
👤 User: Get single sighting report by ID
*/
export const getSightingReportById = async (req, res) => {
  try {
    const report = await SightingReport.findById(req.params.id)
      .populate("alertId", "childName caseId status priority lastSeenLocation")
      .populate("reportedBy", "name phoneno email");

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // Check if user owns this report
    if (report.reportedBy?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this report",
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Get report error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching report",
      error: error.message,
    });
  }
};

/*
👤 User: Delete a sighting report
*/
export const deleteSightingReport = async (req, res) => {
  try {
    const report = await SightingReport.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // Check if user owns this report
    if (report.reportedBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this report",
      });
    }

    // Can only delete if status is 'new'
    if (report.status !== "new") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a report that has been reviewed",
      });
    }

    // Delete associated images
    if (report.images && report.images.length > 0) {
      report.images.forEach((img) => {
        if (img.uri) {
          try {
            fs.unlinkSync(img.uri);
          } catch (e) {
            console.log("Error deleting image:", e);
          }
        }
      });
    }

    // Remove report from alert's tips array
    await Alert.findByIdAndUpdate(report.alertId, {
      $pull: { tips: report._id },
    });

    // Delete the report
    await report.deleteOne();

    res.json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Delete report error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting report",
      error: error.message,
    });
  }
};

/*
🌍 Public: Get recent alerts (for homepage)
*/
export const getHomepageAlerts = async (req, res) => {
  try {
    const [criticalAlerts, recentAlerts, totalActive] = await Promise.all([
      // Get critical alerts first
      Alert.find({ status: "active", priority: "critical" })
        .select("-tips -broadcastChannels -__v")
        .populate("issuedBy", "policeStation")
        .sort({ createdAt: -1 })
        .limit(3),

      // Get all active alerts sorted by date
      Alert.find({ status: "active" })
        .select("-tips -broadcastChannels -__v")
        .populate("issuedBy", "policeStation")
        .sort({ createdAt: -1 })
        .limit(10),

      Alert.countDocuments({ status: "active" }),
    ]);

    // Get alerts by district for quick access
    const alertsByDistrict = await Alert.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: { $substr: ["$lastSeenLocation", 0, 20] }, // Simple grouping by location prefix
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.json({
      success: true,
      data: {
        critical: criticalAlerts,
        recent: recentAlerts,
        totalActive,
        alertsByDistrict: alertsByDistrict.map((item) => ({
          location: item._id,
          count: item.count,
        })),
      },
    });
  } catch (error) {
    console.error("Get homepage alerts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alerts",
      error: error.message,
    });
  }
};

/*
🌍 Public: Search alerts
*/
export const searchAlerts = async (req, res) => {
  try {
    const { query, location, priority, days = 7 } = req.query;

    let searchQuery = { status: "active" };

    // Date filter
    if (days) {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - parseInt(days));
      searchQuery.createdAt = { $gte: dateLimit };
    }

    // Text search
    if (query) {
      searchQuery.$or = [
        { childName: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
        { distinguishingFeatures: { $regex: query, $options: "i" } },
      ];
    }

    // Location search
    if (location) {
      searchQuery.lastSeenLocation = { $regex: location, $options: "i" };
    }

    // Priority filter
    if (priority) {
      searchQuery.priority = priority;
    }

    const alerts = await Alert.find(searchQuery)
      .select("-tips -broadcastChannels -__v")
      .populate("issuedBy", "policeStation")
      .sort({ priority: 1, createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
      filters: {
        query: query || null,
        location: location || null,
        priority: priority || null,
        days: days,
      },
    });
  } catch (error) {
    console.error("Search alerts error:", error);
    res.status(500).json({
      success: false,
      message: "Error searching alerts",
      error: error.message,
    });
  }
};
