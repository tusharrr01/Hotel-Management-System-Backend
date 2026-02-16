import express, { Request, Response } from "express";
import Hotel from "../models/hotel";
import Booking from "../models/booking";
import User from "../models/user";
import { BookingType, HotelSearchResponse } from "../../../shared/types";
import { param, validationResult } from "express-validator";
import crypto from "crypto";
import verifyToken from "../middleware/auth";

const router = express.Router();

router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = constructSearchQuery(req.query);

    let sortOptions = {};
    switch (req.query.sortOption) {
      case "starRating":
        sortOptions = { starRating: -1 };
        break;
      case "pricePerNightAsc":
        sortOptions = { pricePerNight: 1 };
        break;
      case "pricePerNightDesc":
        sortOptions = { pricePerNight: -1 };
        break;
    }

    const pageSize = 5;
    const pageNumber = parseInt(
      req.query.page ? req.query.page.toString() : "1"
    );
    const skip = (pageNumber - 1) * pageSize;

    const hotels = await Hotel.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(pageSize);

    const total = await Hotel.countDocuments(query);

    const response: HotelSearchResponse = {
      data: hotels,
      pagination: {
        total,
        page: pageNumber,
        pages: Math.ceil(total / pageSize),
      },
    };

    res.json(response);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const hotels = await Hotel.find().sort("-lastUpdated");
    res.json(hotels);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error fetching hotels" });
  }
});

router.get(
  "/:id",
  [param("id").notEmpty().withMessage("Hotel ID is required")],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = req.params.id.toString();

    try {
      const hotel = await Hotel.findById(id);
      res.json(hotel);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching hotel" });
    }
  }
);

router.post(
  "/:hotelId/bookings/payment-intent",
  verifyToken,
  async (req: Request, res: Response) => {
    const { numberOfNights } = req.body;
    const hotelId = req.params.hotelId;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(400).json({ message: "Hotel not found" });
    }

    const totalCost = hotel.pricePerNight * numberOfNights;

    // Create Razorpay order using server-side credentials
    const keyId = process.env.RAZORPAY_KEY_ID as string;
    const keySecret = process.env.RAZORPAY_KEY_SECRET as string;

    if (!keyId || !keySecret) {
      return res.status(500).json({ message: "Razorpay credentials not configured" });
    }

    // Razorpay expects amount in smallest currency unit (paise for INR)
    const amountInPaise = Math.round(totalCost * 100);
    const currency = process.env.PAYMENT_CURRENCY || "INR";

    // Call Razorpay Orders API
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const orderPayload = {
      amount: amountInPaise,
      currency,
      receipt: `rcpt_${hotelId}_${Date.now()}`,
      payment_capture: 1,
    };

    const resp = await (globalThis as any).fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Razorpay order creation failed:", errText);
      return res.status(500).json({ message: "Error creating payment order" });
    }

    const orderData = await resp.json();

    const response = {
      orderId: orderData.id,
      amount: amountInPaise,
      currency,
      keyId,
      totalCost,
    };

    res.send(response);
  }
);

router.post(
  "/:hotelId/bookings",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      // Razorpay: client should send razorpay_payment_id, razorpay_order_id, razorpay_signature
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body as any;

      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({ message: "Missing Razorpay payment details" });
      }

      const keySecret = process.env.RAZORPAY_KEY_SECRET as string;
      if (!keySecret) {
        return res.status(500).json({ message: "Razorpay secret not configured" });
      }

      // Verify signature: HMAC_SHA256(order_id + '|' + payment_id)
      const generated_signature = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ message: "Invalid payment signature" });
      }

      const newBooking: BookingType = {
        ...req.body,
        userId: req.userId,
        hotelId: req.params.hotelId,
        createdAt: new Date(),
        status: "confirmed",
        paymentStatus: "paid",
        paymentMethod: "razorpay",
      } as any;

      // Create booking in separate collection
      const booking = new Booking(newBooking);
      await booking.save();

      // Update hotel analytics
      await Hotel.findByIdAndUpdate(req.params.hotelId, {
        $inc: {
          totalBookings: 1,
          totalRevenue: newBooking.totalCost,
        },
      });

      // Update user analytics
      await User.findByIdAndUpdate(req.userId, {
        $inc: {
          totalBookings: 1,
          totalSpent: newBooking.totalCost,
        },
      });

      res.status(200).send();
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "something went wrong" });
    }
  }
);

const constructSearchQuery = (queryParams: any) => {
  let constructedQuery: any = {};

  if (queryParams.destination && queryParams.destination.trim() !== "") {
    const destination = queryParams.destination.trim();

    constructedQuery.$or = [
      { city: { $regex: destination, $options: "i" } },
      { country: { $regex: destination, $options: "i" } },
    ];
  }

  if (queryParams.adultCount) {
    constructedQuery.adultCount = {
      $gte: parseInt(queryParams.adultCount),
    };
  }

  if (queryParams.childCount) {
    constructedQuery.childCount = {
      $gte: parseInt(queryParams.childCount),
    };
  }

  if (queryParams.facilities) {
    constructedQuery.facilities = {
      $all: Array.isArray(queryParams.facilities)
        ? queryParams.facilities
        : [queryParams.facilities],
    };
  }

  if (queryParams.types) {
    constructedQuery.type = {
      $in: Array.isArray(queryParams.types)
        ? queryParams.types
        : [queryParams.types],
    };
  }

  if (queryParams.stars) {
    const starRatings = Array.isArray(queryParams.stars)
      ? queryParams.stars.map((star: string) => parseInt(star))
      : parseInt(queryParams.stars);

    constructedQuery.starRating = { $in: starRatings };
  }

  if (queryParams.maxPrice) {
    constructedQuery.pricePerNight = {
      $lte: parseInt(queryParams.maxPrice).toString(),
    };
  }

  return constructedQuery;
};

export default router;
