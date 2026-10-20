import { HospitalStatus } from "../../../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import { validateUserById } from "../../utils/isUserExist";
import type { IUser } from "../user/user.interface";
import type {
	HospitalProfile,
	IHospitalQuery,
	IHospitalStatus,
	IUpdateHospitalProfile,
} from "./hospital.interface";

const createHospitalProfileService = async (
	user: IUser,
	payload: HospitalProfile,
) => {
	const isExist = await prisma.hospital.findUnique({
		where: { user_id: user.userId },
	});

	if (isExist) {
		throw new AppError(400, "Hospital profile is already exist.");
	}

	const createProfile = await prisma.hospital.create({
		data: {
			license_number: payload.license_number,
			description: payload.description,
			hospital_status: HospitalStatus.IN_PROGRESS,
			user_id: user.userId,
		},
		include: {
			user: {
				select: {
					name: true,
					email: true,
					address: true,
				},
			},
		},
	});

	return createProfile;
};

const getMyHospitalProfileService = async (user: IUser) => {
	const isExist = await prisma.hospital.findUnique({
		where: { user_id: user.userId },
		include: {
			user: {
				select: {
					name: true,
					email: true,
					address: true,
					phone: true,
					email_verified: true,
				},
			},
		},
	});

	if (!isExist) {
		throw new AppError(404, "Hospital profile not found.");
	}

	return isExist;
};

const updateHospitalProfileService = async (
	user: IUser,
	payload: IUpdateHospitalProfile,
) => {
	const isExist = await prisma.hospital.findUnique({
		where: { user_id: user.userId },
	});

	if (!isExist) {
		throw new AppError(404, "Hospital profile is not exist.");
	}

	const userData = await validateUserById(user.userId);

	const updateProfile = await prisma.hospital.update({
		where: {
			user_id: userData.id,
		},
		data: {
			license_number: payload.license_number,
			description: payload.description,
			user: {
				update: {
					name: payload.hospital_name,
					address: payload.hospital_address,
					phone: payload.hospital_phone,
				},
			},
		},
		include: {
			user: {
				select: {
					name: true,
					email: true,
					address: true,
					phone: true,
				},
			},
		},
	});

	return updateProfile;
};

// Admin controlled
const getAllHospitalProfile = async (query: IHospitalQuery) => {
	const {
		hospital_status,
		search,
		sortBy = "desc",
		rawLimit = 10,
		rawPage = 1,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {};

	if (hospital_status) {
		where.hospital_status = hospital_status;
	}

	if (search) {
		where.OR = [
			{ license_number: { contains: search, mode: 'insensitive' } },
			{ user: { name: { contains: search, mode: 'insensitive' } } },
			{ user: { phone: { contains: search, mode: 'insensitive' } } },
			{ user: { email: { contains: search, mode: 'insensitive' } } }
		]
	}

	const skip = (page - 1) * limit;

	const [hospital, total] = await Promise.all([
		prisma.hospital.findMany({
			where,
			skip,
			take: limit,
			orderBy: { created_at: sortBy },
			include: {
				user: {
					select: {
						name: true,
						email: true,
						address: true,
						phone: true,
						profile_pic: true,
					},
				},
			},
		}),
		prisma.hospital.count({ where }),
	]);

	if (!hospital) {
		throw new AppError(404, "Hospital profile not found");
	}

	return {
		hospital,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getHospitalProfileDetails = async (id: string) => {
	const hospital = await prisma.hospital.findUnique({
		where: { id },
		include: {
			user: {
				select: {
					name: true,
					email: true,
					address: true,
					phone: true,
					profile_pic: true,
				},
			},
			emergencyServices: {
				select: {
					service_name: true,
					service_category: true,
					price: true,
					service_status: true,
					availability: true,
					service_image: true,
				},
			},
		},
	});

	if (!hospital) {
		throw new AppError(404, "Hospital profile not found");
	}

	return hospital;
};

const updateHospitalProfileStatus = async (
	id: string,
	payload: IHospitalStatus,
) => {
	const isExist = await prisma.hospital.findUnique({
		where: { id },
	});

	if (!isExist) {
		throw new AppError(404, "Hospital profile is not exist.");
	}

	const updateProfile = await prisma.hospital.update({
		where: { id },
		data: {
			hospital_status: payload.hospital_status,
		},
		include: {
			user: {
				select: {
					name: true,
					email: true,
					address: true,
					phone: true,
				},
			},
		},
	});

	return updateProfile;
};

const deleteHospitalProfile = async (user: IUser, id: string) => {
	const isExist = await prisma.hospital.findUnique({
		where: { id },
	});

	if (!isExist) {
		throw new AppError(404, "Hospital profile is not exist.");
	}

	const userData = await validateUserById(user.userId);

	if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
		if (isExist.user_id !== userData.id) {
			throw new AppError(403, "Unauthorized access.");
		}
	}

	await prisma.hospital.delete({
		where: { id },
	});
};

export const HospitalService = {
	createHospitalProfileService,
	getMyHospitalProfileService,
	updateHospitalProfileService,
	getAllHospitalProfile,
	getHospitalProfileDetails,
	updateHospitalProfileStatus,
	deleteHospitalProfile,
};
