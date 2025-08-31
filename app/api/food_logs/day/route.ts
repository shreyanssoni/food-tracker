import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // yyyy-mm-dd (user's local day)
    const tz = searchParams.get("tz") || process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";
    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    // Compute UTC range for the provided local date in the provided timezone
    const wallToUtc = (dateStr: string, h: number, m: number, s: number, ms: number, timeZone: string) => {
      const y = Number(dateStr.slice(0, 4));
      const mo = Number(dateStr.slice(5, 7));
      const d = Number(dateStr.slice(8, 10));
      const baseUtc = Date.UTC(y, mo - 1, d, h, m, s, ms);
      const offsetMinutesAt = (at: Date) => {
        const dtf = new Intl.DateTimeFormat('en-US', {
          timeZone,
          hour12: false,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        const parts = dtf.formatToParts(at);
        const map: Record<string, string> = {};
        for (const p of parts) map[p.type] = p.value;
        const asUTC = Date.UTC(
          Number(map.year), Number(map.month) - 1, Number(map.day),
          Number(map.hour), Number(map.minute), Number(map.second)
        );
        // asUTC is the UTC ms when 'at' is represented in the target timezone.
        // The difference gives timezone offset in ms at that instant.
        const diffMs = asUTC - at.getTime();
        return diffMs / 60000;
      };
      const off1 = offsetMinutesAt(new Date(baseUtc));
      let utcMs = baseUtc - off1 * 60000;
      const off2 = offsetMinutesAt(new Date(utcMs));
      if (off2 !== off1) utcMs = baseUtc - off2 * 60000; // adjust across DST boundaries
      return new Date(utcMs);
    };

    const start = wallToUtc(date, 0, 0, 0, 0, tz);
    const end = wallToUtc(date, 23, 59, 59, 999, tz);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("food_logs")
      .select("*")
      .eq("user_id", session.user.id)
      .gte("eaten_at", start.toISOString())
      .lte("eaten_at", end.toISOString())
      .order("eaten_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data ?? [], meta: { tz, start: start.toISOString(), end: end.toISOString() } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
