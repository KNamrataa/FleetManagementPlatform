const COOKIE_NAME = "fleet_token";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000, // 1 day
};
module.exports = { COOKIE_NAME, cookieOptions };
