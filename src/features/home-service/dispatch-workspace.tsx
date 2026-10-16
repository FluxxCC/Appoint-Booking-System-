"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { directionsUrl } from "@/lib/maps";
import type { HomeServiceAppointment } from "./data.server";
import { GetDirections } from "./routing";

const DispatchMap = dynamic(() => import("./dispatch-map"), { ssr: false,
  loading: () => <div className="grid h-[55vh] min-h-80 place-items-center bg-canvas text-muted lg:h-[680px]">Loading dispatch map…</div> });
type Trip = { appointment_id: string; staff_id: string; latitude: number; longitude: number; updated_at: string; expires_at: string };

export function DispatchWorkspace({ appointments, area, branchId }: { appointments: HomeServiceAppointment[]; area: "admin" | "staff"; branchId: string | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(appointments[0]?.id ?? null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const watch = useRef<number | null>(null);
  const sharingAppointment = useRef<string | null>(null);
  const lastSent = useRef(0);
  const client = useMemo(() => createClient(), []);
  const selected = appointments.find(item => item.id === selectedId) ?? appointments[0];
  const point = selected?.latitude != null && selected.longitude != null ? { latitude: Number(selected.latitude), longitude: Number(selected.longitude) } : null;
  const selectedTrip = trips.find(item => item.appointment_id === selected?.id);
  const destinations = useMemo(() => appointments.flatMap(item => item.latitude != null && item.longitude != null
    ? [{ id: item.id, label: `${item.customer_name} · ${item.public_reference}`, latitude: Number(item.latitude), longitude: Number(item.longitude) }] : []), [appointments]);

  const refreshTrips = useCallback(async () => {
    const { data, error } = await client.rpc("home_service_trip_snapshot", { p_area: area, p_branch_id: branchId });
    if (!error && Array.isArray(data)) setTrips(data as Trip[]);
  }, [client, area, branchId]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refreshTrips(); }, 0);
    const channel = client.channel("app:changes", { config: { private: true } })
      .on("broadcast", { event: "refresh" }, () => { void refreshTrips(); }).subscribe();
    const timer = window.setInterval(() => { void refreshTrips(); }, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); void client.removeChannel(channel); };
  }, [client, refreshTrips]);
  useEffect(() => () => { if (watch.current != null) navigator.geolocation?.clearWatch(watch.current); }, []);

  async function sendPoint(action: "START" | "UPDATE", coords: GeolocationCoordinates, appointmentId: string) {
    if (action === "UPDATE" && Date.now() - lastSent.current < 5000) return;
    lastSent.current = Date.now();
    const { error } = await client.rpc("home_service_trip_control", { p_appointment: appointmentId,
      p_action: action, p_latitude: coords.latitude, p_longitude: coords.longitude });
    if (error) {
      setMessage(error.message || "Location sharing stopped. Check your assignment and appointment status.");
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null; setSharing(false);
      return;
    }
    setSharing(true); setMessage("Sharing your location while this page remains open.");
    void refreshTrips();
  }

  function startTrip() {
    if (!selected || !navigator.geolocation) { setMessage("Location is unavailable in this browser."); return; }
    if (watch.current != null) return;
    if (!window.confirm("Share your current location with authorized managers during this Home Service trip? Sharing stops when you end the trip, the appointment ends, or this browser stops updating.")) return;
    setMessage("Requesting device location permission…");
    const appointmentId = selected.id;
    sharingAppointment.current = appointmentId;
    let first = true;
    watch.current = navigator.geolocation.watchPosition(position => {
      void sendPoint(first ? "START" : "UPDATE", position.coords, appointmentId);
      first = false;
    }, error => {
      setMessage(error.code === 1 ? "Location permission was denied. Sharing has not started." : "Location is unavailable. Check device location settings and retry.");
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null; setSharing(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  async function stopTrip() {
    const appointmentId = sharingAppointment.current ?? selected?.id;
    if (!appointmentId) return;
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; setSharing(false);
    const { error } = await client.rpc("home_service_trip_control", { p_appointment: appointmentId, p_action: "STOP" });
    if (!error) sharingAppointment.current = null;
    setMessage(error ? "Could not end sharing. Retry, or wait for the session to expire." : "Location sharing ended.");
    void refreshTrips();
  }

  return <div className="grid gap-4 lg:grid-cols-[minmax(300px,.7fr)_minmax(0,1.3fr)]">
    <aside className="order-2 min-w-0 lg:order-1"><details className="surface-card overflow-hidden" open>
      <summary className="cursor-pointer border-b border-line p-4 font-semibold">Appointments · {appointments.length}</summary>
      <div className="max-h-72 overflow-y-auto lg:max-h-[280px]">{appointments.map(item => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id}
        className={`block w-full border-b border-line p-4 text-left text-sm hover:bg-canvas ${selected?.id === item.id ? "bg-accent-soft/60" : ""}`}>
        <span className="block font-semibold">{item.customer_name} · {item.service_name}</span>
        <span className="mt-1 block text-muted">{item.branch_name} · {new Date(item.starts_at).toLocaleString(undefined, {timeZone:item.timezone,dateStyle:"medium",timeStyle:"short"})}</span>
        <span className="mt-1 block text-xs">{item.state.replaceAll("_", " ")} · {item.staff_name}{trips.some(trip => trip.appointment_id === item.id) ? " · Trip live" : ""}</span>
      </button>)}</div>
    </details>
    {selected && <article className="surface-card mt-4 p-5"><p className="eyebrow">{selected.branch_name} · {selected.public_reference}</p>
      <h2 className="display-type mt-2 text-2xl">{selected.customer_name}</h2>
      <p className="mt-2 text-sm text-muted">{selected.service_name} · {selected.state.replaceAll("_", " ")}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">Scheduled</dt><dd className="font-semibold">{new Date(selected.starts_at).toLocaleString(undefined,{timeZone:selected.timezone,dateStyle:"medium",timeStyle:"short"})}</dd></div><div><dt className="text-muted">Assigned staff</dt><dd className="font-semibold">{selected.staff_name}</dd></div>
        {area === "admin" && <><div><dt className="text-muted">Customer email</dt><dd className="break-all">{selected.customer_email || "—"}</dd></div><div><dt className="text-muted">Customer phone</dt><dd>{selected.customer_phone || "—"}</dd></div></>}</dl>
      <div className="mt-4 rounded-xl bg-canvas p-4 text-sm"><p className="font-semibold">Confirmed destination</p><p className="mt-1">{selected.address || "Available after acceptance"}</p>{selected.landmark && <p className="mt-2">Landmark: {selected.landmark}</p>}{selected.instructions && <p className="mt-2 whitespace-pre-wrap">{selected.instructions}</p>}</div>
      <p className="mt-3 text-sm text-muted">Trip: {selectedTrip ? `Live · last point ${new Date(selectedTrip.updated_at).toLocaleTimeString()}` : "Not sharing"}. Browsers may pause updates when closed or locked.</p>
      <div className="mt-4 flex flex-wrap gap-2">{point && <><a className="button-primary min-h-11" href={directionsUrl(point)} target="_blank" rel="noreferrer">Navigate to Customer</a><GetDirections destination={point}/></>}
        {area === "staff" && selected.state !== "PENDING" && (sharing || selectedTrip ? <button type="button" onClick={() => void stopTrip()} className="button-secondary min-h-11">Stop Sharing / End Trip</button> : <button type="button" onClick={startTrip} className="button-secondary min-h-11">Start Trip</button>)}
        {area === "admin" && <a className="button-secondary min-h-11" href={`/admin/appointments/${selected.id}`}>Open appointment</a>}</div>
      {message && <p role="status" className="mt-3 text-sm text-muted">{message}</p>}
    </article>}
    </aside>
    <section className="order-1 overflow-hidden rounded-2xl border border-line bg-canvas lg:order-2"><DispatchMap destinations={destinations} selectedId={selected?.id ?? null} trip={selectedTrip ? {latitude:Number(selectedTrip.latitude),longitude:Number(selectedTrip.longitude)} : null}/><p className="border-t border-line px-3 py-2 text-xs text-muted">Red pins show customer destinations. Blue marker shows the latest authorized staff point. Map data © OpenStreetMap contributors.</p></section>
  </div>;
}
