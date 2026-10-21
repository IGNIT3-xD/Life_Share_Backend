import { PaymentStatus } from "../../../../prisma/generated/prisma/enums";
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

export const AnalyticsServices = { getAnalytics, revenueMetricsService };
