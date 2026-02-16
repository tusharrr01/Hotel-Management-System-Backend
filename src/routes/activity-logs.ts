/**
 * Admin Activity Logs Routes
 * 
 * Endpoints:
 * GET /api/admin/activity-logs - Get all activity logs with pagination
 * GET /api/admin/activity-logs/stats - Get activity statistics
 * DELETE /api/admin/activity-logs - Clear activity logs
 */

import express, { Request, Response } from "express";
import verifyToken, { verifyRole } from "../middleware/auth";
import { getActivityLogs, getActivityStats, clearActivityLogs } from "../middleware/activityLogger";

const router = express.Router();

/**
 * @swagger
 * /api/admin/activity-logs:
 *   get:
 *     summary: Get activity logs
 *     description: Retrieve system activity logs with filtering and pagination (admin only)
 *     tags: [Admin - Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [GET, POST, PUT, PATCH, DELETE]
 *         description: Filter by HTTP method
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 100
 *         description: Maximum number of logs to return
 *     responses:
 *       200:
 *         description: Activity logs retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin only)
 */
router.get(
  "/activity-logs",
  verifyToken,
  verifyRole("admin"),
  (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string | undefined;
      const method = req.query.method as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 100, 1000); // Cap at 1000

      const logs = getActivityLogs(userId, method, limit);

      res.status(200).json({
        success: true,
        data: logs,
        count: logs.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch activity logs",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * @swagger
 * /api/admin/activity-logs/stats:
 *   get:
 *     summary: Get activity statistics
 *     description: Get statistics about system activities (admin only)
 *     tags: [Admin - Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Activity statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin only)
 */
router.get(
  "/activity-logs/stats",
  verifyToken,
  verifyRole("admin"),
  (req: Request, res: Response) => {
    try {
      const stats = getActivityStats();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch activity statistics",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * @swagger
 * /api/admin/activity-logs:
 *   delete:
 *     summary: Clear activity logs
 *     description: Clear all activity logs from memory (admin only, caution!)
 *     tags: [Admin - Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Activity logs cleared successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin only)
 */
router.delete(
  "/activity-logs",
  verifyToken,
  verifyRole("admin"),
  (req: Request, res: Response) => {
    try {
      clearActivityLogs();

      res.status(200).json({
        success: true,
        message: "Activity logs cleared successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to clear activity logs",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export default router;
