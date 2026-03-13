export const authRole = (...roles) => {
  // flatten roles if array is passed
  roles = roles.flat();

  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      // console.log(req.user, "user");

      return res.status(403).json({
        message: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};
