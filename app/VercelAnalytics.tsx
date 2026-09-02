"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";

export default function VercelAnalytics() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only load analytics on Vercel deployment, not in Electron or localhost
    const hostname = window.location.hostname;
    const isVercel =
      hostname.endsWith(".vercel.app") || hostname === "distribuicao-multiplataforma.vercel.app";
    const isLocal =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
    const isElectron = !!(window as any).electronAPI?.isElectron;

    setShow(isVercel && !isLocal && !isElectron);
  }, []);

  if (!show) return null;
  return <Analytics />;
}
