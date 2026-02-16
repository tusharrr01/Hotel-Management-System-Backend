import { Request, Response } from "express";
import User from "../models/user";
import Hotel from "../models/hotel";
import Booking from "../models/booking";
import { AppError, asyncHandler } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";

/**
 * Admin Analytics Controller
 * Provides dashboard stats and business insights
 */

/**
 * Get dashboard statistics
 * Only accessible to admin
 */
export const getDashboardStats = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      console.log("📊 Dashboard request received from user:", (req as any).userId);
      console.log("🔐 User role:", (req as any).userRole);

      const totalUsers = await User.countDocuments();
      const totalHotels = await Hotel.countDocuments();
      const totalBookings = await Booking.countDocuments();

      console.log(`✅ Database queries completed: ${totalUsers} users, ${totalHotels} hotels, ${totalBookings} bookings`);

      // Calculate total revenue
      const revenueData = await Booking.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalCost" },
          },
        },
      ]);

      const totalRevenue = revenueData[0]?.totalRevenue || 0;

      // Get top 5 hotels by bookings
      const topHotels = await Booking.aggregate([
        {
          $group: {
            _id: "$hotelId",
            bookingCount: { $sum: 1 },
            totalRevenue: { $sum: "$totalCost" },
          },
        },
        { $sort: { bookingCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "hotels",
            localField: "_id",
            foreignField: "_id",
            as: "hotelDetails",
          },
        },
        {
          $project: {
            _id: 1,
            bookingCount: 1,
            totalRevenue: 1,
            hotelName: { $arrayElemAt: ["$hotelDetails.name", 0] },
          },
        },
      ]);

      // Get recent bookings (last 10)
      const recentBookings = await Booking.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("userId", "firstName lastName email")
        .populate("hotelId", "name city");

      // Get active users (logged in last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const activeUsers = await User.countDocuments({
        lastLogin: { $gte: thirtyDaysAgo },
      });

      // Get hotel owners count
      const hotelOwners = await User.countDocuments({ role: "hotel_owner" });

      const dashboardStats = {
        totalUsers,
        totalHotels,
        totalBookings,
        hotelOwners,
        activeUsers,
        totalRevenue,
        topHotels: topHotels.filter((hotel) => hotel.hotelName), // Filter out hotels without names
        recentBookings: recentBookings.map((booking: any) => ({
          _id: booking._id,
          guestName: booking.userId?.firstName || "Unknown",
          hotelName: booking.hotelId?.name || "Unknown",
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          totalCost: booking.totalCost,
          status: booking.status,
          createdAt: booking.createdAt,
        })),
      };

      console.log("✅ Dashboard stats compiled successfully");

      res.setHeader("Content-Type", "application/json");
      res.status(200).json({
        success: true,
        data: dashboardStats,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("❌ Dashboard stats error:", err);
      throw new AppError(
        "Failed to fetch dashboard statistics",
        500,
        { error: err.message }
      );
    }
  }
);

/**
 * Get all users with pagination and filtering
 */
export const getAllUsers = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, role, search } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const filter: any = {};

    if (role && role !== "all") {
      filter.role = role;
    }

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("-password")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalUsers: total,
        usersPerPage: limitNum,
      },
    });
  }
);

/**
 * Block/Unblock a user
 */
export const toggleUserStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      throw new AppError("isActive must be a boolean", 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Prevent deactivating admin users through this endpoint
    if (user.role === "admin") {
      throw new AppError("Cannot modify admin user status", 403);
    }

    user.isActive = isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: {
        _id: user._id,
        email: user.email,
        isActive: user.isActive,
      },
    });
  }
);

/**
 * Delete a user
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Prevent deleting admin users
  if (user.role === "admin") {
    throw new AppError("Cannot delete admin user", 403);
  }

  // Delete all user's bookings and hotels
  await Booking.deleteMany({ userId });
  if (user.role === "hotel_owner") {
    await Hotel.deleteMany({ userId });
  }

  await User.findByIdAndDelete(userId);

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
  });
});

/**
 * Get all hotels with pagination
 */
export const getAllHotels = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, search } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const filter: any = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { country: { $regex: search, $options: "i" } },
      ];
    }

    const hotels = await Hotel.find(filter)
      .skip(skip)
      .limit(limitNum)
      .populate("userId", "firstName lastName email")
      .sort({ createdAt: -1 });

    const total = await Hotel.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: hotels,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalHotels: total,
        hotelsPerPage: limitNum,
      },
    });
  }
);

/**
 * Delete a hotel
 */
export const deleteHotel = asyncHandler(async (req: Request, res: Response) => {
  const { hotelId } = req.params;

  const hotel = await Hotel.findById(hotelId);
  if (!hotel) {
    throw new AppError("Hotel not found", 404);
  }

  // Delete all bookings for this hotel
  await Booking.deleteMany({ hotelId });

  await Hotel.findByIdAndDelete(hotelId);

  res.status(200).json({
    success: true,
    message: "Hotel deleted successfully",
  });
});

/**
 * Approve a hotel (set isApproved=true and isActive=true)
 */
export const approveHotel = asyncHandler(async (req: Request, res: Response) => {
  const { hotelId } = req.params;

  const hotel = await Hotel.findById(hotelId);
  if (!hotel) {
    throw new AppError("Hotel not found", 404);
  }

  hotel.isApproved = true;
  hotel.isActive = true;
  // Clear previous rejection info when approving
  hotel.lastRejectionReason = null;
  hotel.lastRejectedAt = null;
  await hotel.save();

  res.status(200).json({
    success: true,
    message: "Hotel approved successfully",
    data: { _id: hotel._id, isApproved: hotel.isApproved, isActive: hotel.isActive },
  });

  try {
    logActivity({
      userId: (req as any).userId,
      method: "PATCH",
      path: `/api/admin/hotels/${hotelId}/approve`,
      params: { hotelId },
      query: { action: "approve" },
    });
  } catch (e) {
    console.warn("Failed to record activity for hotel approve", e);
  }
});

/**
 * Reject a hotel (set isApproved=false and isActive=false)
 */
export const rejectHotel = asyncHandler(async (req: Request, res: Response) => {
  const { hotelId } = req.params;

  const { reason } = req.body as { reason?: string };

  const hotel = await Hotel.findById(hotelId);
  if (!hotel) {
    throw new AppError("Hotel not found", 404);
  }

  hotel.isApproved = false;
  hotel.isActive = false;
  // Persist rejection reason and timestamp
  hotel.lastRejectionReason = reason || null;
  hotel.lastRejectedAt = reason ? new Date() : null;
  await hotel.save();

  res.status(200).json({
    success: true,
    message: "Hotel rejected successfully",
    data: { _id: hotel._id, isApproved: hotel.isApproved, isActive: hotel.isActive },
  });

  try {
    logActivity({
      userId: (req as any).userId,
      method: "PATCH",
      path: `/api/admin/hotels/${hotelId}/reject`,
      params: { hotelId },
      query: { action: "reject" },
      message: reason ? `Rejected: ${reason}` : "Rejected without reason",
    });
  } catch (e) {
    console.warn("Failed to record activity for hotel reject", e);
  }
});

/**
 * Activate or deactivate a hotel
 */
export const setHotelActive = asyncHandler(async (req: Request, res: Response) => {
  const { hotelId } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== "boolean") {
    throw new AppError("isActive must be a boolean", 400);
  }

  const hotel = await Hotel.findById(hotelId);
  if (!hotel) {
    throw new AppError("Hotel not found", 404);
  }

  hotel.isActive = isActive;
  await hotel.save();

  res.status(200).json({
    success: true,
    message: `Hotel ${isActive ? "activated" : "deactivated"} successfully`,
    data: { _id: hotel._id, isActive: hotel.isActive },
  });

  try {
    logActivity({
      userId: (req as any).userId,
      method: "PATCH",
      path: `/api/admin/hotels/${hotelId}/active`,
      params: { hotelId },
      query: { isActive },
    });
  } catch (e) {
    console.warn("Failed to record activity for hotel activate/deactivate", e);
  }
});

/**
 * Get booking analytics
 */
export const getBookingAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const filter: any = {};

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate as string);
      }
    }

    // Get booking trends by date
    const bookingTrends = await Booking.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
          revenue: { $sum: "$totalCost" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get booking status distribution
    const statusDistribution = await Booking.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        bookingTrends,
        statusDistribution,
      },
    });
  }
);

/**
 * Get user analytics
 */
export const getUserAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    const registrationTrends = await User.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        usersByRole,
        registrationTrends,
      },
    });
  }
);

/**
 * Change a user's role (promote/demote)
 * Only allows promoting to `hotel_owner` or demoting to `user`. Admin role cannot be changed here.
 */
export const changeUserRole = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || (role !== "user" && role !== "hotel_owner")) {
      throw new AppError("Invalid role. Allowed values: user, hotel_owner", 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Prevent changing admin user's role via this endpoint
    if (user.role === "admin") {
      throw new AppError("Cannot change role of admin user", 403);
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: {
        _id: user._id,
        role: user.role,
      },
    });
    // Log activity with context
    try {
      logActivity({
        userId: (req as any).userId,
        method: "PATCH",
        path: `/api/admin/users/${userId}/role`,
        params: { targetUserId: userId },
        query: { newRole: role },
      });
    } catch (e) {
      console.warn("Failed to record activity for role change", e);
    }
  }
);

/**
 * Reset a user's password and return a temporary password.
 * NOTE: In production this should send an email instead of returning the password.
 */
export const resetUserPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Prevent resetting admin passwords via this endpoint for safety
    if (user.role === "admin") {
      throw new AppError("Cannot reset password for admin user via this endpoint", 403);
    }

    // Generate a temporary password (10 chars)
    const tempPassword = Math.random().toString(36).slice(-10);

    user.password = tempPassword; // will be hashed by pre-save hook
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: {
        tempPassword,
      },
    });
    // Log password reset activity
    try {
      logActivity({
        userId: (req as any).userId,
        method: "POST",
        path: `/api/admin/users/${userId}/reset-password`,
        params: { targetUserId: userId },
        query: { action: "reset-password" },
      });
    } catch (e) {
      console.warn("Failed to record activity for password reset", e);
    }
  }
);

/**
 * Get all hotels owned by a specific hotel owner
 * Used by admin dashboard to view hotel owner's properties
 */
/**
 * Get detailed information about a specific hotel including owner and booking details
 */
export const getHotelDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const { hotelId } = req.params;

    // Fetch hotel with owner details
    const hotel = await Hotel.findById(hotelId).populate('userId', 'firstName lastName email role createdAt');
    if (!hotel) {
      throw new AppError("Hotel not found", 404);
    }

    // Type assertion for populated userId
    const owner = hotel.userId as any;
    const ownerId = typeof owner === 'string' ? owner : owner._id;

    // Get owner's total hotels count
    const ownerHotelsCount = await Hotel.countDocuments({ userId: ownerId });

    // Get booking statistics
    const bookingsData = await Booking.aggregate([
      {
        $match: {
          hotelId: new (require('mongoose')).Types.ObjectId(hotelId),
        },
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$totalCost" },
          confirmedBookings: {
            $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
          },
        },
      },
    ]);

    const bookingStats = bookingsData[0] || {
      totalBookings: 0,
      totalRevenue: 0,
      confirmedBookings: 0,
    };

    // Get current active booking (if hotel is currently booked)
    const today = new Date();
    const currentBooking = await Booking.findOne({
      hotelId: hotelId,
      checkIn: { $lte: today },
      checkOut: { $gte: today },
      status: { $in: ["confirmed", "completed"] },
    }).populate('userId', 'firstName lastName email');

    // Get recent bookings with guest info
    const recentBookings = await Booking.find({ hotelId: hotelId })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('userId checkIn checkOut totalCost status');

    const hotelData = {
      _id: hotel._id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      pricePerNight: hotel.pricePerNight,
      starRating: hotel.starRating,
      description: hotel.description,
      isActive: hotel.isActive,
      isApproved: hotel.isApproved,
      amenities: hotel.amenities,
      owner: {
        _id: owner._id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        role: owner.role,
        joinedDate: owner.createdAt,
        totalHotels: ownerHotelsCount,
      },
      totalBookings: bookingStats.totalBookings,
      confirmedBookings: bookingStats.confirmedBookings,
      totalRevenue: bookingStats.totalRevenue,
      averageRating: hotel.averageRating,
      currentBooking: currentBooking ? {
        _id: currentBooking._id,
        guestName: `${(currentBooking.userId as any).firstName} ${(currentBooking.userId as any).lastName}`,
        guestEmail: (currentBooking.userId as any).email,
        checkIn: currentBooking.checkIn,
        checkOut: currentBooking.checkOut,
        status: currentBooking.status,
      } : null,
      recentBookings: recentBookings.map(booking => ({
        _id: booking._id,
        guestName: `${(booking.userId as any).firstName} ${(booking.userId as any).lastName}`,
        guestEmail: (booking.userId as any).email,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalCost: booking.totalCost,
        status: booking.status,
      })),
    };

    res.status(200).json({
      success: true,
      message: "Hotel details retrieved successfully",
      data: hotelData,
    });

    // Log activity
    try {
      logActivity({
        userId: (req as any).userId,
        method: "GET",
        path: `/api/admin/hotels/${hotelId}/details`,
        params: { hotelId },
        query: { action: "view-hotel-details" },
      });
    } catch (e) {
      console.warn("Failed to record activity for view hotel details", e);
    }
  }
);

export const getHotelOwnerHotels = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.params;

    // Verify the user exists and is a hotel owner
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.role !== "hotel_owner") {
      throw new AppError("User is not a hotel owner", 400);
    }

    // Get all hotels owned by this user (note: ownerId in db is stored as userId)
    const hotels = await Hotel.find({ userId: userId }).select(
      "name city country isActive isApproved"
    );

    // Get booking counts for each hotel
    const hotelIds = hotels.map(h => h._id);
    const hotelBookings = await Booking.aggregate([
      {
        $match: {
          hotelId: { $in: hotelIds },
        },
      },
      {
        $group: {
          _id: "$hotelId",
          totalBookings: { $sum: 1 },
        },
      },
    ]);

    const bookingMap = new Map();
    hotelBookings.forEach((booking: any) => {
      bookingMap.set(booking._id.toString(), booking.totalBookings);
    });

    const enrichedHotels = hotels.map(hotel => ({
      _id: hotel._id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      isActive: hotel.isActive,
      isApproved: hotel.isApproved,
      totalBookings: bookingMap.get(hotel._id.toString()) || 0,
    }));

    res.status(200).json({
      success: true,
      message: "Hotel owner hotels retrieved successfully",
      data: {
        hotels: enrichedHotels,
      },
    });

    // Log the activity
    try {
      logActivity({
        userId: (req as any).userId,
        method: "GET",
        path: `/api/admin/hotel-owner/${userId}/hotels`,
        params: { hotelOwnerId: userId },
        query: { action: "view-owner-hotels" },
      });
    } catch (e) {
      console.warn("Failed to record activity for view owner hotels", e);
    }
  }
);
