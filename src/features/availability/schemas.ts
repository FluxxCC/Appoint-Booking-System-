import {z} from "zod";
export const availabilityInput=z.object({service:z.uuid(),date:z.iso.date(),staff:z.union([z.literal(""),z.uuid()]).default(""),diagnostics:z.enum(["","true"]).default("")});
export type AvailabilityInput=z.infer<typeof availabilityInput>;
export type AvailabilitySlot={starts_at:string;ends_at:string;local_time:string;staff_ids:string[];assigned_staff_id:string;staff:{id:string;display_name:string}[]};
export type AvailabilityResult={date:string;timezone:string;service?:{id:string;name:string;duration_minutes:number;buffer_before_minutes:number;buffer_after_minutes:number};scheduling_interval_minutes:number;slots:AvailabilitySlot[];diagnostics?:{business_hours:{opens_at:string;closes_at:string}[];staff_hours:{staff_id:string;display_name:string;starts_at:string;ends_at:string}[];closures:{starts_at:string;ends_at:string;reason:string}[];exceptions:{staff_id:string;kind:"UNAVAILABLE"|"EXTRA_HOURS";starts_at:string;ends_at:string;reason:string}[];blocked_intervals:{staff_id:string;starts_at:string;ends_at:string;state:string}[]}};

