import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { FOOD_CATEGORY_ORDER } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

const CATEGORY_KEYS: string[] = FOOD_CATEGORY_ORDER;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 更新食品信息（支持只传变化字段，如 quantity 做加减）
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
      if (!name) return NextResponse.json({ error: '请填写食品名称' }, { status: 400 });
      updates.name = name;
    }
    if (body.brand !== undefined) {
      updates.brand = typeof body.brand === 'string' ? body.brand.trim().slice(0, 50) || null : null;
    }
    if (body.category !== undefined) {
      const category = typeof body.category === 'string' ? body.category : '';
      if (!CATEGORY_KEYS.includes(category)) {
        return NextResponse.json({ error: '类别参数无效' }, { status: 400 });
      }
      updates.category = category;
    }
    if (body.quantity !== undefined) {
      const n = Number(body.quantity);
      if (!Number.isFinite(n) || n < 0 || n > 9999) {
        return NextResponse.json({ error: '数量需在 0-9999 之间' }, { status: 400 });
      }
      updates.quantity = Math.floor(n);
    }
    if (body.min_quantity !== undefined) {
      const n = Number(body.min_quantity);
      if (!Number.isFinite(n) || n < 0 || n > 9999) {
        return NextResponse.json({ error: '提醒阈值需在 0-9999 之间' }, { status: 400 });
      }
      updates.min_quantity = Math.floor(n);
    }
    if (body.unit !== undefined) {
      updates.unit = typeof body.unit === 'string' ? body.unit.trim().slice(0, 10) || '件' : '件';
    }
    if (body.expire_at !== undefined) {
      if (body.expire_at === null || body.expire_at === '') {
        updates.expire_at = null;
      } else if (typeof body.expire_at === 'string' && DATE_RE.test(body.expire_at.trim())) {
        updates.expire_at = body.expire_at.trim();
      } else {
        return NextResponse.json({ error: '有效期格式应为 YYYY-MM-DD' }, { status: 400 });
      }
    }
    if (body.rating !== undefined) {
      if (body.rating === null) {
        updates.rating = null;
      } else {
        const n = Number(body.rating);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          return NextResponse.json({ error: '评分需为 1-5 的整数' }, { status: 400 });
        }
        updates.rating = n;
      }
    }
    if (body.notes !== undefined) {
      updates.notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 200) || null : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const client = await getSupabaseClient();
    const { data, error } = await client.from('foods').update(updates).eq('id', id).select().maybeSingle();
    if (error) throw new Error(`更新失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '食品不存在' }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getSupabaseClient();
    const { data, error } = await client.from('foods').delete().eq('id', id).select().maybeSingle();
    if (error) throw new Error(`删除失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '食品不存在' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
