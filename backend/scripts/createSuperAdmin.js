require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const User = require("../models/User");

const createSuperAdmin =
  async () => {
    try {
      await mongoose.connect(
        process.env.MONGO_URI
      );

      console.log(
        "MongoDB connected."
      );

      const existingAdmin =
        await User.findOne({
          email:
            "admin@fleetflow.com",
        });

      if (existingAdmin) {
        console.log(
          "Super Admin already exists."
        );

        process.exit(0);
      }

      const password =
        "Admin@12345";

      const hashedPassword =
        await bcrypt.hash(
          password,
          12
        );

      await User.create({
        fullName:
          "FleetFlow Administrator",

        email:
          "admin@fleetflow.com",

        phone: null,

        password:
          hashedPassword,

        role:
          "SUPER_ADMIN",

        accountStatus:
          "ACTIVE",
      });

      console.log(
        "Super Admin created successfully."
      );

      console.log(
        "Email: admin@fleetflow.com"
      );

      console.log(
        "Password: Admin@12345"
      );

      process.exit(0);
    } catch (error) {
      console.error(
        "Failed to create Super Admin:",
        error
      );

      process.exit(1);
    }
  };

createSuperAdmin();