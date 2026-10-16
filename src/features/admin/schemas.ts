import { z } from "zod";

export const appointmentStates = ["PENDING", "DECLINED", "ACCEPTED", "AWAITING_PAYMENT", "PAYMENT_EXPIRED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
const integer = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const dateSchema = z.iso.date();
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.");
const localSchema = z.string().refine(value => value === "" || z.iso.datetime({ local: true }).safeParse(value.length === 16 ? `${value}:00` : value).success, "Use a valid local date and time.");
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(4000),
  contact_email: z.union([z.literal(""), z.email().max(254)]), contact_phone: z.string().trim().max(40).regex(/^[+\d ()-]*$/), address: z.string().trim().max(1000),
  timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Use an IANA timezone, such as Asia/Manila."),
  currency: z.string().refine(value => Intl.supportedValuesOf("currency").includes(value), "Use a supported ISO currency code."),
  scheduling_interval_minutes: integer(5,120), default_buffer_minutes: integer(0,240),
  minimum_notice_minutes: integer(0,1051200), maximum_advance_days: integer(1,730), payment_window_minutes: integer(1,1440),
  require_staff_approval: z.literal(true), guest_booking_enabled: z.boolean(), customer_registration_enabled: z.boolean(),
  terms: z.string().trim().min(1).max(10000), refund_policy: z.string().trim().min(1).max(10000), expected_updated_at: z.string().max(100),
}).refine(v => v.minimum_notice_minutes < v.maximum_advance_days * 1440, { path: ["minimum_notice_minutes"], message: "Lead time must be shorter than the advance booking window." });

export const hoursSchema = z.array(z.object({ weekday: z.number().int().min(0).max(6), opens_at: timeSchema, closes_at: timeSchema })
  .refine(v => v.opens_at < v.closes_at, { message: "Closing time must be after opening time." })).max(28)
  .superRefine((rows, ctx) => {
    for (let i=0; i<rows.length; i++) for (let j=i+1; j<rows.length; j++) {
      const a=rows[i], b=rows[j];
      if (a.weekday===b.weekday && a.opens_at<b.closes_at && b.opens_at<a.closes_at) ctx.addIssue({ code: "custom", message: "Hours on the same weekday cannot overlap." });
    }
  });
export const closureSchema = z.object({ date: dateSchema, full_day: z.boolean(), start: z.string(), end: z.string(), reason: z.string().trim().min(1).max(500) })
  .refine(v => v.full_day || (timeSchema.safeParse(v.start).success && timeSchema.safeParse(v.end).success && v.start<v.end), { path: ["end"], message: "A partial closure needs valid opening and ending times, with the end after the start." });
export const announcementSchema = z.object({ id: z.union([z.literal(""),z.uuid()]), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000), published: z.boolean(), start: localSchema, end: localSchema })
  .refine(v => !v.start || !v.end || v.start<v.end, { path: ["end"], message: "Display end must be after display start." });
export const filtersSchema = z.object({ q: z.string().trim().max(100).default(""), status: z.union([z.literal(""),z.enum(appointmentStates)]).default(""), date: z.union([z.literal(""),dateSchema]).default(""), page: integer(1,10000).default(1) });
