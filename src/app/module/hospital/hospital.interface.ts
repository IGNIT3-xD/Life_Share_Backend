import type { HospitalStatus } from "../../../../prisma/generated/prisma/enums";
import type { SortOrder } from "../donor/donor.interface";

export interface HospitalProfile {
	license_number: string;
	description: string;
}

export interface IUpdateHospitalProfile {
	hospital_name?: string;
	hospital_address?: string;
	hospital_phone?: string;

	license_number?: string;
	description?: string;
}

export interface IHospitalQuery {
	hospital_status?: HospitalStatus;
	search?: string;
	sortBy?: SortOrder;
	rawPage?: number;
	rawLimit?: number;
}

export interface IHospitalStatus {
	hospital_status: HospitalStatus;
}
