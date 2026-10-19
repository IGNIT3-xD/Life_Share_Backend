import {
	BookingStatus,
	PaymentStatus,
} from "../../../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import { validateUserById } from "../../utils/isUserExist";
import type { IUser } from "../auth/auth.interface";
import type {
	IBooking,
	IBookingQuery,
	IUpdateBooking,
	IUpdateBookingStatus,
	IUpdatePaymentStatus,
} from "./booking.interface";

const createBookingService = async (
	user: IUser,
	service_id: string,
	payload: IBooking,
) => {
	const userData = await validateUserById(user.userId);

	const service = await prisma.emergencyService.findUnique({
		where: { id: service_id },
	});

	if (!service) {
		throw new AppError(404, "Service not found.");
	}

	if (service.service_status !== "ACTIVE") {
		throw new AppError(400, "Service is not verified by the admin.");
	}

	const isBookingAlreadyExist = await prisma.bookingService.findFirst({
		where: {
			emergencyService_id: service_id,
			user_id: userData.id,
			booking_status: {
				notIn: [BookingStatus.CANCELLED, BookingStatus.FAILED],
			},
		},
	});

	if (isBookingAlreadyExist) {
		if (isBookingAlreadyExist.booking_status === BookingStatus.CONFIRMED) {
			throw new AppError(400, "Booking is already confirmed. Please, wait!");
		}

		if (
			isBookingAlreadyExist.booking_status === BookingStatus.ACCEPTED ||
			isBookingAlreadyExist.booking_status === BookingStatus.PENDING
		) {
			throw new AppError(
				400,
				`You have an active booking for this service. Current status: ${isBookingAlreadyExist.booking_status.toLowerCase()}`,
			);
		}
	}

	const createBooking = await prisma.bookingService.create({
		data: {
			patient_name: payload.patient_name,
			patient_number: payload.patient_number,
			payment_amount: service.price,
			payment_via: payload.payment_via,
			description: payload.description,
			emergency_location: payload.emergency_location,
			scheduled_at: payload.scheduled_at,
			note: payload.note,
			user_id: userData.id,
			emergencyService_id: service.id,
			hospital_id: service.hospital_id,
		},
	});

	return createBooking;
};

const updateBookingService = async (
	user: IUser,
	booking_id: string,
	payload: IUpdateBooking,
) => {
	const booking = await prisma.bookingService.findUnique({
		where: {
			id: booking_id,
		},
	});

	if (!booking) {
		throw new AppError(404, "Booking not found.");
	}

	if (booking.user_id !== user.userId) {
		throw new AppError(403, "Unauthorized access");
	}

	if (
		booking.booking_status !== BookingStatus.PENDING &&
		booking.booking_status !== BookingStatus.ACCEPTED
	) {
		throw new AppError(
			400,
			`Your booking is currently ${booking.booking_status.toLowerCase()}. So, you can't edit this.`,
		);
	}

	const updateBooking = await prisma.bookingService.update({
		where: {
			id: booking.id,
		},
		data: {
			patient_name: payload.patient_name,
			patient_number: payload.patient_number,
			description: payload.description,
			emergency_location: payload.emergency_location,
			scheduled_at: payload.scheduled_at,
			note: payload.note,
		},
	});

	return updateBooking;
};

const getMyBookingsService = async (user: IUser, query: IBookingQuery) => {
	const {
		booking_status,
		payment_status,
		payment_via,
		sortBy = "desc",
		search,
		limit: rawLimit = 10,
		page: rawPage = 1,
	} = query;

	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);
	const page = Math.max(1, Number(rawPage));

	const where: Record<string, unknown> = {
		user_id: user.userId,
	};

	if (booking_status) {
		where.booking_status = booking_status;
	}

	if (payment_status) {
		where.payment_status = payment_status;
	}

	if (payment_via) {
		where.payment_via = payment_via;
	}

	if (search) {
		where.OR = [
			{ patient_name: { contains: search, mode: "insensitive" } },
			{ patient_number: { contains: search, mode: "insensitive" } },
			{ emergency_location: { contains: search, mode: "insensitive" } },
		];
	}

	const orderBy = { created_at: sortBy };

	const skip = (page - 1) * limit;

	const [bookings, total] = await Promise.all([
		prisma.bookingService.findMany({
			where,
			skip,
			take: limit,
			orderBy,
		}),
		prisma.bookingService.count({ where }),
	]);

	if (bookings.length === 0) {
		return {
			bookings: [],
			meta: { total: 0, page, limit, totalPages: 0 },
		};
	}

	return {
		bookings,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getMyBookingDetailsService = async (user: IUser, booking_id: string) => {
	const booking = await prisma.bookingService.findUnique({
		where: {
			id: booking_id,
		},
		include: {
			emergencyService: true,
			hospital: true,
			user: {
				select: {
					name: true,
					email: true,
					phone: true,
					address: true,
					profile_pic: true,
				},
			},
		},
	});

	if (!booking) {
		throw new AppError(404, "Booking not found.");
	}

	if (booking.user_id !== user.userId) {
		throw new AppError(403, "Unauthorized access");
	}

	return booking;
};

const cancelBookingService = async (user: IUser, booking_id: string) => {
	const booking = await prisma.bookingService.findUnique({
		where: {
			id: booking_id,
		},
	});

	if (!booking) {
		throw new AppError(404, "Booking not found.");
	}

	if (booking.user_id !== user.userId) {
		throw new AppError(403, "Unauthorized access");
	}

	if (booking.booking_status === BookingStatus.COMPLETED) {
		throw new AppError(400, `You can't cancel a completed booking.`);
	}

	if (booking.booking_status === BookingStatus.CANCELLED) {
		throw new AppError(400, `Booking is already cancelled.`);
	}

	const requiresRefund = booking.payment_status === "PAID";

	const result = await prisma.$transaction(async (tx) => {
		const bookingUpdateData: any = {
			booking_status: BookingStatus.CANCELLED,
		};

		if (requiresRefund) {
			bookingUpdateData.payment_status = PaymentStatus.REFUNDED_PENDING;
		}

		const cancelBooking = await tx.bookingService.update({
			where: {
				id: booking.id,
			},
			data: bookingUpdateData,
		});

		if (requiresRefund) {
			await tx.payment.update({
				where: {
					merchant_invoice_number: booking.id,
				},
				data: {
					payment_status: PaymentStatus.REFUNDED_PENDING,
				},
			});
		}

		return cancelBooking;
	});

	return result;
};

const deleteBookingService = async (user: IUser, booking_id: string) => {
	const booking = await prisma.bookingService.findUnique({
		where: {
			id: booking_id,
		},
	});

	if (!booking) {
		throw new AppError(404, "Booking not found.");
	}

	if (booking.user_id !== user.userId) {
		throw new AppError(403, "Unauthorized access");
	}

	if (booking.booking_status === BookingStatus.COMPLETED) {
		throw new AppError(400, `You can't delete a completed booking.`);
	}

	if (booking.booking_status === BookingStatus.CANCELLED) {
		throw new AppError(400, `Booking is already cancelled.`);
	}

	await prisma.bookingService.delete({
		where: {
			id: booking.id,
		},
	});
};

// Hospital Controlled
const updateBookingStatusService = async (
	user: IUser,
	booking_id: string,
	payload: IUpdateBookingStatus,
) => {
	const booking = await prisma.bookingService.findUnique({
		where: { id: booking_id },
	});

	if (!booking) {
		throw new AppError(404, "Booking not found.");
	}

	const hospitalProfile = await prisma.hospital.findUnique({
		where: { user_id: user.userId },
	});

	if (!hospitalProfile) {
		throw new AppError(404, "Hospital profile not exist.");
	}

	if (booking.hospital_id !== hospitalProfile.id) {
		throw new AppError(403, "Unauthorized access");
	}

	const service = await prisma.emergencyService.findFirst({
		where: { hospital_id: hospitalProfile.id },
	});

	if (!service) {
		throw new AppError(404, "Emergency service not found.");
	}

	if (service.hospital_id !== hospitalProfile.id) {
		throw new AppError(403, "Unauthorized access");
	}

	if (booking.booking_status === "COMPLETED") {
		throw new AppError(400, "Booking is already completed.");
	}

	const updateBookingStatus = await prisma.bookingService.update({
		where: {
			id: booking.id,
		},
		data: {
			booking_status: payload.booking_status,
		},
	});

	return updateBookingStatus;
};

const updatePaymentStatusService = async (
	user: IUser,
	booking_id: string,
	payload: IUpdatePaymentStatus,
) => {
	const booking = await prisma.bookingService.findUnique({
		where: { id: booking_id },
	});

	if (!booking) {
		throw new AppError(404, "Booking not found.");
	}

	const hospitalProfile = await prisma.hospital.findUnique({
		where: { user_id: user.userId },
	});

	if (!hospitalProfile) {
		throw new AppError(404, "Hospital profile not exist.");
	}

	if (booking.hospital_id !== hospitalProfile.id) {
		throw new AppError(403, "Unauthorized access");
	}

	const service = await prisma.emergencyService.findFirst({
		where: { hospital_id: hospitalProfile.id },
	});

	if (!service) {
		throw new AppError(404, "Emergency service not found.");
	}

	if (service.hospital_id !== hospitalProfile.id) {
		throw new AppError(403, "Unauthorized access");
	}

	if (booking.booking_status === "COMPLETED") {
		throw new AppError(400, "Booking is already completed.");
	}

	if (booking.booking_status !== "CANCELLED") {
		throw new AppError(
			400,
			"You can't update payment status of booking which is not cancelled.",
		);
	}

	const result = await prisma.$transaction(async (tx) => {
		await tx.bookingService.update({
			where: {
				id: booking.id,
			},
			data: {
				payment_status: payload.payment_status,
			},
		});

		const payment = await tx.payment.update({
			where: {
				merchant_invoice_number: booking.id,
			},
			data: {
				payment_status: payload.payment_status,
			},
		});

		return payment;
	});

	return result;
};

const getBookingRequestsService = async (
	user: IUser,
	query: IBookingQuery,
) => {
	const { search, booking_status, payment_status, payment_via, sortBy = 'desc', page = 1, limit = 10 } = query

	const hospitalProfile = await prisma.hospital.findUnique({
		where: { user_id: user.userId },
	});

	if (!hospitalProfile) {
		throw new AppError(404, "Hospital profile not found.");
	}

	const where: Record<string, unknown> = { hospital_id: hospitalProfile.id };

	if (booking_status) {
		where.booking_status = booking_status;
	}

	if (payment_status) {
		where.payment_status = payment_status;
	}

	if (payment_via) {
		where.payment_via = payment_via
	}

	if (search?.trim()) {
		const term = search.trim();

		where.OR = [
			{
				emergency_location: {
					contains: term,
					mode: "insensitive",
				},
			},
			{
				patient_name: {
					contains: term,
					mode: "insensitive",
				},
			},
			{
				patient_number: {
					contains: term,
					mode: "insensitive",
				},
			},
		];
	}

	const rawPage = Math.max(1, Number(page));
	const rawLimit = Math.min(Math.max(1, Number(limit)), 100);

	const skip = (rawPage - 1) * rawLimit;

	const [bookings, total] = await Promise.all([
		prisma.bookingService.findMany({
			where,
			skip,
			take: rawLimit,
			orderBy: { created_at: sortBy },
		}),
		prisma.bookingService.count({ where }),
	]);

	return {
		bookings,
		meta: {
			total,
			page: rawPage,
			limit: rawLimit,
			totalPages: Math.ceil(total / rawLimit),
		},
	};
};

const getBookingRequestsDetailsService = async (
	user: IUser,
	booking_id: string,
) => {
	const hospitalProfile = await prisma.hospital.findUnique({
		where: { user_id: user.userId },
	});

	if (!hospitalProfile) {
		throw new AppError(404, "Hosptal profile not exist.");
	}

	const bookings = await prisma.bookingService.findUnique({
		where: { id: booking_id },
		include: {
			emergencyService: true,
			user: {
				omit: {
					password: true,
				},
			},
		},
	});

	if (!bookings) {
		throw new AppError(404, "Booking not found.");
	}

	if (hospitalProfile.id !== bookings.hospital_id) {
		throw new AppError(403, "Unauthorized access");
	}

	return bookings;
};

export const BookingService = {
	createBookingService,
	updateBookingService,
	getMyBookingsService,
	getMyBookingDetailsService,
	cancelBookingService,
	deleteBookingService,
	updateBookingStatusService,
	getBookingRequestsService,
	getBookingRequestsDetailsService,
	updatePaymentStatusService
};
