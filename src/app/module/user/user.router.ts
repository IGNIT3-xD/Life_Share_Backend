import { Router } from "express";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../../prisma/generated/prisma/enums";
import { UserController } from "./user.controller";
import { validateRequest } from "../../middlewares/validateRequest";
import { UserValidation } from "./user.validation";
import { upload } from "../../lib/multer";

const userRouter = Router();

userRouter.get(
	"/me",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DONOR, Role.HOSPITAL, Role.USER),
	UserController.getMeController,
);

userRouter.post(
	"/blood-request",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DONOR, Role.HOSPITAL, Role.USER),
	validateRequest(UserValidation.makeBloodRequestValidate),
	UserController.makeBloodRequestController,
);

userRouter.get(
	"/my-blood-request",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DONOR, Role.HOSPITAL, Role.USER),
	UserController.getMyBloodRequestController,
);

userRouter.get("/requester", UserController.getAllRequesterController);

userRouter.get(
	"/all-requesters",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	UserController.getAllRequesterAdminController,
);

userRouter.get("/request/:id", UserController.getMyRequestDetailsController);

userRouter.patch(
	"/update-my-request/:id",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DONOR, Role.HOSPITAL, Role.USER),
	validateRequest(UserValidation.updateMyRequestValidationSchema),
	UserController.updateMyRequestController,
);

userRouter.delete(
	"/delete-my-request/:id",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DONOR, Role.HOSPITAL, Role.USER),
	UserController.deleteMyRequestController,
);

userRouter.patch(
	"/update-profile",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DONOR, Role.HOSPITAL, Role.USER),
	upload.single("profile_pic"),
	validateRequest(UserValidation.updateUserValidation),
	UserController.updateProfileController,
);

userRouter.put(
	"/requester/:id",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	UserController.updateRequesterController,
);

userRouter.get(
	"/all-users",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	UserController.getAllUserController,
);

userRouter.put(
	"/:id",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	UserController.updateUserStatusController,
);

userRouter.delete(
	"/:id",
	auth(Role.SUPER_ADMIN),
	UserController.deleteUserController,
);

export default userRouter;
