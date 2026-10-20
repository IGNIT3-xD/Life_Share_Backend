import {
	DonationStatus,
	DonorStatus,
	RequestStatus,
	Role,
} from "../../../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import { validateUserById } from "../../utils/isUserExist";
import type { IUser } from "../auth/auth.interface";
import type {
	IDonationAdmin,
	IDonor,
	IDonorQuery,
	IDonorQueryAdmin,
	IUpdateDonation,
	IUpdateDonor,
	IUpdateDonorStatus,
} from "./donor.interface";

const createDonorProfileService = async (payload: IDonor, user: IUser) => {
	const isUserExist = await validateUserById(user.userId);
	// console.log(isUserExist);

	const isDonorExist = await prisma.donor.findUnique({
		where: { email: isUserExist.email },
	});

	if (isDonorExist) {
		throw new AppError(400, "Donor profile is already exist.");
	}

	const donor = await prisma.donor.create({
		data: {
			userId: isUserExist.id,
			email: isUserExist.email,
			age: payload.age,
			blood_group: payload.blood_group,
			location: payload.location,
			height: payload.height,
			weightKg: payload.weightKg,
			availability: payload.availability,
			donorStatus: DonorStatus.IN_PROGRESS,
			totalDonations: payload.totalDonations,
			lastDonationDate: payload.lastDonationDate,
		},
		include: {
			user: { omit: { password: true } },
		},
	});

	return donor;
};

const getMyDonorProfileService = async (user: IUser) => {
	const userData = await validateUserById(user.userId);

	const donorProfile = await prisma.donor.findUnique({
		where: {
			userId: userData.id,
		},
		include: {
			user: {
				omit: { password: true },
			},
		},
	});

	if (!donorProfile) {
		throw new AppError(404, "Donor profile not found.");
	}

	return donorProfile;
};

const getAllDonorsService = async (query: IDonorQuery) => {
	const {
		search,
		blood_group,
		availability,
		location,
		sortBy = "desc",
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {
		donorStatus: DonorStatus.VERIFIED,
	};

	if (blood_group) {
		where.blood_group = blood_group;
	}

	if (availability) {
		where.availability = availability;
	}

	if (location) {
		where.location = { contains: location, mode: "insensitive" };
	}

	if (search) {
		where.OR = [
			{ location: { contains: search, mode: "insensitive" } },
			{ user: { name: { contains: search, mode: "insensitive" } } },
			{ user: { email: { contains: search, mode: "insensitive" } } },
		];
	}

	const skip = (page - 1) * limit;

	const [donors, total] = await Promise.all([
		prisma.donor.findMany({
			where,
			skip,
			take: limit,
			include: {
				user: { omit: { password: true } },
			},
			orderBy: { created_at: sortBy },
		}),
		prisma.donor.count({ where }),
	]);

	return {
		donors,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getDonationRequestService = async (
	user: IUser,
	query: IDonationAdmin,
) => {
	const {
		urgency,
		blood_group,
		donationStatus,
		search,
		sortBy = "desc",
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {
		donor: {
			userId: user.userId,
		},
	};

	if (donationStatus) {
		where.donationStatus = donationStatus;
	}

	const requesterFilters: Record<string, unknown> = {};

	if (urgency) {
		requesterFilters.urgency = urgency;
	}
	if (blood_group) {
		requesterFilters.blood_group = blood_group;
	}
	if (Object.keys(requesterFilters).length > 0) {
		where.requester = requesterFilters;
	}
	if (search) {
		where.OR = [
			{ requester: { patientName: { contains: search, mode: 'insensitive' } } },
			{ requester: { exact_location: { contains: search, mode: 'insensitive' } } },
		]
	}

	const skip = (page - 1) * limit;

	const [donation, total] = await Promise.all([
		prisma.donation.findMany({
			where,
			skip,
			take: limit,
			include: { requester: true },
			orderBy: { created_at: sortBy },
		}),
		prisma.donation.count({ where }),
	]);

	return {
		donation,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getDetailsDonationRequestService = async (
	user: IUser,
	donation_id: string,
) => {
	const donation = await prisma.donation.findUnique({
		where: { id: donation_id },
		include: {
			donor: true,
			requester: {
				include: {
					user: {
						omit: { password: true },
					},
				},
			},
		},
	});

	if (!donation) {
		throw new AppError(404, "Donation request not found.");
	}

	const isAdministrative =
		user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

	if (!isAdministrative && donation.donor.userId !== user.userId) {
		throw new AppError(
			403,
			"Unauthorized access. You do not own this donation record.",
		);
	}

	return donation;
};

const updateDonationRequestService = async (
	user: IUser,
	donation_id: string,
	payload: IUpdateDonation,
) => {
	const donation = await prisma.donation.findUnique({
		where: { id: donation_id },
		include: { donor: true },
	});

	if (!donation) {
		throw new AppError(404, "Donation request not found.");
	}

	const isAdministrative =
		user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

	if (!isAdministrative && donation.donor.userId !== user.userId) {
		throw new AppError(
			403,
			"Unauthorized access. You do not own this donation record.",
		);
	}

	if (donation.donationStatus === "COMPLETED") {
		throw new AppError(400, "This request is already completed.");
	}

	const result = await prisma.$transaction(async (tx) => {
		const updatedDonation = await tx.donation.update({
			where: { id: donation.id },
			data: {
				donationStatus: payload.donationStatus,
			},
		});

		if (
			updatedDonation.donationStatus === DonationStatus.ACCEPTED ||
			updatedDonation.donationStatus === DonationStatus.SCHEDULED
		) {
			await tx.requester.update({
				where: { id: donation.requester_id },
				data: {
					request_status: RequestStatus.IN_PROGRESS,
				},
			});
		} else if (updatedDonation.donationStatus === DonationStatus.COMPLETED) {
			await tx.requester.update({
				where: { id: donation.requester_id },
				data: {
					request_status: RequestStatus.COMPLETED,
				},
			});

			await tx.donation.update({
				where: { id: donation.id },
				data: {
					donated_at: new Date(),
				},
			});

			await tx.donor.update({
				where: {
					id: donation.donor_id,
				},
				data: {
					totalDonations: { increment: 1 },
					lastDonationDate: new Date(),
					availability: "ON_HOLD",
				},
			});
		} else if (
			updatedDonation.donationStatus === DonationStatus.DONOR_CANCELLED
		) {
			await tx.requester.update({
				where: { id: donation.requester_id },
				data: {
					request_status: RequestStatus.PENDING,
				},
			});
		} else {
			await tx.requester.update({
				where: { id: donation.requester_id },
				data: {
					request_status: RequestStatus.PENDING,
				},
			});
		}

		return updatedDonation;
	});

	return result;
};

const getDonorProfileService = async (donor_id: string) => {
	const donor = await prisma.donor.findUnique({
		where: { id: donor_id },
		include: {
			user: {
				select: {
					name: true,
					gender: true,
					phone: true,
					profile_pic: true,
				},
			},
		},
	});

	if (!donor) {
		throw new AppError(404, "Donor profile not found.");
	}

	return donor;
};

const updateDonorProfileService = async (
	user: IUser,
	payload: IUpdateDonor,
) => {
	const donor = await prisma.donor.findUnique({
		where: { userId: user.userId },
	});

	if (!donor) {
		throw new AppError(404, "Donor profile not found.");
	}

	const updateDonorProfile = await prisma.donor.update({
		where: {
			userId: user.userId,
		},
		data: {
			blood_group: payload.blood_group,
			age: payload.age,
			availability: payload.availability,
			weightKg: payload.weightKg,
			height: payload.height,
		},
	});

	return updateDonorProfile;
};

const getDonorRequestService = async (user: IUser) => {
	const donor = await prisma.donor.findUnique({
		where: { userId: user.userId },
	});

	if (!donor) {
		throw new AppError(404, "Donor not found found.");
	}

	const donations = await prisma.donation.findMany({
		where: {
			donor_id: donor.id,
		},
	});

	if (donations.length === 0) {
		return [];
	}

	return donations;
};

// Admin Controlled
const adminGetAllDonorsService = async (query: IDonorQueryAdmin) => {
	const {
		search,
		blood_group,
		availability,
		donorStatus,
		location,
		sortBy = "desc",
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {};

	if (blood_group) {
		where.blood_group = blood_group;
	}

	if (availability) {
		where.availability = availability;
	}

	if (donorStatus) {
		where.donorStatus = donorStatus;
	}

	if (location) {
		where.location = { contains: location, mode: "insensitive" };
	}

	if (search) {
		where.OR = [
			{ location: { contains: search, mode: "insensitive" } },
			{ user: { name: { contains: search, mode: "insensitive" } } },
			{ user: { email: { contains: search, mode: "insensitive" } } },
		];
	}

	const skip = (page - 1) * limit;

	const [donors, total] = await Promise.all([
		prisma.donor.findMany({
			where,
			skip,
			take: limit,
			include: {
				user: { omit: { password: true } },
			},
			orderBy: { created_at: sortBy },
		}),
		prisma.donor.count({ where }),
	]);

	return {
		donors,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateDonorProfileStatusService = async (
	donor_id: string,
	payload: IUpdateDonorStatus,
) => {
	const donor = await prisma.donor.findUnique({
		where: { id: donor_id },
	});

	if (!donor) {
		throw new AppError(404, "Donor profile not found.");
	}

	const updateDonorProfile = await prisma.donor.update({
		where: {
			id: donor.id,
		},
		data: {
			donorStatus: payload.donorStatus,
		},
	});

	return updateDonorProfile;
};

const deleteDonorProfileService = async (user: IUser, id: string) => {
	const donor = await prisma.donor.findUnique({
		where: { id },
	});

	if (!donor) {
		throw new AppError(404, "Donor profile not found.");
	}

	if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
		if (donor.userId !== user.userId) {
			throw new AppError(403, "Unauthorized access.");
		}
	}

	await prisma.donor.delete({
		where: { id },
	});
};

export const DonorService = {
	createDonorProfileService,
	getMyDonorProfileService,
	getAllDonorsService,
	getDonationRequestService,
	getDetailsDonationRequestService,
	updateDonationRequestService,
	getDonorProfileService,
	updateDonorProfileService,
	getDonorRequestService,
	updateDonorProfileStatusService,
	adminGetAllDonorsService,
	deleteDonorProfileService,
};
