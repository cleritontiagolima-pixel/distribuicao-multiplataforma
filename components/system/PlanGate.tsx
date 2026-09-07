"use client";

// The old full-app paywall (PlanGate) was replaced by the LicenseModal:
// the app stays free, and the annual license only unlocks offline downloads.
// Kept as a re-export so any leftover import keeps working.
export { default } from "./LicenseModal";