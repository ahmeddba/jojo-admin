import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type N8nOrderRequest = {
  order_id: string;
  business_unit: "restaurant" | "coffee";
  items: Array<{
    item_type: "menu" | "deal";
    item_id: string;
    name_snapshot: string;
    qty: number;
    unit_price_tnd: number;
    line_total_tnd: number;
  }>;
  total_tnd: number;
  table_number: string;
  notes?: string | null;
};

function inferExternalRef(value: unknown, fallback: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const raw = record.external_ref ?? record.reference ?? record.id ?? record.executionId;
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
    if (typeof raw === "number") {
      return String(raw);
    }
  }
  return fallback;
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.N8N_ORDERS_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { ok: false, error: "N8N_ORDERS_WEBHOOK_URL is not configured" },
      { status: 500 }
    );
  }

  let body: N8nOrderRequest;
  try {
    body = (await req.json()) as N8nOrderRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.order_id ||
    !body.business_unit ||
    !Array.isArray(body.items) ||
    typeof body.table_number !== "string" ||
    body.table_number.trim().length === 0
  ) {
    return NextResponse.json(
      { ok: false, error: "order_id, business_unit, table_number and items are required" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        source: "jojo-admin",
        triggered_by_user_id: user.id,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: unknown = null;

    if (rawText.trim()) {
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        parsed = { raw: rawText };
      }
    }

    if (!response.ok) {
      const errorMessage =
        parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).error === "string"
          ? ((parsed as Record<string, unknown>).error as string)
          : `n8n webhook failed with ${response.status}`;

      return NextResponse.json(
        {
          ok: false,
          error: errorMessage,
          status: response.status,
        },
        { status: 502 }
      );
    }

    const externalRef = inferExternalRef(parsed, `n8n-${Date.now()}`);

    return NextResponse.json({
      ok: true,
      external_ref: externalRef,
      response: parsed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown n8n request error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
