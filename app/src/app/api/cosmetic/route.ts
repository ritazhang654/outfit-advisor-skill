import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { signedUrl } from '@/lib/storage';
import {
  Cosmetic,
  CosmeticCategory,
  COSMETIC_CATEGORY_ORDER,
  COSMETIC_SUBCATEGORIES,
} from '@/lib/types';

const CATEGORY_KEYS = COSMETIC_CATEGORY_ORDER;
const SPEC_KEYS = ['full', 'mid', 'sample'];
const STATUS_KEYS = ['stock', 'in_use', 'done'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function subcategoryKeys(category: string): string[] {
  return (COSMETIC_SUBCATEGORIES[category as CosmeticCategory] ?? []).map((s) => s.key);
}

// 校验并归一化请求体字段
function parsePayload(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name) return { error: '名称不能为空' };
    out.name = name;
  }
  if (body.brand !== undefined) {
    out.brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim().slice(0, 50) : null;
  }
  if (!partial || body.category !== undefined) {
    const category = String(body.category ?? '');
    if (!CATEGORY_KEYS.includes(category as CosmeticCategory)) return { error: '类别无效' };
    out.category = category;
  }
  if (body.subcategory !== undefined) {
    const sub = typeof body.subcategory === 'string' && body.subcategory.trim() ? body.subcategory.trim() : null;
    const category = String(out.category ?? body.category ?? '');
    if (sub && category && !subcategoryKeys(category).includes(sub)) return { error: '子类别与类别不匹配' };
    out.subcategory = sub;
  }
  if (!partial || body.spec_type !== undefined) {
    const spec = String(body.spec_type ?? 'full');
    if (!SPEC_KEYS.includes(spec)) return { error: '规格无效' };
    out.spec_type = spec;
  }
  if (body.size !== undefined) {
    out.size = typeof body.size === 'string' && body.size.trim() ? body.size.trim().slice(0, 30) : null;
  }
  if (body.shade !== undefined) {
    out.shade = typeof body.shade === 'string' && body.shade.trim() ? body.shade.trim().slice(0, 50) : null;
  }
  if (body.opened_at !== undefined) {
    const opened = typeof body.opened_at === 'string' && DATE_RE.test(body.opened_at) ? body.opened_at : null;
    out.opened_at = opened;
  }
  if (body.expiry_date !== undefined) {
    const expiry = typeof body.expiry_date === 'string' && DATE_RE.test(body.expiry_date) ? body.expiry_date : null;
    out.expiry_date = expiry;
  }
  if (body.shelf_months !== undefined) {
    const months = Number(body.shelf_months);
    out.shelf_months = Number.isInteger(months) && months >= 1 && months <= 60 ? months : 12;
  }
  if (body.quantity !== undefined) {
    const qty = Number(body.quantity);
    out.quantity = Number.isInteger(qty) && qty >= 1 && qty <= 999 ? qty : 1;
  }
  if (body.status !== undefined) {
    const status = String(body.status ?? 'in_use');
    if (!STATUS_KEYS.includes(status)) return { error: '状态无效' };
    out.status = status;
  }
  if (body.notes !== undefined) {
    out.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 200) : null;
  }
  return { data: out };
}

// 化妆品列表
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('cosmetics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(`读取化妆品失败: ${error.message}`);
    const list = (data ?? []) as Cosmetic[];
    const withUrl = await Promise.all(
      list.map(async (it) => ({
        ...it,
        image_url: it.image_key ? await signedUrl(it.image_key).catch(() => '') : '',
      }))
    );
    return NextResponse.json({ items: withUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 新增化妆品（image_key 来自 analyze 接口或为空）
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parsePayload(body, false);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    let imageKey: string | null = null;
    if (typeof body.image_key === 'string' && body.image_key.trim()) {
      imageKey = body.image_key.trim();
    }

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('cosmetics')
      .insert({ ...parsed.data, image_key: imageKey })
      .select()
      .single();
    if (error) throw new Error(`保存化妆品失败: ${error.message}`);

    const item = data as Cosmetic;
    return NextResponse.json({
      item: { ...item, image_url: item.image_key ? await signedUrl(item.image_key).catch(() => '') : '' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
