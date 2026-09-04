import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import VercelAnalytics from "./VercelAnalytics";
import TelemetryHost from "@/components/system/TelemetryHost";
import UpdateNotifier from "@/components/system/UpdateNotifier";
import PlanGate from "@/components/system/PlanGate";

export const metadata: Metadata = {
  title: "CTUBE — vídeo sem ruído",
  description: "Assista, descubra e organize seus vídeos com mais privacidade e controle.",
  generator: "CTUBE",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CTUBE",
  },
  openGraph: {
    title: "CTUBE",
    description: "Assista vídeos online de graça.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://i.ytimg.com" />
      </head>
      <body className="min-h-screen antialiased">
        <TelemetryHost />
        <ServiceWorkerRegister />
        {children}
        <VercelAnalytics />
        <UpdateNotifier />
        <PlanGate />
      </body>
    </html>
  );
}
