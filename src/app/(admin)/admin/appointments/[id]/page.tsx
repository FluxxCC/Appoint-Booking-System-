import { AppointmentPage } from "@/features/admin/pages";
export default async function Page({ params }: { params: Promise<{id:string}> }) {
  return <AppointmentPage id={(await params).id} />;
}
