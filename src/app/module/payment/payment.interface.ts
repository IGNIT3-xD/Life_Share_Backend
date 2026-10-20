import type {
	PaymentStatus,
	PaymentVia,
} from "../../../../prisma/generated/prisma/enums";
import type { SortOrder } from "../donor/donor.interface";

export interface IPaymentQuery {
	search?: string;
	payment_status?: PaymentStatus;
	payment_gateway?: PaymentVia;
	sortBy?: SortOrder;
	sortByAmount?: SortOrder;
	rawLimit?: number;
	rawPage?: number;
}

export interface IPaymentStatus {
	payment_status?: PaymentStatus;
	refund_amount?: number;
	refunded_at?: Date;
}
