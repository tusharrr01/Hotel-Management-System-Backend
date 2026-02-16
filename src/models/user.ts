import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { UserType } from "../../../shared/types";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true }, // Use random hash for OAuth users
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    image: { type: String }, // Profile image URL (from Google OAuth)
    // New fields for better user management
    role: {
      type: String,
      enum: ["user", "admin", "hotel_owner"],
      default: "user",
    },
    phone: { type: String },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    preferences: {
      preferredDestinations: [String],
      preferredHotelTypes: [String],
      budgetRange: {
        min: Number,
        max: Number,
      },
    },
    // Account security fields
    isBlocked: { type: Boolean, default: false },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date }, // Account lockout expiration
    // Audit fields
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 8);
  }
  next();
});

const User = mongoose.model<UserType>("User", userSchema);

export default User;
