export type PublicService = { id: string; name: string; slug: string; description: string | null; image_path: string | null; price_amount: number; duration_minutes: number; category_id: string | null; payment_mode: "PAY_AT_BUSINESS" | "DEPOSIT" | "FULL_PAYMENT"; deposit_amount: number };
export type PublicStaff = { id: string; display_name: string; slug: string; bio: string | null; photo_path: string | null };
export type PublicWebsite = {
 business: null | { name: string; description: string; timezone: string; currency: string; contact_email: string | null; contact_phone: string | null; address: string | null; guest_booking_enabled: boolean; customer_registration_enabled: boolean; booking_approval_mode?: "ADMIN_APPROVAL" | "STAFF_APPROVAL" | "AUTO_CONFIRM" };
 website: null | { logo_path: string | null; hero_image_path: string | null; primary_color: string; font_key: string; sections: Record<string, unknown> };
 services: PublicService[]; staff: PublicStaff[]; assignments: { staff_id: string; service_id: string }[]; categories: { id: string; name: string; slug: string; sort_order: number }[];
 hours: { weekday: number; opens_at: string; closes_at: string }[];
 announcements: { title: string; body: string; starts_at: string; ends_at: string | null }[];
 policy: null | { terms: string; minimum_notice_minutes: number; maximum_advance_days: number; cancellation_notice_minutes: number };
  refund_policy: string | null;
};
export function money(amount: number, currency: string) { return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100); }
