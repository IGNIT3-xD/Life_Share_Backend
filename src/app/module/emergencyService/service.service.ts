import type { UploadApiResponse } from "cloudinary";
import cloudinary from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import { validateUserById } from "../../utils/isUserExist";
import type { IUser } from "../user/user.interface";
import type {
	IService,
	IServiceQuery,
	IUpdateService,
	IUpdateServiceStatus,
} from "./service.interface";

const createService = async (
	user: IUser,
	payload: IService,
	buffer: Buffer,
) => {
	const userData = await validateUserById(user.userId);

	const hospital = await prisma.hospital.findUnique({
		where: {
			user_id: userData.id,
		},
	});

	if (!hospital) {
		throw new AppError(404, "Hospital profile not found.");
	}

	if (hospital.hospital_status !== "VERIFIED") {
		throw new AppError(400, "Hospital profile is not verified.");
	}

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

	const service = await prisma.emergencyService.create({
		data: {
			service_name: payload.service_name,
			service_category: payload.service_category,
			description: payload.description,
			price: payload.price,
			availability: payload.availability,
			hospital_id: hospital.id,
			service_image: uploadResult.secure_url,
			service_image_public_id: uploadResult.public_id,
		},
		include: {
			hospital: {
				select: {
					user: {
						select: {
							name: true,
							email: true,
							address: true,
							phone: true,
						},
					},
				},
			},
		},
	});

	return service;
};

const getAllService = async (query: IServiceQuery) => {
	const {
		search,
		service_category,
		sortBy = "desc",
		sortByPrice,
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {
		service_status: "ACTIVE",
	};

	if (search) {
		where.OR = [{ service_name: { contains: search, mode: "insensitive" } }];
	}

	if (service_category) {
		where.service_category = service_category;
	}

	const skip = (page - 1) * limit;

	const orderBy = sortByPrice ? { price: sortByPrice } : { created_at: sortBy };

	const [services, total] = await Promise.all([
		prisma.emergencyService.findMany({
			where,
			skip,
			take: limit,
			orderBy,
		}),
		prisma.emergencyService.count({ where }),
	]);

	if (services.length === 0) {
		return {
			services: [],
			meta: { total: 0, page, limit, totalPages: 0 },
		};
	}

	return {
		services,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getServiceDetails = async (id: string) => {
	const service = await prisma.emergencyService.findUnique({
		where: { id },
		include: {
			hospital: {
				select: {
					license_number: true,
					description: true,
					hospital_status: true,
					user: {
						select: {
							name: true,
							email: true,
							address: true,
							phone: true,
						},
					},
				},
			},
		},
	});

	if (!service) {
		throw new AppError(404, "No service found.");
	}

	return service;
};

const getMyServices = async (user: IUser, query: IServiceQuery) => {
	const {
		search,
		service_category,
		service_status,
		sortBy = "desc",
		sortByPrice,
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {
		hospital: {
			user_id: user.userId,
		},
	};

	if (search) {
		where.OR = [{ service_name: { contains: search, mode: "insensitive" } }];
	}

	if (service_category) {
		where.service_category = service_category;
	}

	if (service_status) {
		where.service_status = service_status
	}

	const orderBy = sortByPrice ? { price: sortByPrice } : { created_at: sortBy };

	const skip = (page - 1) * limit;

	const [services, total] = await Promise.all([
		prisma.emergencyService.findMany({
			where,
			skip,
			take: limit,
			orderBy,
		}),
		prisma.emergencyService.count({ where }),
	]);

	if (services.length === 0) {
		return {
			services: [],
			meta: { total: 0, page, limit, totalPages: 0 },
		};
	}

	return {
		services,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateMyService = async (
	user: IUser,
	id: string,
	payload: IUpdateService,
	buffer?: Buffer,
) => {
	const services = await prisma.emergencyService.findUnique({
		where: { id },
		include: { hospital: true },
	});

	if (!services) {
		throw new AppError(404, "No service found.");
	}

	if (services.hospital.user_id !== user.userId) {
		throw new AppError(403, "Unauthorized access.");
	}

	const updateData: IUpdateService = {
		service_name: payload.service_name,
		service_category: payload.service_category,
		description: payload.description,
		price: payload.price,
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
								return reject(new AppError(400, "Cloudinary uplaod failed."));
							}
							resolve(result);
						},
					)
					.end(buffer);
			},
		);

		updateData.service_image = uploadResult.secure_url;
		updateData.service_image_public_id = uploadResult.public_id;
	}

	const updateService = await prisma.emergencyService.update({
		where: { id },
		data: updateData,
	});

	if (buffer && services.service_image_public_id) {
		try {
			await cloudinary.uploader.destroy(services.service_image_public_id);
		} catch {
			// Log but don't throw — old image orphan is non-critical
		}
	}

	return updateService;
};

const deleteMyService = async (user: IUser, id: string) => {
	const service = await prisma.emergencyService.findUnique({
		where: { id },
		include: { hospital: true },
	});

	if (!service) {
		throw new AppError(404, "No service found.");
	}

	if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
		if (service.hospital.user_id !== user.userId) {
			throw new AppError(403, "Unauthorized access.");
		}
	}

	await prisma.emergencyService.delete({ where: { id } });
};

// Admin Controlled
const getAllServiceAdmin = async (query: IServiceQuery) => {
	const {
		search,
		service_category,
		service_status,
		sortBy = "desc",
		sortByPrice,
		rawPage = 1,
		rawLimit = 10,
	} = query;

	const page = Math.max(1, Number(rawPage));
	const limit = Math.min(Math.max(1, Number(rawLimit)), 100);

	const where: Record<string, unknown> = {};

	if (search) {
		where.OR = [{ service_name: { contains: search, mode: "insensitive" } }];
	}

	if (service_category) {
		where.service_category = service_category;
	}

	if (service_status) {
		where.service_status = service_status;
	}

	const skip = (page - 1) * limit;

	const orderBy = sortByPrice ? { price: sortByPrice } : { created_at: sortBy };

	const [services, total] = await Promise.all([
		prisma.emergencyService.findMany({
			where,
			skip,
			take: limit,
			orderBy,
		}),
		prisma.emergencyService.count({ where }),
	]);

	if (services.length === 0) {
		return {
			services: [],
			meta: { total: 0, page, limit, totalPages: 0 },
		};
	}

	return {
		services,
		meta: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateServiceStatus = async (
	id: string,
	payload: IUpdateServiceStatus,
) => {
	const service = await prisma.emergencyService.findUnique({
		where: { id },
	});

	if (!service) {
		throw new AppError(400, "No service found.");
	}

	const updateServiceStatus = await prisma.emergencyService.update({
		where: { id },
		data: {
			service_status: payload.service_status,
		},
	});

	return updateServiceStatus;
};

export const EmergencyService = {
	createService,
	getAllService,
	getServiceDetails,
	getMyServices,
	updateMyService,
	deleteMyService,
	getAllServiceAdmin,
	updateServiceStatus,
};
