import type { Metadata } from "next";
import { AccessExchange } from "@/features/public-site/access-exchange";

export const metadata: Metadata = { title: "Open private booking", robots: { index: false, follow: false } };
export default function BookingAccessPage() { return <AccessExchange />; }
