import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "WP ChatGPT Publisher",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
