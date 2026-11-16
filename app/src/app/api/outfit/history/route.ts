import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { signedUrl } from '@/lib/storage';
import type { ClothingItem, OutfitRecord } from '@/lib/types';

// 打卡历史：最近穿过的搭配（worn 记录，按日期倒序）
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('outfit_records')
      .select('*')
      .eq('status', 'worn')
      .order('wear_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(`查询历史失败: ${error.message}`);

    const records = data as OutfitRecord[];
    if (records.length === 0) {
      return NextResponse.json({ records: [] });
    }

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
