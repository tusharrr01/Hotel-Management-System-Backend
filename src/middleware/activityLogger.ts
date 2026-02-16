/**
 * Activity Logger Middleware
 * 
 * Logs all API requests for audit trail and security monitoring
 * Tracks: userId, method, path, IP, params, response status
 */

import { Request, Response, NextFunction } from "express";

interface Activity {
  userId?: string;
  timestamp: Date;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  statusCode?: number;
  params?: Record<string, any>;
  query?: Record<string, any>;
  duration: number;
  // Optional human-readable message or details (e.g., rejection reason)
  message?: string;
}

// In-memory storage for activities (in production, use MongoDB)
const activities: Activity[] = [];

// Keep only last 10,000 activities
const MAX_ACTIVITIES = 10000;

/**
 * Activity Logger Middleware
 * Logs all incoming requests and response status
 */
export const activityLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const originalSend = res.send;

  // Override res.send to capture status code
  res.send = function (data: any) {
    const duration = Date.now() - startTime;
    const activity: Activity = {
      userId: req.userId,
      timestamp: new Date(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress || "unknown",
      userAgent: req.get("user-agent") || "unknown",
      statusCode: res.statusCode,
      params: Object.keys(req.params).length > 0 ? req.params : undefined,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      duration,
      // If rejection reason provided in body, surface it as message for quick inspection
      message: (req.body && (req.body.reason || req.body.message)) || undefined,
    };

    // Only log if it's an important operation
    if (isImportantOperation(req.method, req.path)) {
      activities.push(activity);
      console.log(`📊 [${activity.timestamp.toISOString()}] ${activity.method} ${activity.path} - ${activity.statusCode} (${activity.duration}ms)`);

      // Prevent unbounded growth
      if (activities.length > MAX_ACTIVITIES) {
        activities.shift();
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Get activity logs with filtering
 */
export const getActivityLogs = (
  userId?: string,
  method?: string,
  limit: number = 100
): Activity[] => {
  let filtered = activities;

  if (userId) {
    filtered = filtered.filter(a => a.userId === userId);
  }
  if (method) {
    filtered = filtered.filter(a => a.method === method);
  }

  return filtered.slice(-limit).reverse();
};

/**
 * Get login logs
 */
export const getLoginLogs = (userId?: string, limit: number = 50): Activity[] => {
  let filtered = activities.filter(a => a.path === "/api/auth/login" && a.statusCode === 200);

  if (userId) {
    filtered = filtered.filter(a => a.userId === userId);
  }

  return filtered.slice(-limit).reverse();
};

/**
 * Determine if operation should be logged
 */
const isImportantOperation = (method: string, path: string): boolean => {
  // Log all mutations (POST, PUT, PATCH, DELETE)
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return true;
  }

  // Log admin operations
  if (path.includes("/api/admin")) {
    return true;
  }

  // Log auth operations
  if (path.includes("/api/auth")) {
    return true;
  }

  return false;
};

/**
 * Clear activity logs (admin only)
 */
export const clearActivityLogs = (): void => {
  activities.length = 0;
  console.log("🗑️  Activity logs cleared");
};

/**
 * Get activity statistics
 */
export const getActivityStats = () => {
  const stats = {
    totalActivities: activities.length,
    totalUsers: new Set(activities.map(a => a.userId).filter(Boolean)).size,
    activitiesByMethod: {
      GET: activities.filter(a => a.method === "GET").length,
      POST: activities.filter(a => a.method === "POST").length,
      PUT: activities.filter(a => a.method === "PUT").length,
      PATCH: activities.filter(a => a.method === "PATCH").length,
      DELETE: activities.filter(a => a.method === "DELETE").length,
    },
    lastActivity: activities[activities.length - 1]?.timestamp || null,
  };

  return stats;
};

/**
 * Programmatically add an activity entry. Useful for recording important
 * admin operations that may not be represented by a single HTTP request
 * or when extra context is required.
 */
export const logActivity = (entry: Partial<Activity> & { message?: string }) => {
  const activity: Activity = {
    userId: entry.userId,
    timestamp: entry.timestamp || new Date(),
    method: entry.method || "SYSTEM",
    path: entry.path || "/internal",
    ip: entry.ip || "127.0.0.1",
    userAgent: entry.userAgent || "system",
    statusCode: entry.statusCode,
    params: entry.params,
    query: entry.query,
    duration: entry.duration || 0,
    message: entry.message,
  };

  activities.push(activity);
  if (activities.length > MAX_ACTIVITIES) activities.shift();

  console.log(`📝 Activity logged: ${activity.method} ${activity.path} by ${activity.userId || 'system'}`);
};
