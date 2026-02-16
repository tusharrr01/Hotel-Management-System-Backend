import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import "dotenv/config";
import mongoose from "mongoose";
import userRoutes from "./routes/users";
import authRoutes from "./routes/auth";
import cookieParser from "cookie-parser";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import myHotelRoutes from "./routes/my-hotels";
import hotelRoutes from "./routes/hotels";
import bookingRoutes from "./routes/my-bookings";
import bookingsManagementRoutes from "./routes/bookings";
import healthRoutes from "./routes/health";
import businessInsightsRoutes from "./routes/business-insights";
import adminRoutes from "./routes/admin";
import activityLogsRoutes from "./routes/activity-logs";
import { activityLogger } from "./middleware/activityLogger";
import swaggerUi from "swagger-ui-express";
import { specs } from "./swagger";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/errorHandler";
import jwt, { JwtPayload } from "jsonwebtoken";

// Environment Variables Validation
const requiredEnvVars = [
  "MONGODB_CONNECTION_STRING",
  "JWT_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
  process.exit(1);
}

console.log("✅ All required environment variables are present");
console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || "Not set"}`);
console.log(
  `🔗 Backend URL: ${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`}`
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log("☁️  Cloudinary configured successfully");

// MongoDB Connection with Error Handling
const connectDB = async () => {
  try {
    console.log("📡 Attempting to connect to MongoDB...");
    await mongoose.connect(process.env.MONGODB_CONNECTION_STRING as string);
    console.log("✅ MongoDB connected successfully");
    console.log(`📦 Database: ${mongoose.connection.db.databaseName}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    console.error("💡 Please check your MONGODB_CONNECTION_STRING");
    process.exit(1);
  }
};

// Handle MongoDB connection events
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected. Attempting to reconnect...");
});

mongoose.connection.on("error", (error) => {
  console.error("❌ MongoDB connection error:", error);
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected successfully");
});

connectDB();

const app = express();

// Security middleware
app.use(helmet());

// Trust proxy for production (fixes rate limiting issues)
app.set("trust proxy", 1);

// Custom middleware to get user role from token for rate limiting
const getUserRoleFromToken = (token?: string): string => {
  if (!token) return "anonymous";
  try {
    // Remove "Bearer " prefix if present
    const cleanToken = token.startsWith("Bearer ") ? token.substring(7) : token;
    const decoded = jwt.verify(
      cleanToken,
      process.env.JWT_SECRET_KEY as string
    ) as JwtPayload;
    return decoded.userRole || "user";
  } catch (error) {
    return "anonymous";
  }
};

// Create limiters once (more efficient than per-request)
const hotelOwnerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Hotel owners get high limit
  message:
    "Too many requests from this IP, please try again later. (Hotel Owner Rate Limit)",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => false,
});

const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Users get moderate limit
  message:
    "Too many requests from this IP, please try again later. (User Rate Limit)",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => false,
});

const anonLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Anonymous users get lower limit
  message:
    "Too many requests from this IP, please try again later. (Anonymous Rate Limit)",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => false,
});

// Role-based rate limiting middleware
const roleBasedRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Skip rate limiting for health checks and status endpoint
  if (
    req.path === "/api/health" ||
    req.path === "/api/status" ||
    req.path === "/api/auth/validate-token" ||
    req.path === "/api/auth/google-callback"
  ) {
    return next();
  }

  // Extract token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : req.cookies?.["session_id"];

  const userRole = getUserRoleFromToken(token);

  // ADMIN: No rate limit - unlimited access
  if (userRole === "admin") {
    return next();
  }

  // HOTEL_OWNER: Higher limit - 500 requests per 15 minutes
  if (userRole === "hotel_owner") {
    return hotelOwnerLimiter(req, res, next);
  }

  // USER: Standard limit - 300 requests per 15 minutes
  if (userRole === "user") {
    return userLimiter(req, res, next);
  }

  // ANONYMOUS: Standard limit - 100 requests per 15 minutes
  return anonLimiter(req, res, next);
};

// Apply role-based rate limiting to all API routes
app.use("/api/", roleBasedRateLimiter);

// Special limiter for payment endpoints (applies on top of role-based)
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit payment requests separately
  message: "Too many payment requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip admins
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : req.cookies?.["session_id"];
    const userRole = getUserRoleFromToken(token);
    return userRole === "admin";
  },
});

app.use("/api/hotels/*/bookings/payment-intent", paymentLimiter);

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan("combined"));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5174",
  "http://localhost:5173",
  "https://mern-booking-hotel.netlify.app",
  "https://mern-booking-hotel.netlify.app/",
  "https://hotel-mern-booking.vercel.app",
  "https://hotel-mern-booking.vercel.app/",
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow all Netlify and Vercel preview URLs
      if (origin.includes("netlify.app") || origin.includes("vercel.app")) {
        return callback(null, true);
      }

      // Allow all Render deployment URLs
      if (origin.includes("onrender.com")) {
        return callback(null, true);
      }

      // Allow localhost
      if (origin.includes("localhost")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Log blocked origins in development
      if (process.env.NODE_ENV === "development") {
        console.log("CORS blocked origin:", origin);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "X-Requested-With",
    ],
    exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  })
);
// Explicit preflight handler for all routes
app.options(
  "*",
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow all Netlify and Vercel preview URLs
      if (origin.includes("netlify.app") || origin.includes("vercel.app")) {
        return callback(null, true);
      }

      // Allow all Render deployment URLs
      if (origin.includes("onrender.com")) {
        return callback(null, true);
      }

      // Allow localhost
      if (origin.includes("localhost")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "X-Requested-With",
    ],
    exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Activity Logger Middleware - logs all important operations
app.use(activityLogger);

app.use((req, res, next) => {
  // Ensure Vary header for CORS
  res.header("Vary", "Origin");
  next();
});

app.get("/", (req: Request, res: Response) => {
  res.send("<h1>Hotel Booking Backend API is running 🚀</h1>");
});

// Diagnostics endpoint - helps debug API issues
app.get("/api/status", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Backend is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    port: process.env.PORT || 5000,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/my-hotels", myHotelRoutes);
app.use("/api/hotels", hotelRoutes);
app.use("/api/my-bookings", bookingRoutes);
app.use("/api/bookings", bookingsManagementRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/business-insights", businessInsightsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", activityLogsRoutes);

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Hotel Booking API Documentation",
  })
);

// 404 handler - must be before error handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    available_routes: [
      "GET /api/health",
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET /api/auth/validate-token",
      "GET /api/admin/dashboard",
      "GET /api/admin/users",
      "GET /api/admin/hotels",
      "GET /api/business-insights",
    ],
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler (must be last)
app.use(errorHandler);

// Dynamic Port Configuration (for Coolify/VPS and local development)
const PORT = process.env.PORT || 5000;

const backendBaseUrl =
  process.env.BACKEND_URL?.replace(/\/$/, "") || `http://localhost:${PORT}`;

const server = app.listen(PORT, () => {
  console.log("🚀 ============================================");
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`🔗 Public: ${backendBaseUrl}`);
  console.log(`📚 API Docs: ${backendBaseUrl}/api-docs`);
  console.log(`💚 Health Check: ${backendBaseUrl}/api/health`);
  console.log("🚀 ============================================");
});

// Graceful Shutdown Handler
const gracefulShutdown = (signal: string) => {
  console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("🔒 HTTP server closed");

    try {
      await mongoose.connection.close();
      console.log("🔒 MongoDB connection closed");
      console.log("✅ Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error("⚠️  Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});
