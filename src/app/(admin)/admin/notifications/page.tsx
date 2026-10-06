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

function deliveryTone(row: DeliveryRow) {
  if (row.last_error === "superseded") return "bg-canvas text-muted";
  if (row.state === "DELIVERED") return "bg-success-soft text-success";
  if (row.state === "FAILED") return "bg-danger-soft text-danger";
  if (row.state === "PROCESSING") return "bg-info-soft text-info";
  return "bg-warning-soft text-warning";
}

export default async function NotificationDeliveryPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owner_notification_outbox_context", { p_limit: 100 });
  if (error) throw new Error("Email delivery status is temporarily unavailable.");
  const rows = (data ?? []) as DeliveryRow[];
  const summaries = [
    { label: "Sent", count: rows.filter(row => row.state === "DELIVERED" && row.last_error !== "superseded").length, tone: "text-success" },
    { label: "Queued or retrying", count: rows.filter(row => row.state === "PENDING" && row.last_error !== "superseded").length, tone: "text-warning" },
    { label: "Processing", count: rows.filter(row => row.state === "PROCESSING").length, tone: "text-info" },
    { label: "Failed", count: rows.filter(row => row.state === "FAILED" && row.last_error !== "superseded").length, tone: "text-danger" },
  ];
  return <>
    <PageHeading title="Email delivery" description="Track recent transactional email delivery and retries. Provider acceptance does not confirm inbox delivery." />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaries.map(summary => <section key={summary.label} className="surface-card p-4 sm:p-5"><p className="text-sm font-medium text-muted">{summary.label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${summary.tone}`}>{summary.count}</p></section>)}</div>
    <Card title="Recent notifications">
      <p className="mb-5 text-sm text-muted">Showing the {rows.length} most recent notifications (maximum 100). Expand a row for retry timing, provider acceptance and delivery details.</p>
      {!rows.length ? <Empty>No transactional notifications have been queued.</Empty> :
        <Table headers={["Notification / booking", "Delivery status", "Queued", "Details"]}>
          {rows.map(row => {
            const sent = receipts(row.provider_receipts);
            return <tr key={row.id}>
              <td><span className="font-medium">{notificationLabel(row)}</span><p className="mt-1 text-xs text-muted">{row.public_reference ?? "—"}</p></td>
              <td><span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ${deliveryTone(row)}`}>{deliveryLabel(row)}</span></td>
              <td><p className="whitespace-nowrap">{time(row.created_at)}</p><p className="mt-1 text-xs text-muted">{row.attempts} attempt{row.attempts === 1 ? "" : "s"}</p></td>
              <td><details className="max-w-md text-sm"><summary className="cursor-pointer font-medium text-accent-dark">View details</summary><dl className="mt-3 grid gap-x-5 gap-y-3 rounded-xl bg-canvas p-4 text-xs sm:grid-cols-2"><div><dt className="font-medium text-ink">Appointment</dt><dd className="mt-1">{row.appointment_state ? <Status value={row.appointment_state}/> : "—"}</dd></div><div><dt className="font-medium text-ink">Last attempt</dt><dd className="mt-1 text-muted">{time(row.last_attempt_at)}</dd></div><div><dt className="font-medium text-ink">Next retry</dt><dd className="mt-1 text-muted">{row.state === "PENDING" ? time(row.available_at) : "—"}</dd></div><div><dt className="font-medium text-ink">Processing lease</dt><dd className="mt-1 text-muted">{time(row.locked_until)}</dd></div><div className="sm:col-span-2"><dt className="font-medium text-ink">Failure or skip reason</dt><dd className="mt-1 break-words text-muted">{row.last_error ?? "—"}</dd></div><div className="sm:col-span-2"><dt className="font-medium text-ink">Provider acceptance</dt><dd className="mt-1 space-y-2 text-muted">{sent.length ? sent.map(receipt => <p key={`${receipt.role}:${receipt.message_id}`}><span className="font-medium text-ink">{receipt.role}</span><br/><code className="break-all">{receipt.message_id}</code><br/>Accepted {time(receipt.accepted_at)}</p>) : "No provider acceptance recorded"}</dd></div></dl></details></td>
            </tr>;
          })}
        </Table>}
    </Card>
  </>;
}
