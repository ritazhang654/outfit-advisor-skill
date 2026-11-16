import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { FOOD_CATEGORY_ORDER, type Food } from '@/lib/types';

const CATEGORY_KEYS: string[] = FOOD_CATEGORY_ORDER;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 食品列表：临期优先，无有效期的排最后
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('foods')
      .select('*')
      .order('expire_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(`读取食品失败: ${error.message}`);
    return NextResponse.json({ items: (data ?? []) as Food[] });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name) return NextResponse.json({ error: '请填写食品名称' }, { status: 400 });

    const brand = typeof body.brand === 'string' ? body.brand.trim().slice(0, 50) || null : null;

    const category = typeof body.category === 'string' ? body.category : 'other';
    if (!CATEGORY_KEYS.includes(category)) {
      return NextResponse.json({ error: '类别参数无效' }, { status: 400 });
    }

    const qtyRaw = Number(body.quantity ?? 1);
    if (!Number.isFinite(qtyRaw) || qtyRaw < 0 || qtyRaw > 9999) {
      return NextResponse.json({ error: '数量需在 0-9999 之间' }, { status: 400 });
    }
    const quantity = Math.floor(qtyRaw);

    const minRaw = Number(body.min_quantity ?? 1);
    if (!Number.isFinite(minRaw) || minRaw < 0 || minRaw > 9999) {
      return NextResponse.json({ error: '提醒阈值需在 0-9999 之间' }, { status: 400 });
    }
    const minQuantity = Math.floor(minRaw);

    const unit = typeof body.unit === 'string' ? body.unit.trim().slice(0, 10) || '件' : '件';

    let expireAt: string | null = null;
    if (typeof body.expire_at === 'string' && body.expire_at.trim()) {
      if (!DATE_RE.test(body.expire_at.trim())) {
        return NextResponse.json({ error: '有效期格式应为 YYYY-MM-DD' }, { status: 400 });
      }
      expireAt = body.expire_at.trim();
    }

    let rating: number | null = null;
    if (body.rating !== undefined && body.rating !== null) {
      const n = Number(body.rating);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return NextResponse.json({ error: '评分需为 1-5 的整数' }, { status: 400 });
      }
      rating = n;
    }

    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 200) || null : null;

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('foods')
      .insert({
        name,
        brand,
        category,
        quantity,
        unit,
        min_quantity: minQuantity,
        expire_at: expireAt,
        rating,
        notes,
      })
      .select()
      .single();
    if (error) throw new Error(`保存食品失败: ${error.message}`);

    return NextResponse.json({ item: data as Food });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
