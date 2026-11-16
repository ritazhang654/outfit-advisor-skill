import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  Subscription,
  SUB_CATEGORY_ORDER,
  SUB_CATEGORY_LABELS,
  type SubCategory,
  type SubCycle,
} from '@/lib/types';

const CATEGORY_KEYS = SUB_CATEGORY_ORDER;
const CYCLE_KEYS = ['monthly', 'quarterly', 'yearly', 'one_time'];
const STATUS_KEYS = ['active', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 校验并归一化请求体字段
function parsePayload(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name) return { error: '名称不能为空' };
    out.name = name;
  }
  if (body.vendor !== undefined) {
    out.vendor = typeof body.vendor === 'string' && body.vendor.trim() ? body.vendor.trim().slice(0, 50) : null;
  }
  if (!partial || body.category !== undefined) {
    const category = String(body.category ?? 'other');
    if (!CATEGORY_KEYS.includes(category as SubCategory)) return { error: '类别无效' };
    out.category = category;
  }
  if (!partial || body.cycle !== undefined) {
    const cycle = String(body.cycle ?? 'monthly');
    if (!CYCLE_KEYS.includes(cycle)) return { error: '计费方式无效' };
    out.cycle = cycle;
  }
  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isInteger(price) || price < 0 || price > 100000000) return { error: '费用无效' };
    out.price = price; // 单位：分
  }
  if (!partial || body.expire_at !== undefined) {
    out.expire_at = typeof body.expire_at === 'string' && DATE_RE.test(body.expire_at) ? body.expire_at : null;
  }
  if (body.auto_renew !== undefined) {
    out.auto_renew = Boolean(body.auto_renew);
  }
  if (body.status !== undefined) {
    const status = String(body.status ?? 'active');
    if (!STATUS_KEYS.includes(status)) return { error: '状态无效' };
    out.status = status;
  }
  if (body.notes !== undefined) {
    out.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 200) : null;
  }
  return { data: out };
}

// 订阅列表（按到期日升序，快到期的在前）
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .order('expire_at', { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(`读取订阅失败: ${error.message}`);
    return NextResponse.json({ items: (data ?? []) as Subscription[] });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 新增订阅
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parsePayload(body, false);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const client = await getSupabaseClient();
    const { data, error } = await client.from('subscriptions').insert(parsed.data).select().single();
    if (error) throw new Error(`保存订阅失败: ${error.message}`);
    return NextResponse.json({ item: data as Subscription });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
