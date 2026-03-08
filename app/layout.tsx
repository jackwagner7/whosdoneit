import type { Metadata } from "next";
import "./globals.css";
import "./pages.css";
import "./pickers.css";

export const metadata: Metadata = {
  title: "Who's Done It!",
  description: "A whacky detective party game of confessions and guesses.",
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
