import { catchAsync } from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import type { IUser } from "../user/user.interface";
import { DonationService } from "./donation.service";
import type { Request, Response } from "express";

const createDonationController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await DonationService.createDonationService(req.body);

		sendResponse(res, {
			statusCode: 201,
			success: true,
			message: "Donation created successfully",
			data: result,
		});
	},
);

const getMyDonationRequestController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await DonationService.getMyDonationRequestService(
			req.user as IUser,
			req.query
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Donations request retrieved successfully",
			data: result,
		});
	},
);

const getDonationRequestDetailsController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await DonationService.getDonationRequestDetailsService(
			req.user as IUser,
			req.params.id as string,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Donations request details retrieved successfully",
			data: result,
		});
	},
);

export const DonationController = {
	createDonationController,
	getMyDonationRequestController,
	getDonationRequestDetailsController,
};
