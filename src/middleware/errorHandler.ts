
import { NextFunction, Request, Response } from "express";

export interface ApiError extends Error {
  statusCode?: number;
  details?: Record<string, any>;
}

/**
 * Centralized error handler middleware
 * Logs errors and sends consistent error responses (ALWAYS JSON)
 */
export const errorHandler = (
  err: ApiError | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err?.statusCode || err?.status || 500;
  const message = err?.message || "Internal Server Error";

  // Ensure we always return JSON, never HTML
  res.setHeader("Content-Type", "application/json");

  // Log error with context
  const errorLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    message,
    details: err?.details,
    userId: (req as any).userId,
    userRole: (req as any).userRole,
  };

  if (statusCode >= 500) {
    console.error("❌ Server Error:", errorLog);
    console.error("Stack:", err?.stack);
  } else {
    console.warn("⚠️  Client Error:", errorLog);
  }

  // Send consistent JSON response
  res.status(statusCode).json({
    success: false,
    message,
    details: process.env.NODE_ENV === "development" ? err?.details : undefined,
    timestamp: new Date().toISOString(),
    path: process.env.NODE_ENV === "development" ? req.path : undefined,
    ...(process.env.NODE_ENV === "development" && { stack: err?.stack }),
  });
};

/**
 * Async route wrapper to catch promise rejections
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error("❌ Async Handler caught error:", error);
      next(error);
    });
  };

/**
 * Custom error class for consistent error handling
 */
export class AppError extends Error implements ApiError {
  statusCode: number;
  details?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}
