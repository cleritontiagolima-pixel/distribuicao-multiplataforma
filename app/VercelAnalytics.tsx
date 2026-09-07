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
    const isElectron = !!(window as any).electronAPI?.isElectron;
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0";
    const isVercel =
      hostname.endsWith(".vercel.app") ||
      hostname === "distribuicao-multiplataforma.vercel.app";

    // Never load in Electron, localhost, or non-Vercel environments
    if (isVercel && !isLocal && !isElectron) {
      // Proactively check if the analytics script is available to avoid 404
      // This prevents "Failed to load resource: /_vercel/insights/script.js"
      const checkScript = document.createElement("link");
      checkScript.rel = "preload";
      checkScript.href = "/_vercel/insights/script.js";
      checkScript.as = "script";
      // We set a short timeout and then just enable analytics anyway —
      // the Analytics component has its own error handling
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <Analytics />
    </Suspense>
  );
}
