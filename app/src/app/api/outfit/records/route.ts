import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { signedUrl } from '@/lib/storage';
import { isValidDate } from '@/lib/occasion';
import type { ClothingItem, OutfitRecord } from '@/lib/types';

// 查询某天的穿搭记录（含单品明细与签名 URL）
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') ?? '';
    if (!isValidDate(date)) {
      return NextResponse.json({ error: '日期格式无效' }, { status: 400 });
    }

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('outfit_records')
      .select('*')
      .eq('wear_date', date)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(`查询记录失败: ${error.message}`);

    const records = data as OutfitRecord[];
    if (records.length === 0) {
      return NextResponse.json({ records: [] });
    }

    // 汇总所有单品 id，批量查询后组装（避免 N+1）
    const allIds = Array.from(new Set(records.flatMap((r) => r.item_ids ?? [])));
    const itemsMap = new Map<string, ClothingItem>();
    if (allIds.length > 0) {
      const { data: itemsData, error: itemsError } = await client
        .from('clothing_items')
        .select('*')
        .in('id', allIds);
      if (itemsError) throw new Error(`查询单品失败: ${itemsError.message}`);
      for (const item of (itemsData ?? []) as ClothingItem[]) {
        itemsMap.set(item.id, item);
      }
    }

    const urlCache = new Map<string, string>();
    const withItems = await Promise.all(
      records.map(async (record) => ({
        ...record,
        items: await Promise.all(
          (record.item_ids ?? []).map(async (id) => {
            const item = itemsMap.get(id);
            if (!item) return null;
            let url = urlCache.get(item.image_key);
            if (!url) {
              url = await signedUrl(item.image_key).catch(() => '');
              urlCache.set(item.image_key, url);
            }
            return { ...item, image_url: url };
          })
        ).then((list) => list.filter((it): it is NonNullable<typeof it> => it !== null)),
      }))
    );

    return NextResponse.json({ records: withItems });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
