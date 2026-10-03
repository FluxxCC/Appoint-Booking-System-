import { z } from "zod";

export const requestAppointmentSchema = z.object({
  customerId: z.uuid(), staffId: z.uuid(), serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }), requestKey: z.uuid(),
});
export const appointmentIdSchema = z.uuid();
export const declineSchema = z.object({ appointmentId: z.uuid(), reason: z.string().trim().min(1).max(1000) });
