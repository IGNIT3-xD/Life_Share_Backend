import type { Request, Response } from "express";
import config from "../../config";
import { catchAsync } from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { AuthServices } from "./auth.service";

const registerUserController = catchAsync(
	async (req: Request, res: Response) => {
		await AuthServices.registerUserService(req.body, req.file?.buffer);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "OTP successfully send to your Email.",
		});
	},
);

const verifyEmailController = catchAsync(
	async (req: Request, res: Response) => {
		const result = await AuthServices.verifyEmailService(req.body);

		const { createUser, accessToken, refreshToken } = result;

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			sameSite: config.NODE_ENV === "development" ? 'lax' : 'none',
			secure: config.NODE_ENV === "development" ? false : true,
			maxAge: 1000 * 60 * 60 * 24,
		});
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			sameSite: config.NODE_ENV === "development" ? 'lax' : 'none',
			secure: config.NODE_ENV === "development" ? false : true,
			maxAge: 1000 * 60 * 60 * 24 * 7,
		});

		sendResponse(res, {
			statusCode: 201,
			success: true,
			message: "User registered successfuly.",
			data: {
				user: createUser,
				accessToken,
				refreshToken,
			},
		});
	},
);

const loginUser = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthServices.loginUserService(req.body);

	const { accessToken, refreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		sameSite: config.NODE_ENV === "development" ? 'lax' : 'none',
		secure: config.NODE_ENV === "development" ? false : true,
		maxAge: 1000 * 60 * 60 * 24,
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		sameSite: config.NODE_ENV === "development" ? 'lax' : 'none',
		secure: config.NODE_ENV === "development" ? false : true,
		maxAge: 1000 * 60 * 60 * 24 * 7,
	});

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "User login successfully.",
		data: {
			accessToken,
			refreshToken,
		},
	});
});

const refreshTokenController = catchAsync(
	async (req: Request, res: Response) => {
		if (!req.cookies.refreshToken) {
			throw new Error("Refresh token is missing");
		}

		const result = await AuthServices.refreshTokenService(
			req.cookies.refreshToken,
		);

		const { accessToken, refreshToken: newRefreshToken } = result;

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			sameSite: config.NODE_ENV === "development" ? 'lax' : 'none',
			secure: config.NODE_ENV === "development" ? false : true,
			maxAge: 1000 * 60 * 60 * 24,
		});
		res.cookie("refreshToken", newRefreshToken, {
			httpOnly: true,
			sameSite: config.NODE_ENV === "development" ? 'lax' : 'none',
			secure: config.NODE_ENV === "development" ? false : true,
			maxAge: 1000 * 60 * 60 * 24 * 7,
		});

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Token generated successfully.",
			data: {
				accessToken,
				refreshToken: newRefreshToken,
			},
		});
	},
);

const forgetPasswordController = catchAsync(
	async (req: Request, res: Response) => {
		const { email } = req.body;

		await AuthServices.forgetPasswordService(email);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Reset password OTP successfully send to your Email.",
		});
	},
);

const resetPasswordController = catchAsync(
	async (req: Request, res: Response) => {
		await AuthServices.resetPasswordService(req.body);

		sendResponse(res, {
			statusCode: 200,
			success: true,
			message: "Reset password successfully.",
		});
	},
);

const logoutController = catchAsync(async (req: Request, res: Response) => {
	res.clearCookie("accessToken", {
		httpOnly: true,
		sameSite: config.NODE_ENV === "development" ? "lax" : "none",
		secure: config.NODE_ENV === "development" ? false : true,
	});

	res.clearCookie("refreshToken", {
		httpOnly: true,
		sameSite: config.NODE_ENV === "development" ? "lax" : "none",
		secure: config.NODE_ENV === "development" ? false : true,
	});

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "User logged out successfully.",
		data: null,
	});
})

export const AuthController = {
	registerUserController,
	verifyEmailController,
	loginUser,
	refreshTokenController,
	forgetPasswordController,
	resetPasswordController,
	logoutController
};
