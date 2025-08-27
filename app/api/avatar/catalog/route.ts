import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/utils/auth";

// Lists available avatar assets from the Supabase Storage bucket 'avatars'.
// Option B layout: avatars/stage1/{appearance_key}.ext only for onboarding.
export async function GET() {
  try {
    const user = await requireUser(); // gate by auth
    const supabase = createAdminClient();

    const exts = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

    // Determine user's exact stage folder from their current level
    const { data: progressRow, error: progressErr } = await supabase
      .from('user_progress')
      .select('level')
      .eq('user_id', user.id)
      .maybeSingle();
    if (progressErr) throw progressErr;
    const lvl = progressRow?.level ?? 1;
    const path = `stage${lvl}`;
    let offset = 0;
    const pageSize = 100;
    const files: any[] = [];
    while (true) {
      const { data, error } = await supabase.storage
        .from("avatars")
        .list(path, { limit: pageSize, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        const name = item?.name;
        if (!name || name === ".emptyFolderPlaceholder") continue;
        const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
        const isFileByExt = exts.includes(ext);
        const isFileByMeta = !!(item as any)?.metadata && typeof (item as any).metadata.size === "number";
        if (!(isFileByExt || isFileByMeta)) continue;
        const fullPath = `${path}/${name}`; // e.g., stage1/knight_01.png
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(fullPath);
        files.push({ path: fullPath, url: pub.publicUrl, type: ext === "gif" ? "gif" : "image" });
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return NextResponse.json({ assets: files });
  } catch (err: any) {
    const status = err?.name === "AuthenticationError" ? 401 : 500;
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status }
    );
  }
}
