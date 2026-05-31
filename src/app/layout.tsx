import type { Metadata } from "next";
import { ClientProviders } from "../providers/ClientProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arc Lending",
  description: "Lend and borrow on Arc Network",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fonts — Archivo Black (headings), Work Sans (body), Space Mono (numbers) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Work+Sans:wght@400;600&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
