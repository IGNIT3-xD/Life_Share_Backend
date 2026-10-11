import { isPast } from "date-fns";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import { validateUserById } from "../../utils/isUserExist";
import type {
	IBloodRequester,
	IRequesterQuery,
	IRequesterQueryAdmin,
	IRequestUpdate,
	IUpdateProfile,
	IUpdateProfileStatus,
	IUpdateRequester,
	IUser,
	IUserQuery,
} from "./user.interface";
import cloudinary from "../../lib/cloudinary";
import type { UploadApiResponse } from "cloudinary";

const getMeService = async (user: IUser) => {
	const userData = await prisma.user.findUnique({
		where: {
			email: user.email,
			id: user.userId,
		},
		omit: { password: true },
	});

	if (!userData) {
		throw new AppError(404, "User not found");
	}

	return userData;
};

const makeBloodRequestService = async (
	payload: IBloodRequester,
	user: IUser,
) => {
	const isUserExist = await validateUserById(user.userId);

	const targetDate = new Date(payload.expires_at);

	if (isPast(targetDate)) {
		throw new AppError(400, "The expire date cannot be in the past.");
	}

	const bloodRequest = await prisma.requester.create({
		data: {
			user_id: isUserExist.id,
			patientName: payload.patientName,
			blood_group: payload.blood_group,
			unit_required: payload.unit_required,
			exact_location: payload.exact_location,
			expires_at: payload.expires_at,
			urgency: payload.urgency,
			note: payload.note,
		},
		// include: {
		// 	user: { omit: { password: true } },
		// },
	});

	return bloodRequest;
};

const getMyBloodRequestService = async (query: IRequesterQuery, id: string) => {
	const {
		search,
		blood_group,
		urgency,
		sortBy = "desc",
		verificationStatus,
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {
		user_id: id
	};

	if (search) {
		where.OR = [
			{ patientName: { contains: search, mode: "insensitive" } },
			{ exact_location: { contains: search, mode: "insensitive" } },
		];
	}

	if (blood_group) {
		where.blood_group = blood_group;
	}

	if (urgency) {
		where.urgency = urgency;
	}

	if (verificationStatus) {
		where.verificationStatus = verificationStatus
	}

	const skip = (page - 1) * limit;

	const [requester, total] = await Promise.all([
		prisma.requester.findMany({
			where,
			skip,
			take: limit,
			orderBy: { created_at: sortBy },
		}),
		prisma.requester.count({ where }),
	]);

	return {
		requester,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getAllRequestersService = async (query: IRequesterQuery) => {
	const {
		search,
		blood_group,
		urgency,
		sortBy = "desc",
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {
		verificationStatus: "VERIFIED",
	};

	if (search) {
		where.OR = [
			{ patientName: { contains: search, mode: "insensitive" } },
			{ exact_location: { contains: search, mode: "insensitive" } },
		];
	}

	if (blood_group) {
		where.blood_group = blood_group;
	}

	if (urgency) {
		where.urgency = urgency;
	}

	const skip = (page - 1) * limit;

	const [requester, total] = await Promise.all([
		prisma.requester.findMany({
			where,
			skip,
			take: limit,
			orderBy: { created_at: sortBy },
		}),
		prisma.requester.count({ where }),
	]);

	return {
		requester,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getMyRequestDetailsService = async (request_id: string) => {
	const requestData = await prisma.requester.findUnique({
		where: {
			id: request_id,
		},
		include: {
			user: {
				omit: { password: true },
			},
		},
	});

	if (!requestData) {
		throw new AppError(404, "No request record found.");
	}

	return requestData;
};

const updateMyRequestService = async (
	user: IUser,
	request_id: string,
	payload: IRequestUpdate,
) => {
	const requestData = await prisma.requester.findUnique({
		where: { id: request_id },
	});

	if (!requestData) {
		throw new AppError(404, "No request record found.");
	}

	if (requestData.user_id !== user.userId) {
		throw new AppError(
			403,
			"Unauthorized access. You do not own this request record.",
		);
	}

	const validStatusTransitions: Record<string, string[]> = {
		PENDING: ["PENDING", "CANCELLED"],
		IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
		COMPLETED: [],
		CANCELLED: ["PENDING"],
	};

	if (payload.request_status) {
		const allowed = validStatusTransitions[requestData.request_status] || [];
		if (!allowed.includes(payload.request_status)) {
			throw new AppError(
				400,
				`Cannot change request status from ${requestData.request_status} to ${payload.request_status}.`,
			);
		}
	}

	const updateRequesterDetails = await prisma.requester.update({
		where: { id: request_id },
		data: {
			patientName: payload.patientName,
			blood_group: payload.blood_group,
			unit_required: payload.unit_required,
			exact_location: payload.exact_location,
			expires_at: payload.expires_at,
			urgency: payload.urgency,
			note: payload.note,
			request_status: payload.request_status,
		},
	});

	return updateRequesterDetails;
};

const deleteMyRequestService = async (user: IUser, request_id: string) => {
	const requestData = await prisma.requester.findUnique({
		where: { id: request_id },
	});

	if (!requestData) {
		throw new AppError(404, "No request record found.");
	}

	if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
		if (requestData.user_id !== user.userId) {
			throw new AppError(
				403,
				"Unauthorized access. You do not own this request record.",
			);
		}
	}

	await prisma.requester.delete({
		where: { id: request_id },
	});

	return null;
};

const updateProfileService = async (
	user: IUser,
	payload: IUpdateProfile,
	buffer?: Buffer,
) => {
	const userData = await prisma.user.findUnique({
		where: { email: user.email },
	});

	if (!userData) {
		throw new AppError(404, "User not found");
	}

	const updateData: IUpdateProfile = {
		name: payload.name,
		address: payload.address,
		phone: payload.phone,
		gender: payload.gender,
	};

	if (buffer) {
		const uploadResult = await new Promise<UploadApiResponse>(
			(resolve, reject) => {
				cloudinary.uploader
					.upload_stream(
						{
							resource_type: "image",
						},
						(err, result) => {
							if (err) {
								return reject(err);
							}

							if (!result) {
								return reject(new AppError(400, "Cloudinary upload failed."));
							}

							resolve(result);
						},
					)
					.end(buffer);
			},
		);

		// Append the new image properties to the dynamic database payload
		updateData.profile_pic = uploadResult.secure_url;
		updateData.profile_pic_public_id = uploadResult.public_id;
	}

	const updateProfile = await prisma.user.update({
		where: {
			id: user.userId,
		},
		data: updateData,
		omit: { password: true },
	});

	if (buffer && userData.profile_pic_public_id) {
		try {
			await cloudinary.uploader.destroy(userData.profile_pic_public_id);
		} catch {
			// Log but don't throw — old image orphan is non-critical
		}
	}

	return updateProfile;
};

// Admin Controlled
const getAllUser = async (query: IUserQuery) => {
	const {
		search,
		gender,
		is_active,
		is_blocked,
		rawLimit = 10,
		rawPage = 1,
		role,
		sortBy = "desc",
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {};

	if (search) {
		where.OR = [
			{ name: { contains: search, mode: "insensitive" } },
			{ email: { contains: search, mode: "insensitive" } },
			{ address: { contains: search, mode: "insensitive" } },
			{ phone: { contains: search, mode: "insensitive" } },
		];
	}

	if (gender) {
		where.gender = gender;
	}

	if (is_active !== undefined) {
		where.is_active = is_active === true;
	}

	if (is_blocked !== undefined) {
		where.is_blocked = is_blocked === true;
	}

	if (role) {
		where.role = role;
	}

	const skip = (page - 1) * limit;

	const [user, total] = await Promise.all([
		prisma.user.findMany({
			where,
			take: limit,
			skip,
			orderBy: { created_at: sortBy },
		}),
		prisma.user.count({ where }),
	]);

	return {
		user,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateUserStatus = async (id: string, payload: IUpdateProfileStatus) => {
	const user = await prisma.user.findUnique({ where: { id } });

	if (!user) {
		throw new AppError(404, "User not found.");
	}

	const updateUser = await prisma.user.update({
		where: { id },
		data: {
			is_active: payload.is_active,
			is_blocked: payload.is_blocked,
		},
	});

	return updateUser;
};

const deleteUser = async (id: string) => {
	const user = await prisma.user.findUnique({ where: { id } });

	if (!user) {
		throw new AppError(404, "User not found.");
	}

	await prisma.user.delete({
		where: { id },
	});
};

const updateRequester = async (id: string, payload: IUpdateRequester) => {
	const requester = await prisma.requester.findUnique({ where: { id } });

	if (!requester) {
		throw new AppError(404, "No requester found.");
	}

	const verifyRequester = await prisma.requester.update({
		where: { id },
		data: {
			verificationStatus: payload.verificationStatus,
		},
	});

	return verifyRequester;
};

const getAllRequesterAdmin = async (query: IRequesterQueryAdmin) => {
	const {
		search,
		blood_group,
		urgency,
		verificationStatus,
		sortBy = "desc",
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {};

	if (search) {
		where.OR = [
			{ patientName: { contains: search, mode: "insensitive" } },
			{ exact_location: { contains: search, mode: "insensitive" } },
		];
	}

	if (blood_group) {
		where.blood_group = blood_group;
	}

	if (urgency) {
		where.urgency = urgency;
	}

	if (verificationStatus) {
		where.verificationStatus = verificationStatus;
	}

	const skip = (page - 1) * limit;

	const [requester, total] = await Promise.all([
		prisma.requester.findMany({
			where,
			skip,
			take: limit,
			orderBy: { created_at: sortBy },
		}),
		prisma.requester.count({ where }),
	]);

	return {
		requester,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

export const UserService = {
	getMeService,
	makeBloodRequestService,
	getMyBloodRequestService,
	getAllRequestersService,
	getMyRequestDetailsService,
	updateMyRequestService,
	deleteMyRequestService,
	updateProfileService,
	getAllUser,
	updateUserStatus,
	deleteUser,
	updateRequester,
	getAllRequesterAdmin,
};
