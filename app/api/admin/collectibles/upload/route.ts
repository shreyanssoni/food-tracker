import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const { data: me } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (process.env.NODE_ENV !== 'development' && !me?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    const name = (form.get('name') as string) || undefined; // optional override filename
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bucket = process.env.BUCKET_COLLECTIBLES || 'nourish_collectibles_images';
    const admin = createAdminClient();

    const ext = file.name.split('.').pop() || 'bin';
    const base = (name || file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ts = Date.now();
    const path = `admin/${ts}-${base}`;

    const arrayBuffer = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';

    const { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, Buffer.from(arrayBuffer), {
        upsert: true,
        contentType,
      });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: pub.publicUrl, path });
  } catch (e) {
    console.error('collectibles upload error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
