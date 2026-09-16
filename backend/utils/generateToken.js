const jwt = require("jsonwebtoken");
const generateToken = (userId, accessVersion = 0) => jwt.sign({ userId, accessVersion }, process.env.JWT_SECRET, { expiresIn: "1d" });
module.exports = generateToken;
