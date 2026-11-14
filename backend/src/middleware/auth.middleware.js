const jwt = require("jsonwebtoken");
const { runWithUser } = require("../lib/requestContext");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  req.user = decoded; // { userId, role }
  // File links built during this request are signed for this user.
  return runWithUser(decoded, next);
};

module.exports = { verifyToken };
