import express from "express";
import cors from "cors";
import cookieparser from "cookie-parser";
import dotenv from "dotenv";
import mongoose from "mongoose";
import UserRouter from "./routes/userroutes.js";
import policeAlertRoutes from "./routes/policealertroutes.js";
import userAlertRoutes from "./routes/alertroutes.js";
import NotificationRoutes from "./routes/notificationRoutes.js";

const app = express();

dotenv.config();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors({ origin: "*", credentials: true }));
app.use(cookieparser());

mongoose.connect(process.env.MONGO_URI);

/* ROOT ROUTE */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Police Alert API is running successfully",
    version: "1.0.0",
    endpoints: {
      user: "/api/v1/user",
      police: "/api/v1/police",
      public: "/api/v1/public",
      notification: "/api/v1/notification",
    },
  });
});

app.use("/api/v1/user", UserRouter);
app.use("/api/v1/police", policeAlertRoutes);
app.use("/api/v1/public", userAlertRoutes);
app.use("/api/v1/notification", NotificationRoutes);

app.listen(5000, () => {
  console.log("Server is running on 5000");
});
