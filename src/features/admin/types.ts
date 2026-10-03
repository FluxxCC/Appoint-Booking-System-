import type { Database } from "@/types/database.generated";
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Appointment = Row<"appointments"> & { customer_name: string; staff_name: string; service_name?: string; collected_amount?: string };
export type Customer = Pick<Row<"customers">,"id"|"display_name"|"email"|"phone"> & { appointment_count?: number; last_appointment?: string|null; next_appointment?: string|null };
export type Payment = Pick<Row<"payments">,"id"|"amount"|"currency"|"state"|"provider"|"paid_at"|"created_at"|"exception_reason"> & { appointment_id?: string; appointment_state?: string; customer_name?: string; customer_kind?: "Customer"|"Guest"; public_reference?: string; provider_reference?: string|null; payment_mode_snapshot?: string; refunds?: {state:string;amount:number}[] };
export type AdminData = {
  business: Row<"business_settings">|null; policy?: Row<"booking_policy_versions">|null; expected_updated_at?: string;
  date: string; page: number; total?: number; hours?: Row<"business_hours">[];
  appointments?: Appointment[]; schedule?: Appointment[]; pending?: Appointment[]; upcoming?: Appointment[];
  events?: Row<"appointment_events">[]; activity?: Pick<Row<"audit_logs">,"id"|"action"|"entity_table"|"created_at">[];
  customers?: Customer[]; customer?: Customer|null; next_appointment?: string|null; no_shows?: number;
  payments?: Payment[]; closures?: Row<"business_closures">[]; announcements?: Row<"announcements">[];
  stats?: Record<"today"|"pending"|"confirmed"|"completed"|"no_show"|"upcoming"|"payment_expired",number>;
  by_status?: {state:string;count:number}[];
  money?: {currency:string;collected:string;today_collected:string;refunded:string;outstanding:string}[];
};
