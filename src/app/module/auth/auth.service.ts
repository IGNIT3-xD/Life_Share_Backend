import { AuthProvider, Role } from "../../../../prisma/generated/prisma/enums";
import config from "../../config";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions, type JwtPayload } from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import type {
	ILoginUser,
	IRegisterUser,
	IResetPassword,
	IVerifyRegisterOtp,
} from "./auth.interface";
import cloudinary from "../../lib/cloudinary";
import type { UploadApiResponse } from "cloudinary";
import crypto from "node:crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import path from "node:path";
import { isUserExist } from "../../utils/isUserExist";

const registerUserService = async (payload: IRegisterUser, buffer?: Buffer) => {
	const { email, password, role } = payload;

	const isExist = await prisma.user.findUnique({ where: { email } });

	if (isExist) {
		throw new AppError(400, "User already exist. Please, login");
	}

	if (role === Role.ADMIN || role === "SUPER_ADMIN") {
		throw new AppError(
			400,
			"You are not eligible for self-registration with this role. Please contact an Administrator.",
		);
	}

	const hashedPassword = await bcrypt.hash(password, 8);

	let profile_pic: string | null = null;
	let profile_pic_public_id: string | null = null;

	if (buffer) {
		const uploadResult = await new Promise<UploadApiResponse>(
			(resolve, reject) => {
				cloudinary.uploader
					.upload_stream(
						{
							resource_type: "image",
						},
						(error, result) => {
							if (error) {
								return reject(error);
							}
							if (!result) {
								return reject(
									new AppError(
										400,
										"Cloudinary upload failed without an error context.",
									),
								);
							}
							resolve(result);
						},
					)
					.end(buffer);
			},
		);

		profile_pic = uploadResult.secure_url;
		profile_pic_public_id = uploadResult.public_id;
	}

	// Generate OTP and reserve un-verified data to the Redis
	const otp = crypto.randomInt(100000, 1000000).toString();
	const otpKey = `registration-otp:${email}`;
	const expTime = 2 * 60;

	await redisClient.set(otpKey, otp, {
		expiration: {
			type: "EX",
			value: expTime,
		},
	});

	const redisPayload = {
		name: payload.name,
		email,
		password: hashedPassword,
		role,
		phone: payload.phone,
		address: payload.address,
		gender: payload.gender,
		profile_pic,
		profile_pic_public_id,
		auth_provider: AuthProvider.CREDENTIAL,
	};

	const payloadKey = `user-data:${email}`;

	await redisClient.set(payloadKey, JSON.stringify(redisPayload), {
		expiration: {
			type: "EX",
			value: expTime,
		},
	});

	// const templatePath = path.join(
	// 	process.cwd(),
	// 	"src/app/templates/register-user-otp.ejs",
	// );

	// const html = await ejs.renderFile(templatePath, {
	// 	userName: payload.name,
	// 	otp,
	// 	expTime: expTime / 60,
	// });

	// await transporter.sendMail({
	// 	from: config.SMTP_EMAIL_SENDER,
	// 	to: email,
	// 	subject: "Verify Your Account",
	// 	html,
	// });

	try {
		const templatePath = path.join(
			process.cwd(),
			"src/app/templates/register-user-otp.ejs",
		);

		const html = await ejs.renderFile(templatePath, {
			userName: payload.name,
			otp,
			expTime: expTime / 60,
		});

		await transporter.sendMail({
			from: config.SMTP_EMAIL_SENDER,
			to: email,
			subject: "Verify Your Account",
			html,
		});
	} catch (error: any) {
		console.error("🚨 EMAIL SENDING FAILED 🚨", error);

		// If email fails, we should probably delete the Redis data so they can try again
		await redisClient.del([otpKey, payloadKey]);

		throw new AppError(500, "Failed to send OTP email. Please try again later.");
	}
};

const verifyEmailService = async (payload: IVerifyRegisterOtp) => {
	const { email, otp } = payload;

	const user = await prisma.user.findUnique({ where: { email } });

	if (user?.is_blocked) {
		throw new AppError(400, "User is blocked.");
	}

	if (user?.email_verified) {
		throw new AppError(400, "Email is already verified.");
	}

	const otpKey = `registration-otp:${email}`;
	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(404, "No OTP found. Please request a new one.");
	}

	if (redisOtp !== otp) {
		throw new AppError(400, "Invalid OTP.");
	}

	await redisClient.del([otpKey]);

	const payloadKey = `user-data:${email}`;
	const redisPayload = await redisClient.get(payloadKey);

	if (!redisPayload) {
		throw new AppError(404, "No user data found.");
	}

	const userData: IRegisterUser = JSON.parse(redisPayload);

	const createUser = await prisma.user.create({
		data: {
			name: userData.name,
			email: userData.email,
			password: userData.password,
			phone: userData.phone,
			address: userData.address,
			gender: userData.gender,
			role: userData.role,
			email_verified: true,
			profile_pic: userData.profile_pic,
			profile_pic_public_id: userData.profile_pic_public_id,
			auth_provider: AuthProvider.CREDENTIAL,
		},
		omit: {
			password: true,
		},
	});

	await redisClient.del([payloadKey]);

	const jwtPayload = {
		userId: createUser.id,
		name: createUser.name,
		email: createUser.email,
		role: createUser.role,
	} as JwtPayload;

	const accessToken = jwt.sign(jwtPayload, config.JWT_ACCESS, {
		expiresIn: config.JWT_ACCESS_EXPIRES_IN,
	} as SignOptions);

	const refreshToken = jwt.sign(jwtPayload, config.JWT_REFRESH, {
		expiresIn: config.JWT_REFRESH_EXPIRES_IN,
	} as SignOptions);

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/welcome.ejs",
	);

	const html = await ejs.renderFile(templatePath, {
		name: createUser.name,
	});

	await transporter.sendMail({
		from: config.SMTP_EMAIL_SENDER,
		to: createUser.email,
		subject: "Welcome To Life Share",
		html,
	});

	return { createUser, accessToken, refreshToken };
};

const loginUserService = async (payload: ILoginUser) => {
	const { email, password } = payload;

	const user = await isUserExist(email);
	// console.log("From reusable function: ", user);

	const matchedPassword = await bcrypt.compare(
		password,
		user?.password as string,
	);

	if (!matchedPassword) {
		throw new AppError(400, "Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	} as JwtPayload;

	const accessToken = jwt.sign(jwtPayload, config.JWT_ACCESS, {
		expiresIn: config.JWT_ACCESS_EXPIRES_IN,
	} as SignOptions);

	const refreshToken = jwt.sign(jwtPayload, config.JWT_REFRESH, {
		expiresIn: config.JWT_REFRESH_EXPIRES_IN,
	} as SignOptions);

	return { accessToken, refreshToken };
};

const refreshTokenService = async (rToken: string) => {
	const verfyToken = jwt.verify(rToken, config.JWT_REFRESH) as JwtPayload;

	const { userId, name, email, role } = verfyToken;

	const user = await prisma.user.findUnique({
		where: { id: userId, email },
	});

	if (!user) {
		throw new AppError(404, "User not found.");
	}

	if (!user.is_active || user.is_blocked) {
		throw new AppError(403, "User is inactive or blocked.");
	}

	const jwtPayload = {
		userId,
		name,
		email,
		role,
	} as JwtPayload;

	const accessToken = jwt.sign(jwtPayload, config.JWT_ACCESS, {
		expiresIn: config.JWT_ACCESS_EXPIRES_IN,
	} as SignOptions);

	const refreshToken = jwt.sign(jwtPayload, config.JWT_REFRESH, {
		expiresIn: config.JWT_REFRESH_EXPIRES_IN,
	} as SignOptions);

	return { accessToken, refreshToken };
};

const forgetPasswordService = async (email: string) => {
	// const user = await prisma.user.findUnique({
	// 	where: { email },
	// });

	// if (!user) {
	// 	throw new AppError(404, "User not found");
	// }

	// if (!user.email_verified) {
	// 	throw new AppError(400, "User email is not verified");
	// }

	// if (user.is_blocked) {
	// 	throw new AppError(400, "User is blocked.");
	// }

	// if (user.auth_provider !== AuthProvider.CREDENTIAL) {
	// 	throw new AppError(404, "User has an account with Google.");
	// }

	const user = await isUserExist(email);

	const otp = crypto.randomInt(100000, 1000000).toString();
	const otpKey = `forget-pass-otp:${email}`;

	await redisClient.set(otpKey, otp, {
		expiration: {
			type: "EX",
			value: 2 * 60,
		},
	});

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/forget-pass-otp.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		userName: user.name,
		otp,
		expTime: 2,
	});

	await transporter.sendMail({
		from: config.SMTP_EMAIL_SENDER,
		to: email,
		subject: "Reset Password OTP",
		html,
	});
};

const resetPasswordService = async (payload: IResetPassword) => {
	const { email, otp, newPassword } = payload;

	// const user = await prisma.user.findUnique({
	// 	where: { email },
	// });

	// if (!user) {
	// 	throw new AppError(404, "User not found");
	// }

	// if (!user.email_verified) {
	// 	throw new AppError(400, "User email is not verified");
	// }

	// if (user.is_blocked) {
	// 	throw new AppError(400, "User is blocked.");
	// }

	// if (user.auth_provider !== "CREDENTIAL") {
	// 	throw new AppError(404, "User has an account with Google.");
	// }

	const user = await isUserExist(email);

	const otpKey = `forget-pass-otp:${email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(404, "OTP not found");
	}

	if (redisOtp !== otp) {
		throw new AppError(400, "Invalid OTP");
	}

	const hashedNewPassword = await bcrypt.hash(newPassword, 8);

	await prisma.user.update({
		where: { email },
		data: {
			password: hashedNewPassword,
		},
	});

	await redisClient.del(otpKey);

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/reset-pass-success.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		name: user.name,
		appName: "Life Share",
		loginUrl: `${config.FRONTEND_URL}/auth/login`,
	});

	await transporter.sendMail({
		from: config.SMTP_EMAIL_SENDER,
		to: user.email,
		subject: "Password Reset Successfully",
		html,
	});
};

export const AuthServices = {
	registerUserService,
	verifyEmailService,
	loginUserService,
	refreshTokenService,
	forgetPasswordService,
	resetPasswordService,
};
