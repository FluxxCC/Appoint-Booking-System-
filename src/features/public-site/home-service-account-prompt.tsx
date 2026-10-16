"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { signOutToCustomerAccountAction } from "./booking-actions";

type Props = {
  open: boolean;
  customerSession: boolean;
  registrationEnabled: boolean;
  next: string;
  supportsBusinessLocation: boolean;
  onClose: () => void;
};

export function HomeServiceAccountPrompt({
  open,
  customerSession,
  registrationEnabled,
  next,
  supportsBusinessLocation,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controlledOpenRef = useRef(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      controlledOpenRef.current = true;
      dialog.showModal();
    } else if (!open && dialog.open) {
      controlledOpenRef.current = false;
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    if (!controlledOpenRef.current) return;
    controlledOpenRef.current = false;
    onClose();
  }

  const destinationFields = (destination: "login" | "register") => (
    <>
      <input type="hidden" name="destination" value={destination} />
      <input type="hidden" name="next" value={next} />
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="home-service-account-title"
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClose={handleClose}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/50"
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Home Service</p>
            <h2 id="home-service-account-title" className="display-type mt-2 text-2xl">
              {customerSession ? "Use a customer account to book at home" : "Create an account to book at home"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close account prompt"
            onClick={handleClose}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-xl"
          >
            ×
          </button>
        </div>

        {customerSession ? (
          <p className="mt-3 text-sm leading-6 text-muted">
            You’re signed in to a business workspace. Home Service bookings need a customer-only account. Sign out to create or sign in to that account; your branch and service selection will be saved.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted">
            A customer account is required for Home Service. Create an account or sign in to enter your destination and share the map pin with our team. Your branch and service selection will be saved.
          </p>
        )}

        <div className="mt-6 grid gap-3">
          {customerSession ? (
            <>
              {registrationEnabled ? (
                <form action={signOutToCustomerAccountAction}>
                  {destinationFields("register")}
                  <button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-5 font-semibold text-white hover:bg-accent-dark">
                    Sign out and create account
                  </button>
                </form>
              ) : (
                <p className="rounded-xl bg-warning-soft p-4 text-sm text-ink">
                  Customer registration is currently unavailable. Sign in with a customer account to continue.
                </p>
              )}
              <form action={signOutToCustomerAccountAction}>
                {destinationFields("login")}
                <button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line px-5 font-semibold">
                  Sign out and sign in as a customer
                </button>
              </form>
            </>
          ) : (
            <>
              {registrationEnabled ? (
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-5 font-semibold text-white hover:bg-accent-dark"
                  href={`/register?next=${encodeURIComponent(next)}`}
                >
                  Create Account
                </Link>
              ) : (
                <p className="rounded-xl bg-warning-soft p-4 text-sm text-ink">
                  Customer registration is currently unavailable. Please sign in to continue.
                </p>
              )}
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-5 font-semibold"
                href={`/login?next=${encodeURIComponent(next)}`}
              >
                Sign In
              </Link>
            </>
          )}

          <button type="button" onClick={handleClose} className="min-h-11 font-semibold text-accent-dark underline">
            {supportsBusinessLocation ? "Visit the business instead" : "Choose a different service"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
