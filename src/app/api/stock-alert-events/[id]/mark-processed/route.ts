import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { StockAlertEvent } from "@/lib/database.types";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(_req: Request, context: RouteContext) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Event id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("stock_alert_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    event: data as StockAlertEvent,
  });
}
