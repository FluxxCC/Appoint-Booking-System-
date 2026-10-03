import type {Database} from "@/types/database.generated";
import type {Appointment} from "@/features/admin/types";
type Row<T extends keyof Database["public"]["Tables"]>=Database["public"]["Tables"][T]["Row"];
export type Service=Row<"services">;
export type Category=Row<"service_categories">;
export type Staff=Omit<Row<"staff">,"auth_user_id">&{full_name:string|null;email:string|null;phone:string|null};
export type CatalogData={business:Row<"business_settings">|null;page:number;total:number;categories:Category[];services?:Service[];staff?:Staff[];service_options:{id:string;name:string;active:boolean}[];staff_options:{id:string;display_name:string;active:boolean}[];assignments?:{staff_id:string;service_id:string}[];assigned_services?:string[];hours?:Row<"staff_working_hours">[];exceptions?:Row<"staff_schedule_exceptions">[];upcoming?:Appointment[]};
export type StaffAppointment=Pick<Appointment,"id"|"starts_at"|"ends_at"|"state"|"customer_name"|"service_name">;
export type StaffWorkspace={staff_id:string;timezone:string;date:string;approval_mode:string;hours:Row<"staff_working_hours">[];business_hours:Row<"business_hours">[];exceptions:Row<"staff_schedule_exceptions">[];stats:{today:number;pending:number;confirmed:number;upcoming:number};today:StaffAppointment[];pending:StaffAppointment[];confirmed:StaffAppointment[];upcoming:StaffAppointment[]};
