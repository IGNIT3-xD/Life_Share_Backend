import { Router } from "express";
import { AnalyticsController } from "./analytics.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../../prisma/generated/prisma/enums";

const analyticsRouter = Router();

analyticsRouter.get(
	"/",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	AnalyticsController.getAnalytics,
);

analyticsRouter.get(
	"/revenue-metrics",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	AnalyticsController.getRevenueMetrics,
);

export default analyticsRouter;
