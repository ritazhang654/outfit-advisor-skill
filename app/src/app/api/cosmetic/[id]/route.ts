import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { storage, signedUrl } from '@/lib/storage';
import { Cosmetic } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

const CATEGORY_KEYS = ['skincare', 'makeup', 'perfume', 'other'];
const SPEC_KEYS = ['full', 'mid', 'sample'];

// 编辑化妆品
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (body.category !== undefined) {
      const category = String(body.category ?? '');
      if (!CATEGORY_KEYS.includes(category)) return NextResponse.json({ error: '类别无效' }, { status: 400 });
      updates.category = category;
    }
    if (body.spec_type !== undefined) {
      const spec = String(body.spec_type ?? 'full');
      if (!SPEC_KEYS.includes(spec)) return NextResponse.json({ error: '规格无效' }, { status: 400 });
      updates.spec_type = spec;
    }
    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, 100);
      if (!name) return NextResponse.json({ error: '名称不能为空' }, { status: 400 });
      updates.name = name;
    }
    if (body.brand !== undefined) {
      updates.brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim().slice(0, 50) : null;
    }
    if (typeof body.subcategory === 'string' && body.subcategory.trim()) {
      updates.subcategory = body.subcategory.trim().slice(0, 20);
    } else if (body.subcategory === null) {
      updates.subcategory = null;
    }
    if (body.size !== undefined) {
      updates.size = typeof body.size === 'string' && body.size.trim() ? body.size.trim().slice(0, 30) : null;
    }
    if (body.shade !== undefined) {
      updates.shade = typeof body.shade === 'string' && body.shade.trim() ? body.shade.trim().slice(0, 50) : null;
    }
    if (body.opened_at !== undefined) {
      updates.opened_at = typeof body.opened_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.opened_at) ? body.opened_at : null;
    }
    if (body.expiry_date !== undefined) {
      updates.expiry_date = typeof body.expiry_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.expiry_date) ? body.expiry_date : null;
    }
    if (body.shelf_months !== undefined) {
      const months = Number(body.shelf_months);
      updates.shelf_months = Number.isInteger(months) && months >= 1 && months <= 60 ? months : 12;
    }
    if (body.quantity !== undefined) {
      const qty = Number(body.quantity);
      updates.quantity = Number.isInteger(qty) && qty >= 1 && qty <= 999 ? qty : 1;
    }
    if (body.status !== undefined) {
      const status = String(body.status ?? 'in_use');
      if (!['stock', 'in_use', 'done'].includes(status)) return NextResponse.json({ error: '状态无效' }, { status: 400 });
      updates.status = status;
    }
    if (body.notes !== undefined) {
      updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 200) : null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('cosmetics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: '化妆品不存在或更新失败' }, { status: 404 });

    const item = data as Cosmetic;
    return NextResponse.json({
      item: { ...item, image_url: item.image_key ? await signedUrl(item.image_key).catch(() => '') : '' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除化妆品
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const client = await getSupabaseClient();
    const { data, error } = await client.from('cosmetics').delete().eq('id', id).select('image_key').single();
    if (error || !data) return NextResponse.json({ error: '化妆品不存在' }, { status: 404 });

    const imageKey = (data as { image_key: string | null }).image_key;
    if (imageKey) {
      await storage.deleteFile({ fileKey: imageKey }).catch((e) => {
        console.error('删除化妆品图片失败:', e);
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
