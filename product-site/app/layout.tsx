import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SentinelX — Paid Agents on Solana",
  description: "x402 + XMCP + TAP + Coral + Crossmint + Receipts TUI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
