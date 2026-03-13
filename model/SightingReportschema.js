// models/SightingReport.js (New model for public reports)
import mongoose from "mongoose";

const sightingReportSchema = new mongoose.Schema({
  alertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Alert",
    required: true,
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  seenLocation: {
    type: String,
    required: true,
  },
  locationCoordinates: {
    latitude: Number,
    longitude: Number,
  },
  seenTime: {
    type: Date,
    required: true,
    default: Date.now,
  },
  description: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
  },
  additionalInfo: {
    type: String,
  },
  images: [
    {
      uri: String,
      filename: String,
    },
  ],
  status: {
    type: String,
    enum: ["new", "reviewed", "actioned", "dismissed"],
    default: "new",
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  reviewedAt: Date,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for faster queries
sightingReportSchema.index({ alertId: 1, status: 1 });
sightingReportSchema.index({ createdAt: -1 });

const SightingReport = mongoose.model("SightingReport", sightingReportSchema);
export default SightingReport;
