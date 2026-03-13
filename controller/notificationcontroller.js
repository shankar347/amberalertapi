// controllers/notificationController.js
import User from "../model/userschema.js";

export const saveFCMToken = async (req, res) => {
  try {
    const { token, deviceType, deviceId, deviceInfo } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Add token using schema method
    await user.addFCMToken(token, deviceType, deviceId);

    // Update device info if provided
    if (deviceInfo) {
      user.deviceInfo = {
        ...user.deviceInfo,
        ...deviceInfo,
        lastActive: new Date(),
      };
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "FCM token saved successfully",
      data: {
        tokenCount: user.fcmTokens.length,
      },
    });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save FCM token",
      error: error.message,
    });
  }
};

export const removeFCMToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await user.removeFCMToken(token);

    res.status(200).json({
      success: true,
      message: "FCM token removed successfully",
    });
  } catch (error) {
    console.error("Error removing FCM token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove FCM token",
      error: error.message,
    });
  }
};

export const updateNotificationPreferences = async (req, res) => {
  try {
    const {
      amberAlerts,
      criticalAlerts,
      soundEnabled,
      vibrationEnabled,
      alertRadius,
      preferredStates,
      quietHours,
    } = req.body;

    const userId = req.user._id;

    const updateData = {};

    if (amberAlerts !== undefined)
      updateData["notificationPreferences.amberAlerts"] = amberAlerts;
    if (criticalAlerts !== undefined)
      updateData["notificationPreferences.criticalAlerts"] = criticalAlerts;
    if (soundEnabled !== undefined)
      updateData["notificationPreferences.soundEnabled"] = soundEnabled;
    if (vibrationEnabled !== undefined)
      updateData["notificationPreferences.vibrationEnabled"] = vibrationEnabled;
    if (alertRadius !== undefined)
      updateData["notificationPreferences.alertRadius"] = alertRadius;
    if (preferredStates !== undefined)
      updateData["notificationPreferences.preferredStates"] = preferredStates;
    if (quietHours !== undefined)
      updateData["notificationPreferences.quietHours"] = quietHours;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).select("notificationPreferences fcmTokens");

    res.status(200).json({
      success: true,
      message: "Notification preferences updated",
      data: user.notificationPreferences,
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update preferences",
      error: error.message,
    });
  }
};

export const getNotificationHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20, page = 1 } = req.query;

    const user = await User.findById(userId)
      .select("notificationHistory")
      .populate({
        path: "notificationHistory.alertId",
        select: "caseId childName age priority status lastSeenLocation",
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Paginate history
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const history = user.notificationHistory
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      data: history,
      pagination: {
        total: user.notificationHistory.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(user.notificationHistory.length / limit),
      },
    });
  } catch (error) {
    console.error("Error getting notification history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get notification history",
      error: error.message,
    });
  }
};

export const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select(
      "fcmTokens notificationPreferences lastNotificationSent notificationHistory"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

    const stats = {
      activeDevices: user.fcmTokens.length,
      validTokens: user.getValidTokens().length,
      preferences: user.notificationPreferences,
      lastNotification: user.lastNotificationSent,
      totalNotifications: user.notificationHistory.length,
      notificationsLast30Days: user.notificationHistory.filter(
        (n) => n.sentAt > thirtyDaysAgo
      ).length,
      byType: {
        created: user.notificationHistory.filter((n) => n.type === "created")
          .length,
        resolved: user.notificationHistory.filter((n) => n.type === "resolved")
          .length,
        updated: user.notificationHistory.filter((n) => n.type === "updated")
          .length,
      },
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error getting notification stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get notification stats",
      error: error.message,
    });
  }
};
