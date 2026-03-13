// model/userschema.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    phoneno: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["user", "police", "admin"],
      default: "user",
    },

    // =========================
    // Education Details
    // =========================
    state: {
      type: String,
    },

    distric: {
      type: String,
    },

    // =========================
    // Address Details
    // =========================
    address: {
      type: String,
    },

    city: {
      type: String,
    },

    pincode: {
      type: String,
    },

    // =========================
    // Police Specific Details
    // =========================
    badgeNumber: {
      type: String,
    },

    policeStation: {
      type: String,
    },

    designation: {
      type: String,
    },

    serviceYears: {
      type: Number,
    },

    employeeId: {
      type: String,
    },

    // =========================
    // Verification Images
    // =========================
    selfieImage: {
      type: String,
    },

    idProofImage: {
      type: String,
    },

    badgeImage: {
      type: String,
    },

    // =========================
    // Admin Verification
    // =========================
    isAccepted: {
      type: Boolean,
      default: function () {
        return this.role === "police" ? false : true;
      },
    },

    // =========================
    // User Location (GeoJSON)
    // =========================
    locationCoordinates: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function (v) {
            if (!v || v.length === 0) return true; // allow empty
            return (
              Array.isArray(v) &&
              v.length === 2 &&
              typeof v[0] === "number" &&
              typeof v[1] === "number"
            );
          },
          message: "Coordinates must be [longitude, latitude]",
        },
      },
    },
    // =========================
    // Notification Fields (NEW)
    // =========================
    fcmTokens: [
      {
        token: {
          type: String,
          required: true,
        },
        deviceType: {
          type: String,
          enum: ["ios", "android", "web"],
          default: "android",
        },
        deviceId: {
          type: String,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        lastUsed: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    notificationPreferences: {
      amberAlerts: {
        type: Boolean,
        default: true,
      },
      criticalAlerts: {
        type: Boolean,
        default: true,
      },
      soundEnabled: {
        type: Boolean,
        default: true,
      },
      vibrationEnabled: {
        type: Boolean,
        default: true,
      },
      alertRadius: {
        type: Number,
        default: 50, // radius in kilometers
      },
      preferredStates: [
        {
          type: String,
        },
      ],
      quietHours: {
        enabled: {
          type: Boolean,
          default: false,
        },
        start: {
          type: String,
          default: "22:00",
        },
        end: {
          type: String,
          default: "07:00",
        },
      },
    },

    lastNotificationSent: {
      type: Date,
    },

    notificationHistory: [
      {
        alertId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Alert",
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
        type: {
          type: String,
          enum: ["created", "resolved", "updated"],
        },
        status: {
          type: String,
          enum: ["sent", "failed", "delivered"],
          default: "sent",
        },
      },
    ],

    // Device information for targeting
    deviceInfo: {
      platform: String,
      version: String,
      model: String,
      lastActive: Date,
    },
  },
  { timestamps: true }
);

// Indexes for better query performance
userSchema.index({ "fcmTokens.token": 1 });
userSchema.index({ role: 1, isAccepted: 1 });
userSchema.index({ "notificationPreferences.preferredStates": 1 });
userSchema.index({ locationCoordinates: "2dsphere" }, { sparse: true });
// Method to add FCM token
userSchema.methods.addFCMToken = function (
  token,
  deviceType = "android",
  deviceId = null
) {
  // Check if token already exists
  const tokenExists = this.fcmTokens.some((t) => t.token === token);

  if (!tokenExists) {
    // Keep only last 5 tokens per user
    if (this.fcmTokens.length >= 5) {
      this.fcmTokens = this.fcmTokens.slice(-4);
    }

    this.fcmTokens.push({
      token,
      deviceType,
      deviceId,
      lastUsed: new Date(),
    });
  } else {
    // Update last used time
    const tokenIndex = this.fcmTokens.findIndex((t) => t.token === token);
    if (tokenIndex !== -1) {
      this.fcmTokens[tokenIndex].lastUsed = new Date();
      this.fcmTokens[tokenIndex].deviceType = deviceType;
    }
  }

  return this.save();
};

// Method to remove FCM token
userSchema.methods.removeFCMToken = function (token) {
  this.fcmTokens = this.fcmTokens.filter((t) => t.token !== token);
  return this.save();
};

// Method to get valid FCM tokens
userSchema.methods.getValidTokens = function () {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return this.fcmTokens
    .filter((t) => t.lastUsed > thirtyDaysAgo)
    .map((t) => t.token);
};

// Static method to get users for alert notification
userSchema.statics.getUsersForAlert = async function (alertData) {
  const query = {
    role: "user",
    isAccepted: true,
    "fcmTokens.0": { $exists: true },
    "notificationPreferences.amberAlerts": true,
  };

  // Filter by state if alert location is available
  if (alertData.lastSeenLocation) {
    // This is a simplified version - you might want to use geolocation queries
    query.$or = [
      { "notificationPreferences.preferredStates": { $in: [alertData.state] } },
      { "notificationPreferences.preferredStates": { $size: 0 } },
    ];
  }

  // For critical alerts, bypass quiet hours and other filters
  if (alertData.priority === "critical") {
    return this.find({
      ...query,
      "notificationPreferences.criticalAlerts": true,
    }).select("fcmTokens notificationPreferences");
  }

  // For normal alerts, respect quiet hours
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  return this.find({
    ...query,
    $or: [
      { "notificationPreferences.quietHours.enabled": false },
      {
        "notificationPreferences.quietHours.enabled": true,
        $and: [
          { "notificationPreferences.quietHours.start": { $gt: currentTime } },
          { "notificationPreferences.quietHours.end": { $lt: currentTime } },
        ],
      },
    ],
  }).select("fcmTokens notificationPreferences");
};

const User = mongoose.model("User", userSchema);

export default User;
