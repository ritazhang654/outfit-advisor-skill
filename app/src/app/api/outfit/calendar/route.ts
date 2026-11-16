import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { signedUrl } from '@/lib/storage';
import type { ClothingItem, OutfitRecord } from '@/lib/types';

// 穿搭日历：按月查询已采用的打卡记录
export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get('month') ?? '';
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month 参数格式应为 YYYY-MM' }, { status: 400 });
    }
    const [y, m] = month.split('-').map(Number);
    if (m < 1 || m > 12) return NextResponse.json({ error: '月份无效' }, { status: 400 });
    const start = `${month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${month}-${String(lastDay).padStart(2, '0')}`;

    const client = await getSupabaseClient();
    const { data: recData, error } = await client
      .from('outfit_records')
      .select('*')
      .eq('status', 'worn')
      .gte('wear_date', start)
      .lte('wear_date', end)
      .order('wear_date', { ascending: true });
    if (error) throw new Error(`读取日历失败: ${error.message}`);

    const records = (recData ?? []) as OutfitRecord[];
    const allIds = [...new Set(records.flatMap((r) => r.item_ids))];
    const urlCache = new Map<string, string>();
    const itemsById = new Map<string, ClothingItem>();
    if (allIds.length > 0) {
      const { data: itemsData, error: itemsError } = await client
        .from('clothing_items')
        .select('*')
        .in('id', allIds);
      if (itemsError) throw new Error(`读取单品失败: ${itemsError.message}`);
      for (const item of (itemsData ?? []) as ClothingItem[]) {
        itemsById.set(item.id, item);
        urlCache.set(item.id, await signedUrl(item.image_key).catch(() => ''));
      }
    }

    const days = records.map((r) => ({
      wear_date: r.wear_date,
      record_id: r.id,
      occasion: r.occasion,
      reason: r.reason,
      tips: r.tips,
      user_adjusted: r.user_adjusted,
      items: r.item_ids
        .map((id) => {
          const item = itemsById.get(id);
          return item ? { ...item, image_url: urlCache.get(item.id) ?? '' } : null;
        })
        .filter((it): it is NonNullable<typeof it> => it !== null),
    }));

    return NextResponse.json({ month, days });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
