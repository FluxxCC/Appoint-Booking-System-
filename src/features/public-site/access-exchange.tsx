"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AccessExchange() {
  const [status, setStatus] = useState("Opening your private booking…");
  const started = useRef(false);
  useEffect(() => {
    // React development Strict Mode replays effects. A one-time credential must
    // never be exchanged twice by the same page mount.
    if (started.current) return;
    started.current = true;
    const fragment = window.location.hash;
    window.history.replaceState(null, "", window.location.pathname);
    const token = new URLSearchParams(fragment.slice(1)).get("token");
    if (!token) { queueMicrotask(() => setStatus("This link is invalid or expired. Request a new private link.")); return; }
    fetch("/api/booking/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store", referrerPolicy: "no-referrer" })
      .then(async response => {
        if (!response.ok) throw new Error("Access denied");
        return response.json() as Promise<{ appointmentId: string }>;
      })
      .then(result => { window.location.replace(`/booking/manage?id=${encodeURIComponent(result.appointmentId)}`); })
      .catch(() => { setStatus("This link is invalid or expired. Request a new private link."); });
  }, []);
  return <main className="mx-auto max-w-xl px-5 py-20"><h1 className="display-type text-4xl">Open private booking</h1><p role="status" className="mt-5 text-muted">{status}</p><Link href="/booking/manage" className="mt-6 inline-block font-semibold text-accent-dark underline">Request a new link</Link></main>;
}
