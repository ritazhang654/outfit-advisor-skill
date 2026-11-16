import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { signedUrl } from '@/lib/storage';
import type { ClothingItem } from '@/lib/types';

// 衣橱列表（含签名访问 URL）
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('clothing_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(`查询衣橱失败: ${error.message}`);

    const items = data as ClothingItem[];
    const withUrls = await Promise.all(
      items.map(async (item) => ({
        ...item,
        image_url: await signedUrl(item.image_key).catch(() => ''),
      }))
    );
    return NextResponse.json({ items: withUrls });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
