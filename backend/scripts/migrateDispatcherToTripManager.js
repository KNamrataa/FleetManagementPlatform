require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

(async () => {
  try {
    await connectDB();
    const result = await User.updateMany({ role: "DISPATCHER" }, { $set: { role: "TRIP_MANAGER" } });
    console.log(`Migrated ${result.modifiedCount || 0} legacy DISPATCHER user(s) to TRIP_MANAGER.`);
  } catch (error) {
    console.error("Dispatcher role migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
