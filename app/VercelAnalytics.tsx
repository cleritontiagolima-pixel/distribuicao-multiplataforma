"use client";

import { useEffect, useState, lazy, Suspense } from "react";

// Dynamically import Analytics to prevent module-level side effects
// that could load script.js in Electron or non-Vercel environments
const Analytics = lazy(() =>
  import("@vercel/analytics/next").then((mod) => ({
    default: mod.Analytics,
  }))
);

export default function VercelAnalytics() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only load analytics on actual Vercel deployment
    const hostname = window.location.hostname;
    const isElectron = !!(window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0";
    const isVercel =
      hostname.endsWith(".vercel.app") ||
      hostname === "distribuicao-multiplataforma.vercel.app";

    // Never load in Electron, localhost, or non-Vercel environments
    setShow(isVercel && !isLocal && !isElectron);
  }, []);

  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <Analytics />
    </Suspense>
  );
}
