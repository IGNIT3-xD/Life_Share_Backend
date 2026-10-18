import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validateRequest } from "../../middlewares/validateRequest";
import { UserValidation } from "./auth.validation";
import { upload } from "../../lib/multer";
import { rateLimit } from "../../middlewares/rateLimit";

const authRouter = Router();

authRouter.post(
	"/register",
	rateLimit(5, 10 * 60 * 1000),
	upload.single("profile_pic"),
	validateRequest(UserValidation.registerUserValidation),
	AuthController.registerUserController,
);

authRouter.post(
	"/verify-email",
	rateLimit(10, 10 * 60 * 1000),
	validateRequest(UserValidation.verifyEmail),
	AuthController.verifyEmailController,
);

authRouter.post(
	"/login",
	rateLimit(10, 15 * 60 * 1000),
	validateRequest(UserValidation.loginUserValidation),
	AuthController.loginUser,
);

authRouter.post("/refresh-token", AuthController.refreshTokenController);

authRouter.post(
	"/forget-password",
	rateLimit(5, 10 * 60 * 1000),
	validateRequest(UserValidation.forgetPassEmail),
	AuthController.forgetPasswordController,
);

authRouter.post(
	"/reset-password",
	rateLimit(5, 10 * 60 * 1000),
	validateRequest(UserValidation.resetPassword),
	AuthController.resetPasswordController,
);

authRouter.post("/logout", AuthController.logoutController)

export default authRouter;
