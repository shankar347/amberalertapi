// utils/notificationHelper.js
import admin from "firebase-admin";
import User from "../model/userschema.js";

// Initialize Firebase Admin
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

// Send push notifications to multiple tokens
export const sendPushNotification = async (
  tokens,
  notificationData,
  alertData,
  priority = "normal"
) => {
  if (!tokens || tokens.length === 0) {
    return { success: false, message: "No tokens provided" };
  }

  // Remove duplicate tokens
  const uniqueTokens = [...new Set(tokens)];

  // Prepare messages
  const messages = uniqueTokens.map((token) => ({
    token: token,
    notification: {
      title: notificationData.title,
      body: notificationData.body,
    },
    data: {
      type: "AMBER_ALERT",
      alertId: alertData._id.toString(),
      caseId: alertData.caseId,
      childName: alertData.childName,
      age: alertData.age.toString(),
      priority: alertData.priority,
      lastSeenLocation: alertData.lastSeenLocation,
      timestamp: new Date().toISOString(),
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    android: {
      priority: priority === "high" ? "high" : "normal",
      notification: {
        channelId:
          alertData.priority === "critical"
            ? "amber_alerts_critical"
            : "amber_alerts",
        priority: alertData.priority === "critical" ? "max" : "high",
        visibility: "public",
        sound: "default",
        color: alertData.priority === "critical" ? "#FF4444" : "#FF8F00",
        tag: alertData._id.toString(),
        sticky: false,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
          contentAvailable: true,
          category: "AMBER_ALERT",
          "mutable-content": 1,
        },
      },
      headers: {
        "apns-priority": alertData.priority === "critical" ? "10" : "5",
      },
    },
  }));

  // Send notifications in batches of 500 (FCM limit)
  const batchSize = 500;
  const results = [];

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((message) =>
        admin
          .messaging()
          .send(message)
          .catch((error) => {
            console.error("Error sending to token:", error);
            return null;
          })
      )
    );
    results.push(...batchResults);
  }

  // Process results
  const successCount = results.filter(
    (r) => r.status === "fulfilled" && r.value
  ).length;
  const failureCount = results.filter(
    (r) => r.status === "rejected" || !r.value
  ).length;

  // Get failed tokens for cleanup
  const failedTokens = [];
  results.forEach((result, index) => {
    if (result.status === "rejected" || !result.value) {
      failedTokens.push(uniqueTokens[index]);
    }
  });

  return {
    success: true,
    successCount,
    failureCount,
    failedTokens,
    total: uniqueTokens.length,
  };
};

// Send alert to users based on preferences
export const sendAlertToUsers = async (alertData) => {
  try {
    // Get users who should receive this alert
    const users = await User.getUsersForAlert(alertData);

    if (!users || users.length === 0) {
      return { success: true, message: "No users to notify", sentCount: 0 };
    }

    // Collect all valid tokens
    const allTokens = [];
    const userTokenMap = new Map(); // Map to track which user owns which token

    users.forEach((user) => {
      const validTokens = user.getValidTokens();
      validTokens.forEach((token) => {
        allTokens.push(token);
        userTokenMap.set(token, user._id);
      });
    });

    if (allTokens.length === 0) {
      return { success: true, message: "No valid tokens found", sentCount: 0 };
    }

    // Determine notification template based on priority
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

    // Update notification history for users
    const updatePromises = [];
    const sentTokens = allTokens.filter((_, index) =>
      notificationResult.failureCount
        ? !notificationResult.failedTokens.includes(allTokens[index])
        : true
    );

    // Group tokens by user
    const userTokens = {};
    sentTokens.forEach((token) => {
      const userId = userTokenMap.get(token);
      if (userId) {
        if (!userTokens[userId]) {
          userTokens[userId] = [];
        }
        userTokens[userId].push(token);
      }
    });

    // Update each user's notification history
    for (const [userId, tokens] of Object.entries(userTokens)) {
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

    return {
      success: true,
      sentCount: notificationResult.successCount,
      failedCount: notificationResult.failureCount,
      totalUsers: users.length,
    };
  } catch (error) {
    console.error("Error sending alerts to users:", error);
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
    for (const token of invalidTokens) {
      await User.updateMany(
        { "fcmTokens.token": token },
        { $pull: { fcmTokens: { token: token } } }
      );
    }
    console.log(`Cleaned up ${invalidTokens.length} invalid tokens`);
  } catch (error) {
    console.error("Error cleaning up invalid tokens:", error);
  }
};

// Create notification channels (call this once)
export const createNotificationChannels = async () => {
  // This is for Android - you can call this API from your app
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
