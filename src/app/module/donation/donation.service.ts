import { isPast } from "date-fns";
import {
	DonationStatus,
	DonorStatus,
	Role,
	VerificationStatus,
} from "../../../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import type { IDonation } from "./donation.interface";
import type { IUser } from "../auth/auth.interface";
import { validateUserById } from "../../utils/isUserExist";
import { IDonorQuery } from "../donor/donor.interface";

const createDonationService = async (payload: IDonation) => {
	const { donor_id, requester_id, scheduled_at } = payload;

	const requester = await prisma.requester.findUnique({
		where: { id: requester_id },
	});

	if (!requester) {
		throw new AppError(404, "Blood requester record not found.");
	}

	if (requester.verificationStatus !== VerificationStatus.VERIFIED) {
		throw new AppError(
			403,
			"This blood request profile has not been verified yet.",
		);
	}

	const donor = await prisma.donor.findUnique({ where: { id: donor_id } });

	if (!donor) {
		throw new AppError(404, "Target donor profile not found.");
	}

	if (donor.donorStatus !== DonorStatus.VERIFIED) {
		throw new AppError(403, "This donor profile has not been verified yet.");
	}

	if (donor.availability !== "AVAILABLE") {
		throw new AppError(400, "This donor is currently marked as unavailable.");
	}

	const existingActiveDonation = await prisma.donation.findFirst({
		where: {
			donor_id,
			requester_id,
			donationStatus: DonationStatus.PENDING,
		},
	});

	if (existingActiveDonation) {
		throw new AppError(
			400,
			"A pending donation matching this request and donor pair is already active.",
		);
	}

	const targetDate = new Date(scheduled_at);

	if (isPast(targetDate)) {
		throw new AppError(
			400,
			"The scheduled donation date cannot be in the past.",
		);
	}

	const donation = await prisma.donation.create({
		data: {
			donor_id,
			requester_id,
			scheduled_at,
		},
		include: {
			donor: true,
			requester: true,
		},
	});

	return donation;
};

const getMyDonationRequestService = async (user: IUser, query: IDonorQuery) => {
	const userData = await validateUserById(user.userId);

	const { search, blood_group, donationStatus, sortBy = 'desc', rawPage = 1, rawLimit = 10 } = query

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {
		requester: {
			user_id: userData.id,
		},
	}

	if (search) {
		where.OR = [
			{ requester: { patientName: { contains: search, mode: 'insensitive' } } },
			{ donor: { email: { contains: search, mode: 'insensitive' } } },
		]
	}

	if (blood_group) {
		where.requester = {
			...(where.requester || {}),
			blood_group: blood_group,
		};
	}

	if (donationStatus) {
		where.donationStatus = donationStatus
	}

	const skip = (page - 1) * limit;

	const [donationRequest, total] = await Promise.all([
		prisma.donation.findMany({
			where,
			skip,
			take: limit,
			orderBy: { created_at: sortBy },
			include: {
				donor: true,
				requester: true,
			},
		}),
		prisma.donation.count({ where }),
	]);

	if (!donationRequest) {
		throw new AppError(404, "Donation requests not found.");
	}

	return {
		donationRequest,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		}
	};
};

const getDonationRequestDetailsService = async (
	user: IUser,
	donation_id: string,
) => {
	const userData = await validateUserById(user.userId);

	const donation = await prisma.donation.findUnique({
		where: {
			id: donation_id,
		},
		include: {
			donor: true,
			requester: true,
		},
	});

	if (!donation) {
		throw new AppError(404, "Donation request not found.");
	}

	const isAdministrative =
		user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

	if (!isAdministrative && donation.requester.user_id !== userData.id) {
		throw new AppError(
			403,
			"Unauthorized access. You do not own this donation record.",
		);
	}

	return donation;
};

export const DonationService = {
	createDonationService,
	getMyDonationRequestService,
	getDonationRequestDetailsService,
};
