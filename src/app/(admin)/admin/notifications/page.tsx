import { requireOwner } from "@/lib/auth/access.server";
import { Card, Empty, PageHeading, Status, Table } from "@/features/admin/ui";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";

type DeliveryRow = Database["public"]["Functions"]["owner_notification_outbox_context"]["Returns"][number];
type Receipt = { role: string; message_id: string; accepted_at: string };

function receipts(value: Json): Receipt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (item && typeof item === "object" && !Array.isArray(item) &&
        typeof item.role === "string" && typeof item.message_id === "string" && typeof item.accepted_at === "string") {
      return [{ role: item.role, message_id: item.message_id, accepted_at: item.accepted_at }];
    }
    return [];
  });
}

function time(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function notificationLabel(row: DeliveryRow) {
  if (row.kind === "PAYMENT_EXCEPTION") return "Payment exception";
  if (row.kind === "GUEST_ACCESS_REQUESTED") return "Guest access link";
  if (row.event_state === "PAYMENT_EXPIRED") return "Payment expired";
  if (row.event_state === "AWAITING_PAYMENT") return "Payment required";
  if (row.event_state === "PENDING") return "Booking request";
  if (row.event_state === "CONFIRMED") return "Booking confirmed";
  return row.event_state ? row.event_state.replaceAll("_", " ").toLowerCase() : row.kind.replaceAll("_", " ").toLowerCase();
}

function deliveryLabel(row: DeliveryRow) {
  if (row.last_error === "superseded") return "Skipped · lifecycle changed";
  if (row.state === "PROCESSING") return "Processing";
  if (row.state === "PENDING") return row.attempts ? "Retry scheduled" : "Queued";
  if (row.state === "DELIVERED") return "Sent";
  return "Failed";
}

export default async function NotificationDeliveryPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owner_notification_outbox_context", { p_limit: 100 });
  if (error) throw new Error("Email delivery status is temporarily unavailable.");
  const rows = (data ?? []) as DeliveryRow[];
  return <>
    <PageHeading title="Email delivery" description="Transactional email queue and provider acceptance status. Provider message IDs confirm acceptance by Resend, not inbox delivery." />
    <Card title="Recent notifications">
      {!rows.length ? <Empty>No transactional notifications have been queued.</Empty> :
        <Table headers={["Notification / booking", "Appointment", "Delivery", "Attempts", "Queued / last attempt", "Next retry / lease", "Failure", "Provider acceptance"]}>
          {rows.map(row => {
            const sent = receipts(row.provider_receipts);
            return <tr key={row.id}>
              <td><span className="font-medium">{notificationLabel(row)}</span><p className="mt-1 text-xs text-muted">{row.public_reference ?? "—"}</p></td>
              <td>{row.appointment_state ? <Status value={row.appointment_state}/> : "—"}</td>
              <td>{deliveryLabel(row)}</td>
              <td>{row.attempts}</td>
              <td><p>{time(row.created_at)}</p><p className="mt-1 text-xs text-muted">Last: {time(row.last_attempt_at)}</p></td>
              <td><p>{row.state === "PENDING" ? time(row.available_at) : "—"}</p><p className="mt-1 text-xs text-muted">Lease: {row.locked_until ? time(row.locked_until) : "—"}</p></td>
              <td>{row.last_error ?? "—"}</td>
              <td>{sent.length ? sent.map(receipt => <p key={`${receipt.role}:${receipt.message_id}`} className="mb-2 last:mb-0"><span className="font-medium">{receipt.role}</span><br/><code className="break-all text-xs">{receipt.message_id}</code><br/><span className="text-xs text-muted">Accepted {time(receipt.accepted_at)}</span></p>) : "—"}</td>
            </tr>;
          })}
        </Table>}
    </Card>
  </>;
}
