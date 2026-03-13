import jwt from "jsonwebtoken";
import User from "../model/userschema.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log(authHeader, "af");
    if (!authHeader) {
      return res.status(401).json({ message: "Token required" });
    }

    const token = authHeader.split(" ")[1];
    // console.log(token, "token");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }
    // console.log(req.user,'user')
    req.user = user; // attach user to request
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
