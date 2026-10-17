import { catchAsync } from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import type { Request, Response } from "express";
import { BookingService } from "./booking.service";
import type { IUser } from "../user/user.interface";

const createBookingController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const service_id = req.params.id as string;

		const result = await BookingService.createBookingService(
			user,
			service_id,
			req.body,
		);

		sendResponse(res, {
			statusCode: 201,
			success: true,
			message: "Booking created successfully",
			data: result,
		});
	},
);

const updateBookingController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const booking_id = req.params.id as string;

		const result = await BookingService.updateBookingService(
			user,
			booking_id,
			req.body,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Booking updated successfully",
			data: result,
		});
	},
);

const getMyBookingController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;

		const result = await BookingService.getMyBookingsService(user, req.query);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "My bookings retrieved successfully",
			data: result,
		});
	},
);

const getMyBookingDetailsController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const booking_id = req.params.id as string;

		const result = await BookingService.getMyBookingDetailsService(
			user,
			booking_id,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Booking details retrieved successfully",
			data: result,
		});
	},
);

const cancelBookingController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const booking_id = req.params.id as string;

		const result = await BookingService.cancelBookingService(user, booking_id);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Booking has been cancelled successfully",
			data: result,
		});
	},
);

const deleteBookingController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const booking_id = req.params.id as string;

		await BookingService.deleteBookingService(user, booking_id);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Booking has been deleted successfully",
		});
	},
);

const updateBookingStatusController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const booking_id = req.params.id as string;

		const result = await BookingService.updateBookingStatusService(
			user,
			booking_id,
			req.body,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Booking status updated successfully",
			data: result,
		});
	},
);

const getBookingRequestsController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;

		const result = await BookingService.getBookingRequestsService(
			user,
			req.query,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Bookings retrieved successfully",
			data: result,
		});
	},
);

const getBookingRequestsDetailsController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const booking_id = req.params.id as string;

		const result = await BookingService.getBookingRequestsDetailsService(
			user,
			booking_id,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Booking details retrieved successfully",
			data: result,
		});
	},
);

export const BookingController = {
	createBookingController,
	updateBookingController,
	getMyBookingController,
	getMyBookingDetailsController,
	cancelBookingController,
	deleteBookingController,
	updateBookingStatusController,
	getBookingRequestsController,
	getBookingRequestsDetailsController
};
