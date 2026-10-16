import type { Metadata } from "next";
import "./globals.css";

const socialImage = "https://usteng.zentra.surf/images/usteng-social-share.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://usteng.zentra.surf"),
  title: "Usteng Barber Shop",
  description: "Book your next appointment at Usteng Barber Shop.",
  openGraph: {
    type: "website",
    locale: "en_PH",
    siteName: "Usteng Barber Shop",
    title: "Usteng Barber Shop",
    description: "Book your next appointment at Usteng Barber Shop.",
    images: [{ url: socialImage, secureUrl: socialImage, type: "image/png", width: 1200, height: 630, alt: "Usteng Barber Shop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Usteng Barber Shop",
    description: "Book your next appointment at Usteng Barber Shop.",
    images: [{ url: socialImage, secureUrl: socialImage, type: "image/png", width: 1200, height: 630, alt: "Usteng Barber Shop" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
