import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://appointmentdemo.zentra.surf"),
  title: "Usteng Barber Shop",
  description: "Book your next appointment at Usteng Barber Shop.",
  openGraph: {
    type: "website",
    locale: "en_PH",
    siteName: "Usteng Barber Shop",
    title: "Usteng Barber Shop",
    description: "Book your next appointment at Usteng Barber Shop.",
    images: [{ url: "/images/usteng-social-share.png", width: 1200, height: 630, alt: "Usteng Barber Shop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Usteng Barber Shop",
    description: "Book your next appointment at Usteng Barber Shop.",
    images: [{ url: "/images/usteng-social-share.png", alt: "Usteng Barber Shop" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
