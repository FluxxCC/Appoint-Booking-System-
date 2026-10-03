"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function MfaPanel({ nextPath = "/admin" }: { nextPath?: string }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string>();
  const [qr, setQr] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [needsEnrollment, setNeedsEnrollment] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await createClient().auth.mfa.listFactors();
        if (error) throw error;
        if (!active) return;
        const factor = data.totp.find(item => item.status === "verified");
        setFactorId(factor?.id);
        setNeedsEnrollment(!factor);
      } catch { if (active) setError("Unable to load authenticator settings. Refresh and try again."); }
      finally { if (active) setPending(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function enroll() {
    setPending(true); setError("");
    try {
      const client = createClient();
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      for (const factor of factors.data.all.filter(item => item.factor_type === "totp" && item.status === "unverified")) {
        const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Business authenticator" });
      if (error) throw error;
      setFactorId(data.id);
      const qrCode = data.totp.qr_code;
      const svg = qrCode.startsWith("data:image/svg+xml")
        ? qrCode.slice(qrCode.indexOf(",") + 1)
        : qrCode;
      setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`);
      setSecret(data.totp.secret); setNeedsEnrollment(false);
    } catch { setError("Unable to start authenticator setup. Please try again."); }
    finally { setPending(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) { setError("Enter the six-digit code from your authenticator."); return; }
    setPending(true); setError("");
    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      // New request checks verified JWT assurance and current DB roles again.
      router.replace(nextPath);
      router.refresh();
    } catch { setError("The code could not be verified. Check the current code and try again."); setPending(false); }
  }

  return <div className="space-y-5" aria-busy={pending}>
    {pending && !factorId && <p role="status" className="text-sm text-muted">Loading authenticator settings…</p>}
    {needsEnrollment && <button disabled={pending} onClick={enroll} className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-60">Set up authenticator</button>}
    {qr && <div className="space-y-3"><p className="text-sm text-muted">Scan this QR code in your authenticator app, then enter its code.</p><Image src={qr} alt="Authenticator setup QR code" width={220} height={220} unoptimized /><details className="text-sm"><summary>Enter the setup key manually</summary><code className="mt-2 block break-all rounded bg-canvas p-3">{secret}</code></details></div>}
    {factorId && <form onSubmit={verify} className="space-y-4"><label htmlFor="mfa-code" className="block text-sm font-medium">Authenticator code</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required className="w-full rounded-lg border border-line px-3 py-3 text-lg tracking-widest" /><button disabled={pending} className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-60">{pending ? "Verifying…" : "Verify and continue"}</button></form>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
