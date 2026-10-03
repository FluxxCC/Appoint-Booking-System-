import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { registerAction } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export default async function RegisterPage() {
  const supabase=await createClient(),{data:enabled,error}=await supabase.rpc("registration_enabled");
  if(error||enabled!==true)return <AuthCard title="Account registration is unavailable" description="This business is not accepting new customer accounts right now. Existing customers can still sign in."><p className="text-sm text-muted"><Link href="/login" className="font-medium text-accent-dark">Sign in</Link> or <Link href="/book" className="font-medium text-accent-dark">book as a guest</Link>.</p></AuthCard>;
  return <AuthCard title="Create your account" description="Keep your appointments and payment history in one place.">
    <AuthForm action={registerAction} submitLabel="Create customer account" fields={[
      { name: "fullName", label: "Full name", autoComplete: "name", maxLength: 200 },
      { name: "email", label: "Email address", type: "email", autoComplete: "email", maxLength: 254 },
      { name: "phone", label: "Mobile number (optional)", type: "tel", autoComplete: "tel", required: false, maxLength: 25 },
      { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "Use at least 12 characters. A unique passphrase works well.", maxLength: 128 },
    ]} />
    <p className="mt-6 text-sm text-muted">Already registered? <Link href="/login" className="font-medium text-accent-dark">Sign in</Link></p>
    <div className="mt-6 border-t border-line pt-5 text-sm text-muted">An account saves your contact details and keeps your appointments in one place. You can also <Link href="/book" className="font-semibold text-accent-dark underline">book without an account</Link>.</div>
  </AuthCard>;
}
