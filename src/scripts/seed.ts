/**
 * Seed Script - Create Admin User
 * 
 * Usage:
 * npm run seed
 * 
 * This script creates an admin user with the following credentials:
 * Email: admin@example.com
 * Password: Admin@123456
 * 
 * ⚠️  Change the password immediately after creation!
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import "dotenv/config";
import User from "../models/user";

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_CONNECTION_STRING as string);
    console.log("✅ Connected to MongoDB");

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: "admin@example.com" });
    if (existingAdmin) {
      console.log("⚠️  Admin user already exists!");
      console.log(`📧 Email: ${existingAdmin.email}`);
      console.log(`🔑 Role: ${existingAdmin.role}`);
      
      await mongoose.connection.close();
      return;
    }

    // Create admin user
    const adminUser = new User({
      email: "admin@example.com",
      password: "Admin@123456",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
      emailVerified: true,
    });

    await adminUser.save();

    console.log("✅ Admin user created successfully!");
    console.log("📧 Email: admin@example.com");
    console.log("🔑 Password: Admin@123456");
    console.log("⚠️  Please change the password immediately after login!");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
};

seedAdmin();
