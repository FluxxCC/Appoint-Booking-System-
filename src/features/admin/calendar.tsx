import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";
import { readAdmin, type SearchParams } from "./data.server";
import { dateSchema } from "./schemas";
import { label } from "./format";
import { PageHeading, Pagination, Status, Time, Empty } from "./ui";

type CalendarEntry = { id: string; starts_at: string; state: string; fulfillment_mode: "BUSINESS_LOCATION" | "HOME_SERVICE" };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function validMonth(value: unknown): value is string {
  return typeof value === "string" && /^(20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

function monthOffset(month: string, amount: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function dateInZone(instant: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dayOffset(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dayHref(date: string) {
  return `/admin/calendar?month=${date.slice(0, 7)}&date=${date}&view=day`;
}

export async function CalendarPage({ search }: { search: SearchParams }) {
  const dayView = search.view === "day";
  const requestedMonth = validMonth(search.month) ? search.month : undefined;
  const requestedDate = typeof search.date === "string" && dateSchema.safeParse(search.date).success ? search.date : undefined;
  const initialDate = requestedMonth && requestedDate?.slice(0, 7) !== requestedMonth ? `${requestedMonth}-01` : requestedDate ?? (requestedMonth ? `${requestedMonth}-01` : undefined);
  const { data, supabase } = await readAdmin("calendar", { date: initialDate, page: search.page });
  const date = data.date;
  const month = requestedMonth ?? date.slice(0, 7);
  const zone = data.business?.timezone ?? "UTC";
  const first = new Date(`${month}-01T12:00:00Z`);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const rangeStart = new Date(first);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(next);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  // Fetch only the columns needed by the month grid. RLS still applies to this signed-in admin client.
  const entries: CalendarEntry[] = [];
  if (!dayView) {
    for (let offset = 0; ; offset += 500) {
      const { data: batch, error } = await supabase.from("appointments")
        .select("id,starts_at,state,fulfillment_mode")
        .gte("starts_at", rangeStart.toISOString())
        .lt("starts_at", rangeEnd.toISOString())
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 499);
      if (error) throw new Error("Calendar appointments could not be loaded. Please try again.");
      entries.push(...(batch ?? []));
      if (!batch || batch.length < 500) break;
    }
  }

  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const localDay = dateInZone(entry.starts_at, zone);
    if (!localDay.startsWith(month)) continue;
    const dayEntries = byDay.get(localDay) ?? [];
    dayEntries.push(entry);
    byDay.set(localDay, dayEntries);
  }

  const gridStart = new Date(first);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const gridEnd = new Date(next);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (7 - gridEnd.getUTCDay()) % 7);
  const days: string[] = [];
  for (const cursor = new Date(gridStart); cursor < gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const selectedTitle = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const timeFormat = new Intl.DateTimeFormat("en", { timeZone: zone, hour: "numeric", minute: "2-digit" });

  return <>
    <PageHeading title="Calendar" description={dayView ? `Daily schedule · ${zone}. Move between dates or return to the month.` : `Monthly schedule · ${zone}. Select a date to open its appointments.`} />
    {dayView ? <section className="surface-card min-w-0 p-4 sm:p-6" aria-labelledby="calendar-day-title">
      <div className="mb-6 flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <BackButton href={`/admin/calendar?month=${month}`}>Back to month view</BackButton>
          <p className="eyebrow mt-5">Day agenda</p>
          <h2 id="calendar-day-title" className="display-type mt-2 text-2xl sm:text-3xl">{selectedTitle}</h2>
          <p className="mt-2 text-sm text-muted">{data.total ?? 0} appointment{data.total === 1 ? "" : "s"} · {zone}</p>
        </div>
        <nav aria-label="Calendar days" className="flex items-center gap-2">
          <Link href={dayHref(dayOffset(date, -1))} className="button-secondary min-h-10 w-10 px-0" aria-label="Previous day">←</Link>
          <Link href="/admin/calendar?view=day" className="button-secondary min-h-10 px-4">Today</Link>
          <Link href={dayHref(dayOffset(date, 1))} className="button-secondary min-h-10 w-10 px-0" aria-label="Next day">→</Link>
        </nav>
      </div>
      {data.appointments?.length ? <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">{data.appointments.map((appointment) => <li key={appointment.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
          <p className="shrink-0 text-sm font-semibold text-ink"><Time value={appointment.starts_at} zone={zone} /></p>
          <div className="min-w-0"><p className="font-semibold text-ink">{appointment.customer_name}</p><p className="mt-1 text-sm text-muted">{appointment.service_name} · {appointment.staff_name}</p>{appointment.fulfillment_mode==="HOME_SERVICE"&&<span className="mt-2 inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-dark">Home Service</span>}</div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end"><Status value={appointment.state}/><Link href={`/admin/appointments/${appointment.id}`} className="button-secondary min-h-10 px-4">View appointment</Link></div>
      </li>)}</ol> : <Empty>No appointments on this day. Choose another date or return to the month.</Empty>}
      {(data.total ?? 0) > 25 && <Pagination path="/admin/calendar" page={data.page} total={data.total ?? 0} query={{ month, date, view: "day" }} />}
    </section> : <section className="surface-card min-w-0 p-4 sm:p-6" aria-label={`${monthTitle} appointment calendar`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="eyebrow mb-1">Appointments by day</p><h2 className="text-2xl font-semibold tracking-tight text-ink">{monthTitle}</h2></div>
        <nav aria-label="Calendar months" className="flex w-full items-center justify-center gap-2 text-sm font-semibold sm:w-auto">
          <Link href={`/admin/calendar?month=${monthOffset(month, -1)}`} className="button-secondary min-h-10 px-3" aria-label="Previous month">←</Link>
          <Link href="/admin/calendar" className="button-secondary min-h-10 px-3">Today</Link>
          <Link href={`/admin/calendar?month=${monthOffset(month, 1)}`} className="button-secondary min-h-10 px-3" aria-label="Next month">→</Link>
        </nav>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={monthTitle}>
        {weekdays.map((weekday) => <div key={weekday} role="columnheader" className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted sm:text-xs">{weekday}</div>)}
        {days.map((day) => {
          const dayEntries = byDay.get(day) ?? [];
          const inMonth = day.startsWith(month);
          const selected = day === date && (requestedDate !== undefined || requestedMonth === undefined);
          const dayNumber = Number(day.slice(-2));
          return <div key={day} role="gridcell" aria-selected={selected}>
            <Link href={dayHref(day)} aria-label={`${day}: ${dayEntries.length} appointment${dayEntries.length === 1 ? "" : "s"}`}
              className={`flex min-h-[68px] min-w-0 flex-col rounded-lg border p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-28 sm:rounded-xl sm:p-2.5 ${selected ? "border-accent bg-accent-soft shadow-sm" : inMonth ? "border-line bg-white hover:border-accent/60 hover:bg-accent-soft/50" : "border-transparent bg-canvas/50 text-muted hover:bg-canvas"}`}>
              <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold sm:size-7 sm:text-sm ${selected ? "bg-accent text-white" : ""}`}>{dayNumber}</span>
              {dayEntries.length > 0 && <><span className="mt-1 hidden truncate text-[10px] font-semibold text-accent-dark sm:block sm:text-xs">{dayEntries.length} booking{dayEntries.length === 1 ? "" : "s"}</span>
                <span className="mt-1 grid size-5 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-dark sm:hidden">{dayEntries.length > 9 ? "9+" : dayEntries.length}</span>
                <span className="hidden space-y-0.5 sm:block">{dayEntries.slice(0, 2).map((entry) => <span key={entry.id} title={`${label(entry.state)}${entry.fulfillment_mode==="HOME_SERVICE"?" · Home Service":""}`} className="block truncate rounded-md bg-canvas px-1.5 py-0.5 text-[10px] text-ink">{timeFormat.format(new Date(entry.starts_at))}{entry.fulfillment_mode==="HOME_SERVICE"&&<span className="ml-1 font-semibold text-accent-dark">· Home</span>}</span>)}</span>
                {dayEntries.length > 2 && <span className="hidden text-[10px] text-muted sm:block">+{dayEntries.length - 2} more</span>}
              </>}
            </Link>
          </div>;
        })}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">Select a date to view its full agenda. Pending requests and expired payment windows do not reserve a time.</p>
    </section>}
  </>;
}
