export const NOTIFICATION_CHANNELS = {
  AMBER_ALERT: {
    id: "amber_alerts",
    name: "AMBER Alerts",
    description: "Critical child abduction alerts",
    importance: "high",
    sound: "default",
    vibration: true,
  },
  GENERAL: {
    id: "general_notifications",
    name: "General Notifications",
    description: "General updates and information",
    importance: "default",
    sound: "default",
    vibration: true,
  },
};

// utils/notificationTemplates.js
export const NOTIFICATION_TEMPLATES = {
  AMBER_ALERT_CREATED: (alert) => ({
    title: `🚨 AMBER ALERT: ${alert.childName}`,
    body: `${alert.childName}, ${alert.age} years old, last seen at ${
      alert.lastSeenLocation
    }. Priority: ${alert.priority.toUpperCase()}`,
  }),
  AMBER_ALERT_RESOLVED: (alert) => ({
    title: `✅ Alert Resolved: ${alert.childName}`,
    body: `${alert.childName} has been found safe. Thank you for your vigilance.`,
  }),
  CRITICAL_ALERT: (alert) => ({
    title: `⚠️ CRITICAL AMBER ALERT: ${alert.childName}`,
    body: `URGENT: ${alert.childName}, ${alert.age} years old, requires immediate attention. Last seen: ${alert.lastSeenLocation}`,
  }),
};
