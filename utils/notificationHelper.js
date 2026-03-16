// utils/notificationHelper.js
import admin from "firebase-admin";
import User from "../model/userschema.js";
import mongoose from "mongoose";

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

// In-memory cache for recent notifications (prevents duplicate sends)
const recentNotifications = new Map();

// Check if a notification was sent recently
const checkRecentNotification = async (key) => {
  // Clean up old entries (older than 1 minute)
  const now = Date.now();
  for (const [k, timestamp] of recentNotifications.entries()) {
    if (now - timestamp > 60000) {
      // 1 minute
      recentNotifications.delete(k);
    }
  }
  return recentNotifications.has(key);
};

// Mark notification as sent
const markNotificationSent = async (key) => {
  recentNotifications.set(key, Date.now());

  // Optional: Store in database for persistence across server restarts
  try {
    // Create a simple log collection if you want persistence
    // This is optional - you can skip if you don't need it
  } catch (error) {
    console.error("Error storing notification log:", error);
  }
};

// Notification templates
export const NOTIFICATION_TEMPLATES = {
  AMBER_ALERT_CREATED: (alert) => ({
    title: `🚨 AMBER ALERT: ${alert.childName}`,
    body: `${alert.childName}, ${alert.age} years old, last seen at ${
      alert.lastSeenLocation
    }. ${
      alert.priority === "critical"
        ? "IMMEDIATE ATTENTION REQUIRED!"
        : "Please be vigilant."
    }`,
  }),

  CRITICAL_ALERT: (alert) => ({
    title: `⚠️ CRITICAL AMBER ALERT: ${alert.childName}`,
    body: `URGENT: ${alert.childName}, ${alert.age} years old. Time-sensitive case! Last seen: ${alert.lastSeenLocation}. Report any information immediately.`,
  }),

  AMBER_ALERT_RESOLVED: (alert) => ({
    title: `✅ Alert Resolved: ${alert.childName}`,
    body: `${alert.childName} has been found safe. Thank you for your vigilance and support. Case ID: ${alert.caseId}`,
  }),

  AMBER_ALERT_UPDATED: (alert) => ({
    title: `📢 Alert Update: ${alert.childName}`,
    body: `New information available for case ${alert.caseId}. Last seen: ${alert.lastSeenLocation}`,
  }),
};

// Send push notifications to multiple tokens with deduplication
export const sendPushNotification = async (
  tokens,
  notificationData,
  alertData,
  priority = "normal"
) => {
  if (!tokens || tokens.length === 0) {
    return { success: false, message: "No tokens provided" };
  }

  // CRITICAL: Remove duplicate tokens aggressively
  const uniqueTokens = [...new Set(tokens)];

  // Filter out invalid tokens
  const validTokens = uniqueTokens.filter(
    (token) => token && typeof token === "string" && token.length > 20
  );

  console.log(
    `📊 Token stats - Original: ${tokens.length}, Unique: ${uniqueTokens.length}, Valid: ${validTokens.length}`
  );

  if (validTokens.length === 0) {
    return { success: false, message: "No valid tokens after filtering" };
  }

  // Use FCM's collapse key to group notifications
  const collapseKey = `alert_${alertData._id.toString()}`;
  const alertId = alertData._id.toString();

  // Prepare messages with deduplication at FCM level
  const messages = validTokens.map((token) => ({
    token: token,

    notification: {
      title: notificationData.title,
      body: notificationData.body,
    },

    data: {
      type: "AMBER_ALERT",
      alertId: alertId,
      caseId: alertData.caseId,
      childName: alertData.childName,
      age: alertData.age.toString(),
      priority: alertData.priority,
      lastSeenLocation: alertData.lastSeenLocation,
      image: alertData.childPhoto || "",
      action: "VIEW_MORE",
      timestamp: new Date().toISOString(),
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      channelId:
        alertData.priority === "critical"
          ? "amber_alerts_critical"
          : "amber_alerts",
    },

    android: {
      priority: priority === "high" ? "high" : "normal",
      collapseKey: collapseKey, // Groups notifications
      notification: {
        channelId:
          alertData.priority === "critical"
            ? "amber_alerts_critical"
            : "amber_alerts",
        priority: alertData.priority === "critical" ? "max" : "high",
        visibility: "public",
        sound: "default",
        color: alertData.priority === "critical" ? "#FF4444" : "#FF8F00",
        tag: alertId, // This replaces any existing notification with same tag
        sticky: false,
      },
    },

    apns: {
      payload: {
        aps: {
          alert: {
            title: notificationData.title,
            body: notificationData.body,
          },
          sound: "default",
          badge: 1,
          contentAvailable: true,
          category: "AMBER_ALERT",
          "mutable-content": 1,
          "thread-id": alertId, // Groups iOS notifications
        },
        data: {
          type: "AMBER_ALERT",
          alertId: alertId,
          caseId: alertData.caseId,
          childName: alertData.childName,
          age: alertData.age.toString(),
          priority: alertData.priority,
          lastSeenLocation: alertData.lastSeenLocation,
          image: alertData.childPhoto || "",
          action: "VIEW_MORE",
          timestamp: new Date().toISOString(),
        },
      },
      headers: {
        "apns-priority": alertData.priority === "critical" ? "10" : "5",
        "apns-collapse-id": alertId, // Collapse ID for iOS
        "apns-expiration": "0",
      },
      fcm_options: {
        image: alertData.childPhoto || "",
      },
    },
  }));

  // Log sample for debugging
  if (messages.length > 0) {
    console.log("📨 Sample message:", {
      token: messages[0].token.substring(0, 15) + "...",
      title: messages[0].notification.title,
    });
  }

  // Send notifications in batches
  const batchSize = 500;
  const results = [];
  const successTokens = [];
  const failedTokens = [];

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);

    // Send batch in parallel
    const batchPromises = batch.map(async (message) => {
      try {
        const response = await admin.messaging().send(message);
        successTokens.push(message.token);
        return { success: true, token: message.token, response };
      } catch (error) {
        console.error(
          `❌ Failed to send to ${message.token.substring(0, 15)}...:`,
          error.code
        );
        failedTokens.push(message.token);
        return { success: false, token: message.token, error };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  console.log(
    `📊 Send results - Success: ${successTokens.length}, Failed: ${failedTokens.length}`
  );

  return {
    success: true,
    successCount: successTokens.length,
    failureCount: failedTokens.length,
    failedTokens: failedTokens,
    total: validTokens.length,
  };
};

// Send alert to users with complete deduplication
export const sendAlertToUsers = async (alertData) => {
  try {
    console.log(`🚨 Sending alert ${alertData._id} to users...`);

    // Check if we've already sent this alert recently
    const alertKey = `alert_${alertData._id.toString()}`;
    const sentRecently = await checkRecentNotification(alertKey);

    if (sentRecently) {
      console.log(
        `⚠️ Alert ${alertData._id} was sent recently, skipping duplicate send`
      );
      return {
        success: true,
        message: "Alert already sent recently",
        sentCount: 0,
        skipped: true,
      };
    }

    // Get users who should receive this alert
    const users = await User.getUsersForAlert(alertData);

    if (!users || users.length === 0) {
      console.log("No users to notify");
      return { success: true, message: "No users to notify", sentCount: 0 };
    }

    console.log(`Found ${users.length} users to notify`);

    // CRITICAL: Collect and deduplicate tokens at multiple levels
    const deviceTokenMap = new Map(); // Map<deviceId, {token, userId, lastUsed}>
    const tokenSet = new Set(); // Track unique tokens

    users.forEach((user) => {
      if (!user.fcmTokens || user.fcmTokens.length === 0) return;

      // Get valid tokens (not expired)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const validUserTokens = user.fcmTokens.filter(
        (t) =>
          t.token && t.token.length > 20 && new Date(t.lastUsed) > thirtyDaysAgo
      );

      validUserTokens.forEach((tokenObj) => {
        const deviceId =
          tokenObj.deviceId || `unknown_${tokenObj.token.substring(0, 10)}`;

        // Skip if we already have this exact token
        if (tokenSet.has(tokenObj.token)) {
          console.log(
            `⚠️ Duplicate token found: ${tokenObj.token.substring(0, 15)}...`
          );
          return;
        }

        // Check if we already have a token for this device
        const existing = deviceTokenMap.get(deviceId);

        if (!existing) {
          // First time seeing this device
          deviceTokenMap.set(deviceId, {
            token: tokenObj.token,
            userId: user._id,
            lastUsed: tokenObj.lastUsed,
          });
          tokenSet.add(tokenObj.token);
        } else {
          // We already have a token for this device, keep the newest one
          if (new Date(tokenObj.lastUsed) > new Date(existing.lastUsed)) {
            // Remove old token from set
            tokenSet.delete(existing.token);
            // Add new one
            deviceTokenMap.set(deviceId, {
              token: tokenObj.token,
              userId: user._id,
              lastUsed: tokenObj.lastUsed,
            });
            tokenSet.add(tokenObj.token);
            console.log(`♻️ Updated token for device ${deviceId}`);
          }
        }
      });
    });

    // Convert map to array of tokens
    const allTokens = Array.from(deviceTokenMap.values()).map(
      (item) => item.token
    );

    console.log(
      `📊 Final token stats - Original users: ${users.length}, Unique devices: ${deviceTokenMap.size}, Final tokens: ${allTokens.length}`
    );

    if (allTokens.length === 0) {
      return { success: true, message: "No valid tokens found", sentCount: 0 };
    }

    // Determine notification template
    const template =
      alertData.priority === "critical"
        ? NOTIFICATION_TEMPLATES.CRITICAL_ALERT(alertData)
        : NOTIFICATION_TEMPLATES.AMBER_ALERT_CREATED(alertData);

    // Send notifications
    const notificationResult = await sendPushNotification(
      allTokens,
      template,
      alertData,
      alertData.priority === "critical" ? "high" : "normal"
    );

    // Mark this alert as sent
    await markNotificationSent(alertKey);

    // Update notification history for users (only for successfully sent tokens)
    const updatePromises = [];
    const successfulTokens = allTokens.filter(
      (token) => !notificationResult.failedTokens.includes(token)
    );

    // Group successful tokens by user
    const userSuccessMap = new Map();
    deviceTokenMap.forEach((value, deviceId) => {
      if (successfulTokens.includes(value.token)) {
        if (!userSuccessMap.has(value.userId)) {
          userSuccessMap.set(value.userId, []);
        }
        userSuccessMap.get(value.userId).push(value.token);
      }
    });

    // Update each user's notification history
    for (const [userId, tokens] of userSuccessMap.entries()) {
      updatePromises.push(
        User.findByIdAndUpdate(userId, {
          $push: {
            notificationHistory: {
              alertId: alertData._id,
              sentAt: new Date(),
              type: "created",
              status: "sent",
            },
          },
          $set: { lastNotificationSent: new Date() },
        })
      );
    }

    await Promise.all(updatePromises);

    // Clean up invalid tokens
    if (
      notificationResult.failedTokens &&
      notificationResult.failedTokens.length > 0
    ) {
      await cleanupInvalidTokens(notificationResult.failedTokens);
    }

    console.log(
      `✅ Alert sent successfully to ${notificationResult.successCount} devices`
    );

    return {
      success: true,
      sentCount: notificationResult.successCount,
      failedCount: notificationResult.failureCount,
      totalUsers: users.length,
      uniqueDevices: deviceTokenMap.size,
    };
  } catch (error) {
    console.error("❌ Error sending alerts to users:", error);
    return {
      success: false,
      error: error.message,
      sentCount: 0,
    };
  }
};

// Clean up invalid tokens
export const cleanupInvalidTokens = async (invalidTokens) => {
  try {
    if (!invalidTokens || invalidTokens.length === 0) return;

    console.log(`🧹 Cleaning up ${invalidTokens.length} invalid tokens...`);

    for (const token of invalidTokens) {
      await User.updateMany(
        { "fcmTokens.token": token },
        { $pull: { fcmTokens: { token: token } } }
      );
    }

    console.log(`✅ Cleaned up ${invalidTokens.length} invalid tokens`);
  } catch (error) {
    console.error("Error cleaning up invalid tokens:", error);
  }
};

// Create notification channels (for reference)
export const createNotificationChannels = async () => {
  return {
    channels: [
      {
        id: "amber_alerts",
        name: "AMBER Alerts",
        description: "General AMBER alerts and updates",
        importance: "high",
        sound: "default",
        vibration: true,
        lights: true,
      },
      {
        id: "amber_alerts_critical",
        name: "Critical AMBER Alerts",
        description: "Immediate attention required alerts",
        importance: "max",
        sound: "default",
        vibration: true,
        lights: true,
        bypassDnd: true,
        lockscreenVisibility: 1,
      },
    ],
  };
};
