import { NextResponse } from "next/server";
import { buildBarTenderZip, zipFileName } from "@/lib/bartender-pack";
import {
  buildOrderLabel,
  DEFAULT_APP_URL,
  labelToCsv,
} from "@/lib/labels";
import { requireApiUser } from "@/lib/supabase/api-auth";
import type { Order, Unit } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const body = await req.json();  const { order, units, appUrl, arrivedAt } = body as {
    order: Order;
    units: Unit[];
    appUrl?: string;
    arrivedAt?: string | null;
  };

  const baseUrl =
    appUrl || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;

  const label = await buildOrderLabel({
    order,
    units,
    appUrl: baseUrl,
    arrivedAt: arrivedAt ?? null,
  });

  const csv = labelToCsv(label);
  const zip = await buildBarTenderZip(csv, label);
  const filename = zipFileName(order.orderCode, order.id);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
