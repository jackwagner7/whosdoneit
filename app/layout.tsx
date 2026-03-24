import type { Metadata } from "next";
import "./globals.css";
import "./shell.css";
import "./whosdoneit.css";
import "./sayless.css";
import "./pickers.css";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
