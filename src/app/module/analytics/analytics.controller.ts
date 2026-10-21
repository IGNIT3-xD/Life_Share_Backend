import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import type { IUser } from "../auth/auth.interface";
import { AnalyticsServices } from "./analytics.service";

const getAnalytics = catchAsync(async (_req: Request, res: Response) => {
	const data = await AnalyticsServices.getAnalytics();

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "Analytics retrieved successfully",
		data,
	});
});

const getRevenueMetrics = catchAsync(async (_req: Request, res: Response) => {
	const data = await AnalyticsServices.revenueMetricsService();

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "Analytics retrieved successfully",
		data,
	});
});

const getMyAnalyticsController = catchAsync(
	async (req: Request, res: Response) => {
		const data = await AnalyticsServices.userAnalyticsService(
			req.user as IUser,
		);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "User analytics retrieved successfully",
			data,
		});
	},
);

export const AnalyticsController = {
	getAnalytics,
	getRevenueMetrics,
	getMyAnalyticsController,
};
