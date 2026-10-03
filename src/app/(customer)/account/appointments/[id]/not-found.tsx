import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";

export default function CustomerAppointmentNotFound() {
  return <main className="mx-auto max-w-2xl px-5 py-16"><div className="surface-card p-7 sm:p-10">
    <h1 className="display-type text-4xl">Appointment unavailable</h1>
    <p className="mt-4 leading-7 text-muted">This appointment is not available in your current account. Check that you signed in with the account used to book it.</p>
    <div className="mt-6 flex flex-wrap items-center gap-4"><Link href="/account/appointments" className="button-primary">My appointments</Link>
      <form action={logoutAction}><button type="submit" className="font-semibold text-accent-dark underline">Sign out and use another account</button></form></div>
  </div></main>;
}
