import { catchAsync } from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import type { IUser } from "./user.interface";
import type { Request, Response } from "express";
import { UserService } from "./user.service";

const getMeController = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as IUser;

	const result = await UserService.getMeService(user);

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "User profile retrieved successfully.",
		data: result,
	});
});

const makeBloodRequestController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;

		const result = await UserService.makeBloodRequestService(req.body, user);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Blood request send successfully.",
			data: result,
		});
	},
);

const getMyBloodRequestController = catchAsync(async (req: Request, res: Response) => {
	const id = req.user?.userId as string;

	const result = await UserService.getMyBloodRequestService(req.query, id);

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "My blood request retrieved successfully.",
		data: result,
	});
})

const getAllRequesterController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await UserService.getAllRequestersService(req.query);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Requester retrieved successfully",
			data: result,
		});
	},
);

const getMyRequestDetailsController = catchAsync(
	async (req: Request, res: Response) => {
		const requster_id = req.params.id as string;

		const result = await UserService.getMyRequestDetailsService(requster_id);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Requests details retrieved successfully",
			data: result,
		});
	},
);

const updateMyRequestController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const requster_id = req.params.id as string;

		const result = await UserService.updateMyRequestService(
			user,
			requster_id,
			req.body,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Requests details updated successfully",
			data: result,
		});
	},
);

const deleteMyRequestController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;
		const requster_id = req.params.id as string;

		const result = await UserService.deleteMyRequestService(user, requster_id);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Requests deleted successfully",
			data: result,
		});
	},
);

// Admin Controlled

const updateProfileController = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as IUser;

		const result = await UserService.updateProfileService(
			user,
			req.body,
			req.file?.buffer,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "User profile updated successfully",
			data: result,
		});
	},
);

const getAllUserController = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.getAllUser(req.query);

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "Users retrieved successfully",
		data: result,
	});
});

const updateUserStatusController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await UserService.updateUserStatus(
			req.params.id as string,
			req.body,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "User status updated successfully",
			data: result,
		});
	},
);

const deleteUserController = catchAsync(async (req: Request, res: Response) => {
	await UserService.deleteUser(req.params.id as string);

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "User status deleted successfully",
	});
});

const updateRequesterController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await UserService.updateRequester(
			req.params.id as string,
			req.body,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Requester status updated successfully",
			data: result,
		});
	},
);

const getAllRequesterAdminController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await UserService.getAllRequesterAdmin(req.query);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "All requesters retrieved successfully",
			data: result,
		});
	},
);

export const UserController = {
	getMeController,
	makeBloodRequestController,
	getMyBloodRequestController,
	getAllRequesterController,
	getMyRequestDetailsController,
	updateMyRequestController,
	deleteMyRequestController,
	updateProfileController,
	getAllUserController,
	updateUserStatusController,
	deleteUserController,
	updateRequesterController,
	getAllRequesterAdminController,
};
