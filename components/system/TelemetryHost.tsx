"use client";

import { useEffect } from "react";
import { installErrorCapture } from "@/lib/telemetry";

export default function TelemetryHost() {
  useEffect(() => {
    installErrorCapture();
  }, []);
  return null;
}
