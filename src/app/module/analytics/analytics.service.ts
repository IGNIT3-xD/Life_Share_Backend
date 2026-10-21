import {
	BookingStatus,
	DonationStatus,
	PaymentStatus,
	RequestStatus,
	ServiceStatus,
} from "../../../../prisma/generated/prisma/enums";
import type { IUser } from "../auth/auth.interface";
import { prisma } from "../../lib/prisma";

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

interface IMonthlyRevenueRow {
	year: number;
	month: number;
	revenue: number | null;
	transactions: number;
}

const getAnalytics = async () => {
	const [
		totalUsers,
		totalBlockedUsers,
		totalRevenue,
		totalRefunded,
		totalDonors,
		verifiedDonors,
		inProgressDonors,
		notEligibleDonors,
		totalRequesters,
		pendingRequesters,
		verifiedRequesters,
		rejectedRequesters,
		totalHospitals,
		inProgressHospitals,
		verifiedHospitals,
		activeEmergencyServices,
		inProgressEmergencyServices,
		inactiveEmergencyServices,
	] = await prisma.$transaction([
		prisma.user.count(),
		prisma.user.count({ where: { is_blocked: true } }),
		prisma.payment.aggregate({
			where: { payment_status: "PAID" },
			_sum: { payment_amount: true },
		}),
		prisma.payment.aggregate({
			where: { payment_status: "REFUNDED" },
			_sum: { refund_amount: true },
		}),
		prisma.donor.count(),
		prisma.donor.count({ where: { donorStatus: "VERIFIED" } }),
		prisma.donor.count({ where: { donorStatus: "IN_PROGRESS" } }),
		prisma.donor.count({ where: { donorStatus: "NOT_ELIGIBLE" } }),
		prisma.requester.count(),
		prisma.requester.count({ where: { verificationStatus: "PENDING" } }),
		prisma.requester.count({ where: { verificationStatus: "VERIFIED" } }),
		prisma.requester.count({ where: { verificationStatus: "REJECTED" } }),
		prisma.hospital.count(),
		prisma.hospital.count({ where: { hospital_status: "IN_PROGRESS" } }),
		prisma.hospital.count({ where: { hospital_status: "VERIFIED" } }),
		prisma.emergencyService.count({ where: { service_status: "ACTIVE" } }),
		prisma.emergencyService.count({ where: { service_status: "IN_PROGRESS" } }),
		prisma.emergencyService.count({ where: { service_status: "INACTIVE" } }),
	]);

	return {
		totalUsers,
		totalBlockedUsers,
		totalRevenue: totalRevenue._sum.payment_amount ?? 0,
		totalRefunded: totalRefunded._sum.refund_amount ?? 0,
		donors: {
			total: totalDonors,
			verified: verifiedDonors,
			inProgress: inProgressDonors,
			notEligible: notEligibleDonors,
		},
		requesters: {
			total: totalRequesters,
			pending: pendingRequesters,
			verified: verifiedRequesters,
			rejected: rejectedRequesters,
		},
		hospitals: {
			total: totalHospitals,
			inProgress: inProgressHospitals,
			verified: verifiedHospitals,
		},
		emergencyServices: {
			active: activeEmergencyServices,
			inProgress: inProgressEmergencyServices,
			inactive: inactiveEmergencyServices,
		},
	};
};

const revenueMetricsService = async () => {
	const now = new Date();
	const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

	const [allTime, monthlyRows] = await Promise.all([
		prisma.payment.aggregate({
			where: { payment_status: PaymentStatus.PAID },
			_sum: { payment_amount: true },
			_count: { id: true },
		}),
		prisma.$queryRaw<IMonthlyRevenueRow[]>`
			SELECT
				EXTRACT(YEAR FROM created_at)::int AS year,
				EXTRACT(MONTH FROM created_at)::int AS month,
				SUM(payment_amount) AS revenue,
				COUNT(*)::int AS transactions
			FROM "payment"
			WHERE payment_status = ${PaymentStatus.PAID}
				AND created_at >= ${twelveMonthsAgo}
			GROUP BY year, month
			ORDER BY year, month
		`,
	]);

	// Pre-fill the last 12 months (oldest → newest) so months without
	// any PAID payment still show up with a zero revenue.
	const monthly: {
		month: string;
		year: number;
		revenue: number;
		transactions: number;
	}[] = [];

	for (let i = 11; i >= 0; i--) {
		const bucketDate = new Date(now.getFullYear(), now.getMonth() - i, 1);

		monthly.push({
			month: MONTH_NAMES[bucketDate.getMonth()],
			year: bucketDate.getFullYear(),
			revenue: 0,
			transactions: 0,
		});
	}

	for (const row of monthlyRows) {
		const bucketIndex =
			(row.year - now.getFullYear()) * 12 +
			(row.month - 1 - now.getMonth()) +
			11;

		if (bucketIndex < 0 || bucketIndex > 11) {
			continue;
		}

		monthly[bucketIndex].revenue = Number(row.revenue ?? 0);
		monthly[bucketIndex].transactions = Number(row.transactions ?? 0);
	}

	const thisMonth = monthly[11];
	const lastMonth = monthly[10];

	return {
		totalRevenue: Number(allTime._sum.payment_amount ?? 0),
		totalTransactions: allTime._count.id ?? 0,
		thisMonth,
		lastMonth,
		monthly,
	};
};

const userAnalyticsService = async (user: IUser) => {
	const [
		paymentStats,
		totalBloodRequests,
		pendingBloodRequests,
		inProgressBloodRequests,
		completedBloodRequests,
		cancelledBloodRequests,
		receivedDonationRequests,
		completedDonations,
		totalBookings,
		pendingBookings,
		acceptedBookings,
		confirmedBookings,
		cancelledBookings,
	] = await prisma.$transaction([
		prisma.payment.aggregate({
			where: {
				user_id: user.userId,
				payment_status: PaymentStatus.PAID,
			},
			_sum: { payment_amount: true },
			_count: { id: true },
		}),
		prisma.requester.count({ where: { user_id: user.userId } }),
		prisma.requester.count({
			where: { user_id: user.userId, request_status: RequestStatus.PENDING },
		}),
		prisma.requester.count({
			where: {
				user_id: user.userId,
				request_status: RequestStatus.IN_PROGRESS,
			},
		}),
		prisma.requester.count({
			where: {
				user_id: user.userId,
				request_status: RequestStatus.COMPLETED,
			},
		}),
		prisma.requester.count({
			where: {
				user_id: user.userId,
				request_status: RequestStatus.CANCELLED,
			},
		}),
		// Blood donation requests received on the user's blood requests
		prisma.donation.count({
			where: { requester: { user_id: user.userId } },
		}),
		prisma.donation.count({
			where: {
				requester: { user_id: user.userId },
				donationStatus: DonationStatus.COMPLETED,
			},
		}),
		// Emergency service bookings made by the user
		prisma.bookingService.count({ where: { user_id: user.userId } }),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.PENDING },
		}),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.ACCEPTED },
		}),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.CONFIRMED },
		}),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.CANCELLED },
		}),
	]);

	return {
		payments: {
			totalPaid: Number(paymentStats._sum.payment_amount ?? 0),
			totalTransactions: paymentStats._count.id ?? 0,
		},
		bloodRequests: {
			total: totalBloodRequests,
			pending: pendingBloodRequests,
			inProgress: inProgressBloodRequests,
			completed: completedBloodRequests,
			cancelled: cancelledBloodRequests,
		},
		donations: {
			received: receivedDonationRequests,
			completed: completedDonations,
		},
		bookings: {
			total: totalBookings,
			pending: pendingBookings,
			accepted: acceptedBookings,
			confirmed: confirmedBookings,
			cancelled: cancelledBookings,
		},
	};
};

const donorAnalyticsService = async (user: IUser) => {
	const [
		totalDonationReceived,
		pendingDonations,
		acceptedDonations,
		scheduledDonations,
		completedDonations,
		donorCancelledDonations,
		rejectedDonations,
		totalBloodRequests,
		pendingBloodRequests,
		inProgressBloodRequests,
		completedBloodRequests,
		cancelledBloodRequests,
		totalBookings,
		pendingBookings,
		acceptedBookings,
		confirmedBookings,
		cancelledBookings,
	] = await prisma.$transaction([
		// Donation requests received for this donor profile
		prisma.donation.count({ where: { donor: { userId: user.userId } } }),
		prisma.donation.count({
			where: {
				donor: { userId: user.userId },
				donationStatus: DonationStatus.PENDING,
			},
		}),
		prisma.donation.count({
			where: {
				donor: { userId: user.userId },
				donationStatus: DonationStatus.ACCEPTED,
			},
		}),
		prisma.donation.count({
			where: {
				donor: { userId: user.userId },
				donationStatus: DonationStatus.SCHEDULED,
			},
		}),
		prisma.donation.count({
			where: {
				donor: { userId: user.userId },
				donationStatus: DonationStatus.COMPLETED,
			},
		}),
		prisma.donation.count({
			where: {
				donor: { userId: user.userId },
				donationStatus: DonationStatus.DONOR_CANCELLED,
			},
		}),
		prisma.donation.count({
			where: {
				donor: { userId: user.userId },
				donationStatus: DonationStatus.REJECTED,
			},
		}),
		// Blood requests the donor themselves posted
		prisma.requester.count({ where: { user_id: user.userId } }),
		prisma.requester.count({
			where: { user_id: user.userId, request_status: RequestStatus.PENDING },
		}),
		prisma.requester.count({
			where: {
				user_id: user.userId,
				request_status: RequestStatus.IN_PROGRESS,
			},
		}),
		prisma.requester.count({
			where: { user_id: user.userId, request_status: RequestStatus.COMPLETED },
		}),
		prisma.requester.count({
			where: { user_id: user.userId, request_status: RequestStatus.CANCELLED },
		}),
		// Emergency service bookings made by the donor
		prisma.bookingService.count({ where: { user_id: user.userId } }),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.PENDING },
		}),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.ACCEPTED },
		}),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.CONFIRMED },
		}),
		prisma.bookingService.count({
			where: { user_id: user.userId, booking_status: BookingStatus.CANCELLED },
		}),
	]);

	return {
		donations: {
			totalReceived: totalDonationReceived,
			pending: pendingDonations,
			accepted: acceptedDonations,
			scheduled: scheduledDonations,
			totalDonations: completedDonations,
			donorCancelled: donorCancelledDonations,
			rejected: rejectedDonations,
		},
		bloodRequests: {
			total: totalBloodRequests,
			pending: pendingBloodRequests,
			inProgress: inProgressBloodRequests,
			completed: completedBloodRequests,
			cancelled: cancelledBloodRequests,
		},
		bookings: {
			total: totalBookings,
			pending: pendingBookings,
			accepted: acceptedBookings,
			confirmed: confirmedBookings,
			cancelled: cancelledBookings,
		},
	};
};

const hospitalAnalyticsService = async (user: IUser) => {
	const [
		revenueStats,
		refundStats,
		totalBookingsReceived,
		pendingBookings,
		acceptedBookings,
		confirmedBookings,
		completedBookings,
		cancelledBookings,
		totalServices,
		activeServices,
		inProgressServices,
		inactiveServices,
	] = await prisma.$transaction([
		// Revenue from payments on this hospital's services
		prisma.payment.aggregate({
			where: {
				payment_status: PaymentStatus.PAID,
				emergencyService: { hospital: { user_id: user.userId } },
			},
			_sum: { payment_amount: true },
			_count: { id: true },
		}),
		prisma.payment.aggregate({
			where: {
				payment_status: PaymentStatus.REFUNDED,
				emergencyService: { hospital: { user_id: user.userId } },
			},
			_sum: { refund_amount: true },
			_count: { id: true },
		}),
		// Booking requests received for this hospital
		prisma.bookingService.count({
			where: { hospital: { user_id: user.userId } },
		}),
		prisma.bookingService.count({
			where: {
				hospital: { user_id: user.userId },
				booking_status: BookingStatus.PENDING,
			},
		}),
		prisma.bookingService.count({
			where: {
				hospital: { user_id: user.userId },
				booking_status: BookingStatus.ACCEPTED,
			},
		}),
		prisma.bookingService.count({
			where: {
				hospital: { user_id: user.userId },
				booking_status: BookingStatus.CONFIRMED,
			},
		}),
		prisma.bookingService.count({
			where: {
				hospital: { user_id: user.userId },
				booking_status: BookingStatus.COMPLETED,
			},
		}),
		prisma.bookingService.count({
			where: {
				hospital: { user_id: user.userId },
				booking_status: BookingStatus.CANCELLED,
			},
		}),
		// Emergency services offered by this hospital
		prisma.emergencyService.count({
			where: { hospital: { user_id: user.userId } },
		}),
		prisma.emergencyService.count({
			where: {
				hospital: { user_id: user.userId },
				service_status: ServiceStatus.ACTIVE,
			},
		}),
		prisma.emergencyService.count({
			where: {
				hospital: { user_id: user.userId },
				service_status: ServiceStatus.IN_PROGRESS,
			},
		}),
		prisma.emergencyService.count({
			where: {
				hospital: { user_id: user.userId },
				service_status: ServiceStatus.INACTIVE,
			},
		}),
	]);

	return {
		revenue: {
			totalRevenue: Number(revenueStats._sum.payment_amount ?? 0),
			totalTransactions: revenueStats._count.id ?? 0,
			totalRefunded: Number(refundStats._sum.refund_amount ?? 0),
			refundedTransactions: refundStats._count.id ?? 0,
		},
		bookings: {
			totalReceived: totalBookingsReceived,
			pending: pendingBookings,
			accepted: acceptedBookings,
			confirmed: confirmedBookings,
			completed: completedBookings,
			cancelled: cancelledBookings,
		},
		services: {
			total: totalServices,
			active: activeServices,
			inProgress: inProgressServices,
			inactive: inactiveServices,
		},
	};
};

export const AnalyticsServices = {
	getAnalytics,
	revenueMetricsService,
	userAnalyticsService,
	donorAnalyticsService,
	hospitalAnalyticsService,
};
