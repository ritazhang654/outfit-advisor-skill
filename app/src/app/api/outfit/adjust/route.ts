import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getWeatherByDate } from '@/lib/weather';
import { regenerateOutfitCopy } from '@/lib/llm';
import { CATEGORY_LABELS, type Category, type OutfitRecord, type WeatherInfo } from '@/lib/types';
import type { ClothingItem } from '@/lib/types';

// 用户手工调整推荐组合（采用前的自由修改，调整记录会作为 AI 偏好学习信号）
// 调整成功后根据新组合重新生成 reason/tips，避免残留旧组合的说明
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { record_id?: string; item_ids?: string[]; note?: string };
    const recordId = body.record_id ?? '';
    const itemIds = Array.isArray(body.item_ids) ? [...new Set(body.item_ids.filter((id) => typeof id === 'string'))] : [];
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
    if (!recordId) return NextResponse.json({ error: '缺少 record_id' }, { status: 400 });
    if (itemIds.length === 0) return NextResponse.json({ error: '搭配里至少保留一件单品' }, { status: 400 });
    if (itemIds.length > 8) return NextResponse.json({ error: '单品数量过多（最多 8 件）' }, { status: 400 });

    const client = await getSupabaseClient();

    const { data: recData, error: recError } = await client
      .from('outfit_records')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (recError) throw new Error(`查询推荐失败: ${recError.message}`);
    const record = recData as OutfitRecord | null;
    if (!record) return NextResponse.json({ error: '推荐记录不存在' }, { status: 404 });
    if (record.status !== 'recommended') {
      return NextResponse.json({ error: '这套已经采用打卡，不能再调整' }, { status: 400 });
    }

    // 校验单品存在 + 主件规则
    const { data: itemsData, error: itemsError } = await client
      .from('clothing_items')
      .select('id, category')
      .in('id', itemIds);
    if (itemsError) throw new Error(`校验单品失败: ${itemsError.message}`);
    const validItems = (itemsData ?? []) as Array<{ id: string; category: string }>;
    if (validItems.length !== itemIds.length) {
      return NextResponse.json({ error: '部分单品不存在，请重新选择' }, { status: 400 });
    }
    const cats = new Set(validItems.map((i) => i.category));
    if (!cats.has('dress') && !cats.has('top') && !cats.has('bottom')) {
      return NextResponse.json({ error: '搭配里至少要有一件上装、裤/裙或连衣裙' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await client
      .from('outfit_records')
      .update({ item_ids: itemIds, user_adjusted: true, adjust_note: note || null })
      .eq('id', recordId)
      .select()
      .single();
    if (updateError) throw new Error(`保存调整失败: ${updateError.message}`);

    // 按新组合重新生成搭配说明；生成失败时清空旧文案，避免误导
    let finalRecord = updated as OutfitRecord;
    try {
      const { data: fullItemsData } = await client
        .from('clothing_items')
        .select('id, name, category, color')
        .in('id', itemIds);
      const fullItems = (fullItemsData ?? []) as Pick<ClothingItem, 'id' | 'name' | 'category' | 'color'>[];
      const itemLines = itemIds
        .map((id) => fullItems.find((i) => i.id === id))
        .filter((i): i is Pick<ClothingItem, 'id' | 'name' | 'category' | 'color'> => Boolean(i))
        .map((i) => `${CATEGORY_LABELS[i.category as Category] ?? i.category}：${i.name}${i.color ? `（${i.color}）` : ''}`);

      let weather: WeatherInfo | null = null;
      try {
        const { data: settingsData } = await client.from('user_settings').select('city').limit(1).maybeSingle();
        const city = (settingsData as { city: string | null } | null)?.city ?? null;
        if (city) weather = await getWeatherByDate(city, record.wear_date);
      } catch {
        weather = null;
      }

      const copy = await regenerateOutfitCopy(
        { itemLines, occasion: record.occasion, weather, adjustNote: note },
        request.headers
      );
      const { data: recopyData, error: recopyError } = await client
        .from('outfit_records')
        .update({ reason: copy.reason, tips: copy.tips })
        .eq('id', recordId)
        .select()
        .single();
      if (!recopyError && recopyData) finalRecord = recopyData as OutfitRecord;
    } catch (e) {
      console.error('重新生成搭配说明失败:', e);
      await client
        .from('outfit_records')
        .update({ reason: null, tips: null })
        .eq('id', recordId);
    }

    return NextResponse.json({ record: finalRecord });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
