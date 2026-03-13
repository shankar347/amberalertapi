import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cloudinary from "../config/cloudinary.js";
import Alert from "../model/alertschema.js";
import User from "../model/userschema.js";

/*
=====================================
REGISTER USER / POLICE
=====================================
*/

export const Signup = async (req, res) => {
  try {
    const {
      username: name,
      email,
      mobile: phoneno,
      password,
      role,
      state,
      distric,
      address,
      city,
      pincode,
      badgeNumber,
      policeStation,
      designation,
      serviceYears,
      employeeId,
    } = req.body;
    const existingUser = await User.findOne({ email });

    console.log(existingUser);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already registered with this email",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let selfieImage = null;
    let idProofImage = null;
    let badgeImage = null;

    // SELFIE
    if (req.files?.selfie) {
      const result = await cloudinary.uploader.upload(
        req.files.selfie[0].path,
        { folder: "amber_alert/selfie" }
      );
      selfieImage = result.secure_url;
    }

    // ID PROOF
    if (req.files?.idProof) {
      const result = await cloudinary.uploader.upload(
        req.files.idProof[0].path,
        { folder: "amber_alert/id_proof" }
      );
      idProofImage = result.secure_url;
    }

    // BADGE
    if (req.files?.badge) {
      const result = await cloudinary.uploader.upload(req.files.badge[0].path, {
        folder: "amber_alert/badge",
      });
      badgeImage = result.secure_url;
    }

    const newUser = new User({
      name,
      email,
      phoneno,
      password: hashedPassword,
      role,
      state,
      distric,
      address,
      city,
      pincode,
      badgeNumber,
      policeStation,
      designation,
      serviceYears,
      employeeId,
      selfieImage,
      idProofImage,
      badgeImage,
    });
    console.log(newUser, "newUser");
    await newUser.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: newUser,
    });
  } catch (error) {
    console.log(error, "");
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

/*
=====================================
LOGIN USER
=====================================
*/
export const Login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // if (user.role === "police" && !user.isAccepted) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Police account waiting for admin approval",
    //   });
    // }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    let data = user.toObject();

    data = {
      ...data,
      token,
    };

    res.status(200).json({
      success: true,
      message: "Login successful",
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

/*
=====================================
GET USER PROFILE
=====================================
*/
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get profile",
      error: error.message,
    });
  }
};

/*
=====================================
UPDATE USER PROFILE
=====================================
*/
export const updateProfile = async (req, res) => {
  try {
    const userId = req.params.id;

    const {
      name,
      phoneno,
      state,
      distric,
      address,
      city,
      email,
      pincode,
      policeStation,
      designation,
      serviceYears,
      badgeNumber,
      employeeId,
      password,
      locationCoordinates,
    } = req.body;
    console.log(req.body, "body");
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    /*
    =============================
    KEEP EXISTING IMAGES
    =============================
    */

    let selfieImage = user.selfieImage;
    let idProofImage = user.idProofImage;
    let badgeImage = user.badgeImage;

    /*
    =============================
    SELFIE IMAGE UPDATE
    =============================
    */

    if (locationCoordinates) {
      let coords = locationCoordinates;

      if (typeof locationCoordinates === "string") {
        coords = JSON.parse(locationCoordinates);
      }

      if (coords.longitude && coords.latitude) {
        user.locationCoordinates = {
          type: "Point",
          coordinates: [coords.longitude, coords.latitude],
        };
      }
    }

    if (req.files?.selfie) {
      const result = await cloudinary.uploader.upload(
        req.files.selfie[0].path,
        { folder: "amber_alert/selfie" }
      );

      selfieImage = result.secure_url;
    }

    /*
    =============================
    UPDATE USER DATA
    =============================
    */

    user.name = name || user.name;
    user.email = email || user.email;

    user.phoneno = phoneno || user.phoneno;

    user.state = state || user.state;
    user.distric = distric || user.distric;
    user.address = address || user.address;
    user.city = city || user.city;
    user.pincode = pincode || user.pincode;

    user.policeStation = policeStation || user.policeStation;
    user.designation = designation || user.designation;
    user.serviceYears = serviceYears || user.serviceYears;
    user.badgeNumber = badgeNumber || user.badgeNumber;
    user.employeeId = employeeId || user.employeeId;

    user.selfieImage = selfieImage;
    user.idProofImage = idProofImage;
    user.badgeImage = badgeImage;

    /*
    =============================
    PASSWORD UPDATE
    =============================
    */

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Profile update failed",
      error: error.message,
    });
  }
};

export const getUserAlerts = async (req, res) => {
  try {
    const userId = req.user.id;

    const { radius = 5000, page = 1, limit = 20, priority } = req.query;

    const user = await User.findById(userId).select("locationCoordinates");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (
      !user.locationCoordinates ||
      !user.locationCoordinates.coordinates ||
      user.locationCoordinates.coordinates.length !== 2
    ) {
      return res.status(400).json({
        success: false,
        message: "User location not available",
      });
    }

    const [longitude, latitude] = user.locationCoordinates.coordinates;

    let query = {
      status: "active",
      "locationCoordinates.coordinates": { $exists: true },

      locationCoordinates: {
        $geoWithin: {
          $centerSphere: [[longitude, latitude], parseInt(radius) / 6378.1],
        },
      },
    };

    if (priority) query.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const alerts = await Alert.find(query)
      .select("-tips -broadcastChannels -__v")
      .populate("issuedBy", "name policeStation badgeNumber")
      .sort({ priority: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Alert.countDocuments(query);
    console.log(alerts, "alerts");
    res.status(200).json({
      success: true,
      data: alerts,
      location: { latitude, longitude, radius: parseInt(radius) },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error("Get user alerts error:", error);

    res.status(500).json({
      success: false,
      message: "Error fetching alerts near user",
      error: error.message,
    });
  }
};

/*
=====================================
GET ALL USERS (ADMIN)
=====================================
*/
export const getRegisteredPolice = async (req, res) => {
  try {
    const users = await User.find({ role: "Police" }).select("-password");

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

/*
=====================================
APPROVE POLICE ACCOUNT
=====================================
*/
export const approvePolice = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      { isAccepted: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Police user not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Police account approved",
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Approval failed",
      error: error.message,
    });
  }
};

/*
=====================================
GET USER ALERTS BASED ON LOCATION
=====================================
*/
