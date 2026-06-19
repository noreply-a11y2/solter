import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KonsoleH Email Verifier",
  description: "Verify email addresses and detect konsoleH.co.za / xneelo hosting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
