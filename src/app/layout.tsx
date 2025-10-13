// src/app/layout.tsx

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ankara Adliyesi Duyuru Takip Sistemi",
  description: "Ankara Adliyesi web sitesindeki duyuruları takip edin.",
  // Diğer metadata ayarları buraya gelebilir
};

// KRİTİK DÜZELTME: Viewport artık ayrı bir export
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={inter.className}>{children}</body>
    </html>
  );
}