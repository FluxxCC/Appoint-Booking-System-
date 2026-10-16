import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Usteng Barber Shop",
  description: "Book your next appointment at Usteng Barber Shop.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
