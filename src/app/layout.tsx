import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// next/font self-hosts at build time: no internet needed at runtime
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Matchdesk",
  description: "Modern RCON management for Counter-Strike 2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`dark ${inter.variable}`}>
      <body className="bg-background text-foreground antialiased overflow-hidden font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
