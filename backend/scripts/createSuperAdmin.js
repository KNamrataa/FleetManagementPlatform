require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const MONGO_URI = process.env.MONGO_URI;

const SUPER_ADMIN = {
  fullName: "Super Admin",
  email: "admin@fleet.com",
  phone: "9012345678",
  password: "Admin@12345", 
};

async function createSuperAdmin() {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not set.");
    }

    await mongoose.connect(MONGO_URI);

    console.log("Connected to MongoDB Atlas.");

    const email = SUPER_ADMIN.email.trim().toLowerCase();

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (existingUser.role === "SUPER_ADMIN") {
        console.log("A Super Admin with this email already exists.");
        return;
      }

      console.log(
        `A user already exists with this email and has role: ${existingUser.role}`
      );
      console.log("No changes were made.");
      return;
    }

    const hashedPassword = await bcrypt.hash(
      SUPER_ADMIN.password,
      12
    );

    const user = await User.create({
      fullName: SUPER_ADMIN.fullName,
      email,
      phone: SUPER_ADMIN.phone,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
      accountStatus: "ACTIVE",
      forcePasswordChange: false,
    });

    console.log("\n====================================");
    console.log("SUPER ADMIN CREATED SUCCESSFULLY");
    console.log("====================================");
    console.log("ID:", user._id.toString());
    console.log("Name:", user.fullName);
    console.log("Email:", user.email);
    console.log("Role:", user.role);
    console.log("Status:", user.accountStatus);
    console.log("====================================\n");
  } catch (error) {
    console.error("Failed to create Super Admin:");
    console.error(error.message);
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed.");
  }
}

createSuperAdmin();