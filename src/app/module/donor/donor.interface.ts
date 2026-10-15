import type {
	BloodGroup,
	DonationStatus,
	DonorAvailability,
	DonorStatus,
	RequestUrgency,
} from "../../../../prisma/generated/prisma/enums";

export type SortOrder = "asc" | "desc";

export interface IDonorQuery {
	search?: string;
	blood_group?: BloodGroup;
	availability?: DonorAvailability;
	donationStatus?: DonationStatus;
	location?: string;
	sortBy?: SortOrder;
	rawPage?: number;
	rawLimit?: number;
}

export interface IDonorQueryAdmin {
	search?: string;
	blood_group?: BloodGroup;
	availability?: DonorAvailability;
	donorStatus?: DonorStatus;
	location?: string;
	sortBy?: SortOrder;
	rawPage?: number;
	rawLimit?: number;
}

export interface IDonationAdmin {
	urgency?: RequestUrgency;
	donationStatus?: DonationStatus;
	blood_group?: BloodGroup;
	sortBy?: SortOrder;
	rawPage?: number;
	rawLimit?: number;
}

export interface IDonor {
	email: string;
	blood_group: BloodGroup;
	location: string;
	age: number;
	availability?: DonorAvailability;
	weightKg: number;
	height: number;
	totalDonations?: number | null;
	lastDonationDate?: Date | null;
}

export interface IUpdateDonor {
	blood_group?: BloodGroup;
	location?: string;
	age?: number;
	availability?: DonorAvailability;
	weightKg?: number;
	height?: number;
}

export interface IUpdateDonorStatus {
	donorStatus?: DonorStatus;
}

export interface IUpdateDonation {
	donationStatus: DonationStatus;
}
