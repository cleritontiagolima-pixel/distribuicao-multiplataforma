import { NextResponse } from "next/server";
import { APP_VERSION, OWNER_EMAIL } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public app configuration. The owner switches the app between free and paid
// by setting the CTUBE_PLAN env var on the hosting provider ("free" | "paid").
export async function GET() {
  const plan = process.env.CTUBE_PLAN === "paid" ? "paid" : "free";
  const purchaseUrl =
    process.env.CTUBE_PURCHASE_URL?.trim() || `mailto:${OWNER_EMAIL}?subject=CTUBE%20Premium%20(1%20ano)`;

  return NextResponse.json(
    {
      plan,
      appVersion: APP_VERSION,
      ownerEmail: OWNER_EMAIL,
      purchaseUrl,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
