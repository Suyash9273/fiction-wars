import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fiction Wars",
  description: "Real-time multiverse card battle",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
