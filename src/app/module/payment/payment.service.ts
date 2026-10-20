import {
	BookingStatus,
	PaymentVia,
} from "../../../../prisma/generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import { validateUserById } from "../../utils/isUserExist";
import type { IUser } from "../user/user.interface";
import type { IPaymentQuery, IPaymentStatus } from "./payment.interface";

const createPayemntService = async (user: IUser, booking_id: string) => {
	const userData = await validateUserById(user.userId);

	const booking = await prisma.bookingService.findUnique({
		where: { id: booking_id },
	});

	if (!booking) {
		throw new AppError(404, "Not booking found.");
	}

	if (
		booking.booking_status !== BookingStatus.ACCEPTED &&
		booking.booking_status !== BookingStatus.FAILED
	) {
		throw new AppError(
			403,
			`This booking cannot be paid right now. Current booking status: ${booking.booking_status.toLowerCase()}`,
		);
	}

	if (userData.id !== booking.user_id) {
		throw new AppError(403, "Unauthorized access.");
	}

	// Initialize payment
	const existingPayment = await prisma.payment.findUnique({
		where: {
			merchant_invoice_number: booking.id,
		},
	});

	if (existingPayment) {
		if (existingPayment.payment_status === "PAID") {
			throw new AppError(
				400,
				"This service has already been paid successfully.",
			);
		}
		if (existingPayment.payment_status === "REFUNDED") {
			throw new AppError(
				400,
				"This payment has been refunded and cannot be modified.",
			);
		}
	}

	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(404, "Bkash id token not found.");
	}

	const bKashResponse = await fetch(
		`${config.BKASH_BASE_URL}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.BKASH_APP_KEY,
			},
			body: JSON.stringify({
				agreementID: "TokenizedMerchant01L3IKB6H1565072174986",
				mode: "0011",
				payerReference: user.email,
				callbackURL: `${config.BACKEND_URL}/api/v1/payment/callback`,
				merchantAssociationInfo: "MI05MID54RF09123456One",
				amount: booking.payment_amount,
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: booking.id,
			}),
		},
	);

	if (!bKashResponse.ok) {
		throw new AppError(
			502,
			"Failed to initialize communication with bKash gateway.",
		);
	}

	const paymentResult = await bKashResponse.json();

	const result = await prisma.$transaction(async (tx) => {
		if (existingPayment) {
			await tx.payment.update({
				where: { id: existingPayment.id },
				data: {
					bkash_payment_id: paymentResult.paymentID,
					payment_status: "PENDING",
					gatewayResponse: paymentResult,
				},
			});
		} else {
			await tx.payment.create({
				data: {
					payment_amount: paymentResult.amount,
					payment_gateway: PaymentVia.BKASH,
					merchant_invoice_number: booking.id,
					bkash_payment_id: paymentResult.paymentID,
					payer_reference: user.email,
					gatewayResponse: paymentResult,
					emergencyService_id: booking.emergencyService_id,
					user_id: userData.id,
				},
			});
		}

		return paymentResult.bkashURL;
	});

	return result;
};

const createPaymentCallbackService = async (query: Record<string, unknown>) => {
	const paymentId = query.paymentID;
	const status = query.status;

	if (!paymentId || typeof paymentId !== "string") {
		throw new AppError(400, "Invalid payment ID.");
	}

	if (!status || typeof status !== "string") {
		throw new AppError(400, "Invalid payment status.");
	}

	if (!["success", "failure", "cancel"].includes(status)) {
		throw new AppError(400, "Unexpected payment status value.");
	}

	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(404, "Bkash id token not found.");
	}

	const executePayment = await fetch(
		`${config.BKASH_BASE_URL}/tokenized/checkout/execute`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.BKASH_APP_KEY,
			},
			body: JSON.stringify({
				paymentID: paymentId,
			}),
		},
	);

	if (!executePayment.ok) {
		throw new AppError(
			502,
			"Failed to initialize communication with bKash gateway.",
		);
	}

	const executePaymentResult = await executePayment.json();

	const existingLocalPayment = await prisma.payment.findFirst({
		where: { bkash_payment_id: paymentId },
	});

	if (!existingLocalPayment) {
		throw new AppError(
			404,
			`No local payment record matched the bKash token ID: ${paymentId}`,
		);
	}

	const result = await prisma.$transaction(async (tx) => {
		// console.log(">>> Enter in the Transaction");

		if (status === "success") {
			// console.log(">>> 1: Success");

			await tx.payment.update({
				where: {
					id: existingLocalPayment.id,
				},
				data: {
					payment_status: "PAID",
					bkash_trx_id: executePaymentResult.trxID,
					gatewayResponse: executePaymentResult,
				},
			});

			await tx.bookingService.update({
				where: {
					id: existingLocalPayment.merchant_invoice_number as string,
				},
				data: {
					booking_status: "CONFIRMED",
					payment_status: "PAID",
				},
			});

			return {
				redirectUrl: `${config.FRONTEND_URL}/payment?status=success`,
			};
		} else if (status === "failure") {
			// console.log(">>> 2: Failure");

			await tx.payment.update({
				where: {
					id: existingLocalPayment.id,
				},
				data: {
					payment_status: "FAILED",
					gatewayResponse: executePaymentResult,
				},
			});

			await tx.bookingService.update({
				where: {
					id: existingLocalPayment.merchant_invoice_number as string,
				},
				data: {
					booking_status: "FAILED",
					payment_status: "FAILED",
				},
			});

			return {
				redirectUrl: `${config.FRONTEND_URL}/payment?status=failure`,
			};
		} else if (status === "cancel") {
			// console.log(">>> 3: Cancel");

			await tx.payment.update({
				where: {
					id: existingLocalPayment.id,
				},
				data: {
					payment_status: "CANCELLED",
					gatewayResponse: executePaymentResult,
				},
			});

			await tx.bookingService.update({
				where: {
					id: existingLocalPayment.merchant_invoice_number as string,
				},
				data: {
					booking_status: "FAILED",
					payment_status: "CANCELLED",
				},
			});

			return {
				redirectUrl: `${config.FRONTEND_URL}/payment?status=cancel`,
			};
		} else {
			// console.log(">>> 4: In the end");
			return {
				executePaymentResult,
				redirectUrl: `${config.FRONTEND_URL}/dashboard/my-bookings`,
			};
		}
	});

	// console.log(">>> End of the code");

	return result;
};

const getMyPayments = async (user: IUser, query: IPaymentQuery) => {
	const {
		search,
		payment_status,
		payment_gateway,
		sortBy = "desc",
		rawLimit = 10,
		rawPage = 1,
	} = query;

	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);
	const page = Math.max(1, Number(rawPage));

	const where: Record<string, unknown> = {
		user_id: user.userId,
	};

	if (search) {
		where.OR = [
			{ merchant_invoice_number: { contains: search, mode: "insensitive" } },
			{ payer_reference: { contains: search, mode: "insensitive" } },
			{ bkash_trx_id: { contains: search, mode: "insensitive" } },
		];
	}

	if (payment_status) {
		where.payment_status = payment_status;
	}

	if (payment_gateway) {
		where.payment_gateway = payment_gateway;
	}

	const skip = (page - 1) * limit;

	const orderBy = { created_at: sortBy };

	const [payment, total] = await Promise.all([
		prisma.payment.findMany({
			where,
			skip,
			take: limit,
			orderBy,
		}),
		prisma.payment.count({ where }),
	]);

	return {
		payment,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// Admin Controlled
const getAllPayments = async (query: IPaymentQuery) => {
	const {
		search,
		payment_status,
		payment_gateway,
		sortBy = "desc",
		sortByAmount,
		rawLimit = 10,
		rawPage = 1,
	} = query;

	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);
	const page = Math.max(1, Number(rawPage));

	const where: Record<string, unknown> = {};

	if (search) {
		where.OR = [
			{ merchant_invoice_number: { contains: search, mode: "insensitive" } },
			{ payer_reference: { contains: search, mode: "insensitive" } },
			{ bkash_trx_id: { contains: search, mode: "insensitive" } },
		];
	}

	if (payment_status) {
		where.payment_status = payment_status;
	}

	if (payment_gateway) {
		where.payment_gateway = payment_gateway;
	}

	const skip = (page - 1) * limit;

	const orderBy = sortByAmount ? { payment_amount: sortByAmount } : { created_at: sortBy };

	const [payment, total] = await Promise.all([
		prisma.payment.findMany({
			where,
			skip,
			take: limit,
			orderBy,
		}),
		prisma.payment.count({ where }),
	]);

	if (payment.length === 0) {
		return {
			payment: [],
			meta: { total: 0, page, limit, totalPages: 0 },
		};
	}

	return {
		payment,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getPaymentDetails = async (id: string, user: IUser) => {
	const payment = await prisma.payment.findUnique({
		where: { id },
		include: {
			emergencyService: true,
			user: {
				omit: {
					password: true,
				},
			},
		},
	});

	if (!payment) {
		throw new AppError(404, "No payment found.");
	}

	if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
		if (payment.user_id !== user.userId) {
			throw new AppError(403, "Unauthorize access.");
		}
	}

	return payment;
};

// Hospital Controlled
const getAllPaymentsHospital = async (query: IPaymentQuery, user: IUser) => {
	const {
		search,
		payment_status,
		payment_gateway,
		sortBy = "desc",
		rawLimit = 10,
		rawPage = 1,
	} = query;

	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);
	const page = Math.max(1, Number(rawPage));

	const where: Record<string, unknown> = {
		emergencyService: {
			hospital: {
				user_id: user.userId,
			},
		},
	};

	if (search) {
		where.OR = [
			{ merchant_invoice_number: { contains: search, mode: "insensitive" } },
			{ payer_reference: { contains: search, mode: "insensitive" } },
			{ bkash_trx_id: { contains: search, mode: "insensitive" } },
		];
	}

	if (payment_status) {
		where.payment_status = payment_status;
	}

	if (payment_gateway) {
		where.payment_gateway = payment_gateway;
	}

	const skip = (page - 1) * limit;

	const orderBy = { created_at: sortBy };

	const [payment, total] = await Promise.all([
		prisma.payment.findMany({
			where,
			skip,
			take: limit,
			orderBy,
		}),
		prisma.payment.count({ where }),
	]);

	if (payment.length === 0) {
		return {
			payment: [],
			meta: { total: 0, page, limit, totalPages: 0 },
		};
	}

	return {
		payment,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updatePaymentStatus = async (id: string, payload: IPaymentStatus) => {
	const payment = await prisma.payment.findUnique({
		where: { id },
	});

	if (!payment) {
		throw new AppError(404, "No payment record found.");
	}

	const booking = await prisma.bookingService.findUnique({
		where: {
			id: payment.merchant_invoice_number as string,
		},
	});

	if (!booking) {
		throw new AppError(404, "Associated booking record not found.");
	}

	if (booking.booking_status !== "CANCELLED") {
		throw new AppError(
			400,
			"You cannot update the payment status of a booking that is not cancelled yet.",
		);
	}

	if (
		payment.payment_status === "REFUNDED" &&
		payload.payment_status === "REFUNDED"
	) {
		throw new AppError(
			400,
			"Payment has already been successfully refunded for this booking.",
		);
	}

	const result = await prisma.$transaction(async (tx) => {
		const paymentUpdateData: IPaymentStatus = {
			payment_status: payload.payment_status,
		};

		const bookingUpdateData: IPaymentStatus = {
			payment_status: payload.payment_status,
		};

		if (payload.payment_status === "REFUNDED") {
			paymentUpdateData.refund_amount = Number(payment.payment_amount);
			paymentUpdateData.refunded_at = new Date();
		}

		const updatedPayment = await tx.payment.update({
			where: { id },
			data: paymentUpdateData,
		});

		await tx.bookingService.update({
			where: { id: booking.id },
			data: bookingUpdateData,
		});

		return updatedPayment;
	});

	return result;
};

export const PaymentService = {
	createPayemntService,
	createPaymentCallbackService,
	getMyPayments,
	getAllPayments,
	getPaymentDetails,
	getAllPaymentsHospital,
	updatePaymentStatus,
};
