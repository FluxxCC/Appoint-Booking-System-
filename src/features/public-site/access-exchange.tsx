"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LinkStatus = "checking" | "ready" | "opening" | "used" | "expired" | "invalid" | "authorized" | "unavailable";
type Inspection = { status: LinkStatus; appointmentId?: string };

const messages: Record<LinkStatus, string> = {
  checking: "Checking your private link…",
  ready: "Your private link is ready. Select Continue to booking to open it.",
  opening: "Opening your private booking…",
  used: "This one-time link has already been used in another browser. Request a new secure link to continue.",
  expired: "This one-time link has expired. Request a new secure link to continue.",
  invalid: "This private link is invalid. Request a new secure link to continue.",
  authorized: "This browser already has access to your booking.",
  unavailable: "Private access is temporarily unavailable. Please try again.",
};

async function accessRequest(path: string, token: string): Promise<Inspection> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }), cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer" });
  const result: unknown = await response.json().catch(() => null);
  if (response.ok && result && typeof result === "object" && "appointmentId" in result && typeof result.appointmentId === "string")
    return { status: "authorized", appointmentId: result.appointmentId };
  if (result && typeof result === "object" && "status" in result && typeof result.status === "string")
    return result as Inspection;
  return { status: "unavailable" };
}

export function AccessExchange() {
  const token = useRef<string | null>(null);
  const started = useRef(false);
  const [status, setStatus] = useState<LinkStatus>("checking");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const current = new URL(window.location.href);
    token.current = current.searchParams.get("token") ?? new URLSearchParams(current.hash.slice(1)).get("token");
    // Remove current query links and older fragment links before further navigation.
    window.history.replaceState(null, "", current.pathname);
    if (!token.current) { queueMicrotask(() => setStatus("invalid")); return; }
    accessRequest("/api/booking/access/inspect", token.current)
      .then(result => { setStatus(result.status); setAppointmentId(result.appointmentId ?? null); })
      .catch(() => setStatus("unavailable"));
  }, []);

  async function retryCheck() {
    if (!token.current) return;
    setStatus("checking");
    try {
      const result = await accessRequest("/api/booking/access/inspect", token.current);
      setStatus(result.status);
      setAppointmentId(result.appointmentId ?? null);
    } catch { setStatus("unavailable"); }
  }

  async function continueToBooking() {
    if (!token.current || status !== "ready") return;
    setStatus("opening");
    try {
      const result = await accessRequest("/api/booking/access", token.current);
      if (result.status === "authorized" && result.appointmentId) {
        window.location.replace(`/booking/manage?id=${encodeURIComponent(result.appointmentId)}`);
        return;
      }
      setStatus(result.status);
      setAppointmentId(result.appointmentId ?? null);
    } catch { setStatus("unavailable"); }
  }

  return <main className="mx-auto max-w-xl px-5 py-20"><h1 className="display-type text-4xl">Open private booking</h1>
    <p role="status" className="mt-5 text-muted">{messages[status]}</p>
    {status === "ready" && <button type="button" onClick={continueToBooking} className="button-primary mt-6">Continue to booking</button>}
    {status === "authorized" && appointmentId && <Link href={`/booking/manage?id=${encodeURIComponent(appointmentId)}`} className="button-primary mt-6 inline-block">View booking</Link>}
    {status === "unavailable" && <button type="button" onClick={retryCheck} className="button-primary mt-6">Try again</button>}
    <div><Link href="/booking/manage" className="mt-6 inline-block font-semibold text-accent-dark underline">Send me a new secure link</Link></div>
  </main>;
}
