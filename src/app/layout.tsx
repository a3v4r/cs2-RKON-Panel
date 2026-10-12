import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 RCON Panel",
  description: "Modern RCON management for Counter-Strike 2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-[#09090b] text-foreground antialiased overflow-hidden font-sans">
        {children}
      </body>
    </html>
  );
}
