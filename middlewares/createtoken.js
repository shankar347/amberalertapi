import jwt from "jsonwebtoken";

const createToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role, // important for role-based auth
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

export default createToken;
