import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      unique: true,
      sparse: true,
    },
    childName: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
      required: true,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    childPhoto: {
      type: String,
    },

    additionalImages: [
      {
        type: String,
      },
    ],
    distinguishingFeatures: {
      type: String,
    },
    lastSeenLocation: {
      type: String,
      required: true,
    },
    lastSeenDate: {
      type: Date,
      required: true,
    },
    contactInfo: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "resolved", "expired"],
      default: "active",
    },
    priority: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // FIXED: locationCoordinates field
    locationCoordinates: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function (v) {
            // If coordinates are provided, they must be an array of 2 numbers
            if (v && v.length > 0) {
              return (
                Array.isArray(v) &&
                v.length === 2 &&
                typeof v[0] === "number" &&
                typeof v[1] === "number"
              );
            }
            return true; // Skip validation if no coordinates
          },
          message: "Coordinates must be an array of [longitude, latitude]",
        },
      },
    },
    tips: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SightingReport",
      },
    ],
    broadcastChannels: [
      {
        type: String,
        enum: ["police", "hospital", "newspaper", "social_media", "television"],
      },
    ],
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Create geospatial index for location-based queries - with sparse: true
alertSchema.index({ locationCoordinates: "2dsphere" }, { sparse: true });

// Generate caseId function
export async function generateCaseId() {
  const prefix = "AMB";
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const caseId = `${prefix}-${timestamp}-${randomStr}`;
  return caseId;
}

// Instance methods
alertSchema.methods.incrementViews = async function () {
  this.views += 1;
  return this.save();
};

alertSchema.methods.resolveAlert = async function () {
  this.status = "resolved";
  this.updatedAt = new Date();
  return this.save();
};

alertSchema.methods.addTip = async function (tipId) {
  if (!this.tips.includes(tipId)) {
    this.tips.push(tipId);
    await this.save();
  }
  return this;
};

// Static methods
alertSchema.statics.findActiveAlerts = function () {
  return this.find({ status: "active" });
};

alertSchema.statics.findByPriority = function (priority) {
  return this.find({ status: "active", priority }).sort({ createdAt: -1 });
};

alertSchema.statics.findNearby = function (
  longitude,
  latitude,
  maxDistance = 10000
) {
  return this.find({
    status: "active",
    locationCoordinates: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance,
      },
    },
  });
};

alertSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        critical: {
          $sum: { $cond: [{ $eq: ["$priority", "critical"] }, 1, 0] },
        },
        high: {
          $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] },
        },
        medium: {
          $sum: { $cond: [{ $eq: ["$priority", "medium"] }, 1, 0] },
        },
        low: {
          $sum: { $cond: [{ $eq: ["$priority", "low"] }, 1, 0] },
        },
      },
    },
  ]);

  return stats;
};

const Alert = mongoose.model("Alert", alertSchema);

export default Alert;
