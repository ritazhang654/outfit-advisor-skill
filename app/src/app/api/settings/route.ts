import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { DEFAULT_WEEKDAY_RULES } from '@/lib/occasion';
import type { UserSettings } from '@/lib/types';

// 读取设置；无记录时返回默认周几规则
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.from('user_settings').select('city, weekday_rules').maybeSingle();
    if (error) throw new Error(`读取设置失败: ${error.message}`);

    const settings: UserSettings = {
      city: data?.city ?? null,
      weekday_rules: { ...DEFAULT_WEEKDAY_RULES, ...(data?.weekday_rules ?? {}) },
    };
    return NextResponse.json({ settings });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 保存设置（城市 / 周几规则）
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<UserSettings>;
    const updates: { city?: string | null; weekday_rules?: Record<string, string>; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if ('city' in body) {
      const city = typeof body.city === 'string' ? body.city.trim() : null;
      if (city && city.length > 50) {
        return NextResponse.json({ error: '城市名过长' }, { status: 400 });
      }
      updates.city = city || null;
    }
    if ('weekday_rules' in body && body.weekday_rules) {
      const valid = new Set(['formal', 'nice', 'casual']);
      const rules: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.weekday_rules)) {
        if (!['0', '1', '2', '3', '4', '5', '6'].includes(key)) continue;
        if (!valid.has(value)) continue;
        rules[key] = value;
      }
      updates.weekday_rules = rules;
    }

    const client = await getSupabaseClient();
    const { data: existing } = await client.from('user_settings').select('id').maybeSingle();

    if (existing?.id) {
      const { error } = await client.from('user_settings').update(updates).eq('id', existing.id);
      if (error) throw new Error(`保存设置失败: ${error.message}`);
    } else {
      const { error } = await client.from('user_settings').insert(updates);
      if (error) throw new Error(`保存设置失败: ${error.message}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
