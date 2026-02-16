import express, { Request, Response } from "express";
import verifyToken, { verifyRole } from "../middleware/auth";
import {
  getDashboardStats,
  getAllUsers,
  toggleUserStatus,
  deleteUser,
  getAllHotels,
  deleteHotel,
  getBookingAnalytics,
  getUserAnalytics,
  changeUserRole,
  resetUserPassword,
  approveHotel,
  rejectHotel,
  setHotelActive,
  getHotelOwnerHotels,
  getHotelDetails,
} from "../controllers/adminController";

const router = express.Router();

/**
 * Test endpoint - verify admin routes are registered
 */
router.get("/test", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Admin routes are working!",
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Admin only - Get dashboard stats including totals and top performers
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Dashboard stats retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */
router.get(
  "/dashboard",
  verifyToken,
  verifyRole("admin"),
  getDashboardStats
);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users
 *     description: Admin only - Get paginated list of all users with optional filtering
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, hotel_owner, admin]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */
router.get(
  "/users",
  verifyToken,
  verifyRole("admin"),
  getAllUsers
);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   patch:
 *     summary: Toggle user status (block/unblock)
 *     description: Admin only - Activate or deactivate a user
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User status updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */
router.patch(
  "/users/:userId",
  verifyToken,
  verifyRole("admin"),
  toggleUserStatus
);

/**
 * Change user role (promote/demote)
 */
router.patch(
  "/users/:userId/role",
  verifyToken,
  verifyRole("admin"),
  changeUserRole
);

/**
 * Reset user password (returns temporary password)
 */
router.post(
  "/users/:userId/reset-password",
  verifyToken,
  verifyRole("admin"),
  resetUserPassword
);

/**
 * Get all hotels owned by a specific hotel owner
 */
router.get(
  "/hotel-owner/:userId/hotels",
  verifyToken,
  verifyRole("admin"),
  getHotelOwnerHotels
);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   delete:
 *     summary: Delete a user
 *     description: Admin only - Delete a user and all associated data
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */
router.delete(
  "/users/:userId",
  verifyToken,
  verifyRole("admin"),
  deleteUser
);

/**
 * @swagger
 * /api/admin/hotels:
 *   get:
 *     summary: Get all hotels
 *     description: Admin only - Get paginated list of all hotels
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Hotels retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */
router.get(
  "/hotels",
  verifyToken,
  verifyRole("admin"),
  getAllHotels
);

/**
 * @swagger
 * /api/admin/hotels/{hotelId}:
 *   delete:
 *     summary: Delete a hotel
 *     description: Admin only - Delete a hotel and all associated bookings
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Hotel deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Hotel not found
 */
router.delete(
  "/hotels/:hotelId",
  verifyToken,
  verifyRole("admin"),
  deleteHotel
);

/** Approve a hotel */
router.patch(
  "/hotels/:hotelId/approve",
  verifyToken,
  verifyRole("admin"),
  approveHotel
);

/** Reject a hotel */
router.patch(
  "/hotels/:hotelId/reject",
  verifyToken,
  verifyRole("admin"),
  rejectHotel
);

/** Activate/deactivate hotel */
router.patch(
  "/hotels/:hotelId/active",
  verifyToken,
  verifyRole("admin"),
  setHotelActive
);

/** Get detailed hotel information including bookings */
router.get(
  "/hotels/:hotelId/details",
  verifyToken,
  verifyRole("admin"),
  getHotelDetails
);

/**
 * @swagger
 * /api/admin/analytics/bookings:
 *   get:
 *     summary: Get booking analytics
 *     description: Admin only - Get booking trends and status distribution
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Booking analytics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */
router.get(
  "/analytics/bookings",
  verifyToken,
  verifyRole("admin"),
  getBookingAnalytics
);

/**
 * @swagger
 * /api/admin/analytics/users:
 *   get:
 *     summary: Get user analytics
 *     description: Admin only - Get user distribution by role and registration trends
 *     security:
 *       - BearerAuth: []
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: User analytics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */
router.get(
  "/analytics/users",
  verifyToken,
  verifyRole("admin"),
  getUserAnalytics
);

export default router;
