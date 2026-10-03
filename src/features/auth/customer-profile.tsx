import { requireArea } from "@/lib/auth/access.server";
import { AuthForm } from "@/components/forms/auth-form";
import { saveCustomerProfileAction } from "./actions";

export async function CustomerProfile({ setup = false }: { setup?: boolean }) {
  const { supabase, principal } = await requireArea("account");
  const { data, error } = await supabase.from("customers").select("display_name,phone").eq("auth_user_id", principal.userId).maybeSingle();
  if (error) throw new Error("Unable to load profile");
  return <section className="max-w-2xl"><p className="eyebrow">Your account</p><h1 className="display-type mt-3 text-4xl">{setup ? "Complete your profile" : "Your profile"}</h1><p className="mt-3 text-sm leading-6 text-muted">Keep your details current so the team can reach you about a booking.</p><div className="surface-card mt-8 p-6 sm:p-8"><p className="mb-6 rounded-xl bg-canvas px-4 py-3 text-sm text-muted">Verified email <strong className="ml-2 font-semibold text-ink">{principal.email}</strong></p><AuthForm action={saveCustomerProfileAction} submitLabel="Save profile" fields={[
    { name: "fullName", label: "Full name", autoComplete: "name", value: data?.display_name ?? "", maxLength: 200 },
    { name: "phone", label: "Mobile number (optional)", type: "tel", autoComplete: "tel", value: data?.phone ?? "", required: false, maxLength: 25 },
  ]} /></div></section>;
}
