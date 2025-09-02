import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUser } from "@/utils/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("shadow_messages")
      .select("id,type,text,expiry,created_at")
      .eq("user_id", user.id)
      .gt("expiry", nowIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;

    const message = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return NextResponse.json({ message });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
