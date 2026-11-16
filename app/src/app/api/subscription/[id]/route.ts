import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { Subscription, SUB_CATEGORY_ORDER, SUB_CYCLE_RENEW_MONTHS, type SubCycle } from '@/lib/types';

const CATEGORY_KEYS: string[] = SUB_CATEGORY_ORDER;
const CYCLE_KEYS = ['monthly', 'quarterly', 'yearly', 'one_time'];
const STATUS_KEYS = ['active', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 当天日期（东八区）
function todayStr(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 月份加法：处理月末溢出（1月31日 + 1个月 = 2月28/29日）
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = anchor.getUTCFullYear();
  const tm = anchor.getUTCMonth() + 1;
  const daysInMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, daysInMonth)).padStart(2, '0')}`;
}

function parsePayload(body: Record<string, unknown>) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name) return { error: '名称不能为空' };
    updates.name = name;
  }
  if (body.vendor !== undefined) {
    updates.vendor = typeof body.vendor === 'string' && body.vendor.trim() ? body.vendor.trim().slice(0, 50) : null;
  }
  if (body.category !== undefined) {
    const category = String(body.category);
    if (!CATEGORY_KEYS.includes(category)) return { error: '类别无效' };
    updates.category = category;
  }
  if (body.cycle !== undefined) {
    const cycle = String(body.cycle);
    if (!CYCLE_KEYS.includes(cycle)) return { error: '计费方式无效' };
    updates.cycle = cycle;
  }
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isInteger(price) || price < 0 || price > 100000000) return { error: '费用无效' };
    updates.price = price;
  }
  if (body.expire_at !== undefined) {
    updates.expire_at = typeof body.expire_at === 'string' && DATE_RE.test(body.expire_at) ? body.expire_at : null;
  }
  if (body.auto_renew !== undefined) {
    updates.auto_renew = Boolean(body.auto_renew);
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUS_KEYS.includes(status)) return { error: '状态无效' };
    updates.status = status;
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 200) : null;
  }
  return { data: updates };
}

// 编辑订阅；body.renew=true 时一键续费：到期日从「当前到期日/今天中较晚者」顺延一个周期
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const client = await getSupabaseClient();

    const parsed = parsePayload(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const updates = parsed.data;

    if (body.renew === true) {
      const { data: recData, error: recError } = await client
        .from('subscriptions')
        .select('cycle, expire_at')
        .eq('id', id)
        .maybeSingle();
      if (recError) throw new Error(`查询订阅失败: ${recError.message}`);
      const record = recData as Pick<Subscription, 'cycle' | 'expire_at'> | null;
      if (!record) return NextResponse.json({ error: '订阅不存在' }, { status: 404 });
      const months = SUB_CYCLE_RENEW_MONTHS[record.cycle as SubCycle] ?? 0;
      if (months === 0) return NextResponse.json({ error: '一次性买断的项目没有续费' }, { status: 400 });
      const base = record.expire_at && record.expire_at > todayStr() ? record.expire_at : todayStr();
      updates.expire_at = addMonths(base, months);
      if (updates.status === undefined) updates.status = 'active';
    }

    const { data, error } = await client
      .from('subscriptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`更新订阅失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '订阅不存在' }, { status: 404 });
    return NextResponse.json({ item: data as Subscription });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除订阅
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await getSupabaseClient();
    const { error } = await client.from('subscriptions').delete().eq('id', id);
    if (error) throw new Error(`删除订阅失败: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
