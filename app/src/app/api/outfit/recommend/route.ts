import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { signedUrl } from '@/lib/storage';
import { generateOutfit } from '@/lib/llm';
import { getWeatherByDate } from '@/lib/weather';
import { resolveOccasion, isValidDate, type ScheduleChoice } from '@/lib/occasion';
import type { ClothingItem, OutfitRecord } from '@/lib/types';

// 生成次日穿搭推荐
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { date?: string; schedule?: ScheduleChoice };
    const date = body.date ?? '';
    const schedule: ScheduleChoice = body.schedule ?? 'auto';
    if (!isValidDate(date)) {
      return NextResponse.json({ error: '日期格式无效' }, { status: 400 });
    }
    if (!['auto', 'meeting', 'outing', 'nice'].includes(schedule)) {
      return NextResponse.json({ error: '场合参数无效' }, { status: 400 });
    }

    const client = await getSupabaseClient();

    // 读取设置（城市、周几规则）
    const { data: settingsData, error: settingsError } = await client
      .from('user_settings')
      .select('city, weekday_rules')
      .maybeSingle();
    if (settingsError) throw new Error(`读取设置失败: ${settingsError.message}`);
    const city = settingsData?.city;
    if (!city) {
      return NextResponse.json({ error: '请先在「设置」里填写所在城市' }, { status: 400 });
    }

    // 查询目标日期天气
    let weather;
    try {
      weather = await getWeatherByDate(city, date);
    } catch (e) {
      const message = e instanceof Error ? e.message : '天气查询失败';
      return NextResponse.json({ error: message }, { status: 502 });
    }
    if (!weather) {
      return NextResponse.json({ error: '该日期超出 16 天天气预报范围，无法推荐' }, { status: 400 });
    }

    // 衣橱单品
    const { data: itemsData, error: itemsError } = await client
      .from('clothing_items')
      .select('*')
      .limit(500);
    if (itemsError) throw new Error(`读取衣橱失败: ${itemsError.message}`);
    const items = itemsData as ClothingItem[];
    if (items.length === 0) {
      return NextResponse.json({ error: '衣橱还是空的，先去「衣橱」拍几件衣服吧' }, { status: 400 });
    }
    const mainItems = items.filter((i) => ['top', 'bottom', 'dress'].includes(i.category));
    if (mainItems.length === 0) {
      return NextResponse.json({ error: '衣橱里还没有上装、裤/裙或连衣裙，先添加几件吧' }, { status: 400 });
    }

    // 近 7 天记录（避免重复）+ 当天已推荐组合（换一套时排除）
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 7);
    const sevenDaysAgo = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    const { data: recentData, error: recentError } = await client
      .from('outfit_records')
      .select('wear_date, item_ids, user_adjusted, adjust_note, ai_item_ids')
      .gte('wear_date', sevenDaysAgo)
      .lte('wear_date', date)
      .order('created_at', { ascending: false })
      .limit(30);
    if (recentError) throw new Error(`读取历史记录失败: ${recentError.message}`);

    const { data: todayData, error: todayError } = await client
      .from('outfit_records')
      .select('item_ids')
      .eq('wear_date', date);
    if (todayError) throw new Error(`读取当日记录失败: ${todayError.message}`);

    const occasion = resolveOccasion(date, schedule, settingsData?.weekday_rules ?? null);

    // 灵感偏好：最近收藏的灵感搭配（AI 分析结果）
    const { data: inspData } = await client
      .from('inspirations')
      .select('summary, style, palette, pieces')
      .order('created_at', { ascending: false })
      .limit(5);
    const inspirations = (inspData ?? [])
      .map((s) => {
        const row = s as { summary?: string | null; style?: string | null; palette?: string[] | null; pieces?: string[] | null };
        return [
          row.summary ?? '',
          row.style ? `风格:${row.style}` : '',
          row.palette?.length ? `配色:${row.palette.join('/')}` : '',
          row.pieces?.length ? `单品:${row.pieces.join('、')}` : '',
        ]
          .filter(Boolean)
          .join('，');
      })
      .filter(Boolean);

    // 我的日常穿搭（OOTD）：喜欢的优先，供 AI 学习个人风格
    const { data: ootdData } = await client
      .from('ootd_records')
      .select('summary, style, palette, pieces, rating')
      .order('rating', { ascending: false, nullsFirst: false })
      .order('wear_date', { ascending: false })
      .limit(6);
    const myOotds = (ootdData ?? [])
      .map((o) => {
        const row = o as {
          summary?: string | null;
          style?: string | null;
          palette?: string[] | null;
          pieces?: string[] | null;
          rating?: number | null;
        };
        const detail = [
          row.style ? `风格:${row.style}` : '',
          row.palette?.length ? `配色:${row.palette.join('/')}` : '',
          row.pieces?.length ? `单品:${row.pieces.join('、')}` : '',
        ]
          .filter(Boolean)
          .join('，');
        const head = row.summary ?? detail;
        const love = row.rating ? `（我喜欢程度 ${row.rating}/5）` : '';
        return detail && row.summary ? `${head}（${detail}）${love}` : `${head}${love}`;
      })
      .filter(Boolean);

    // 近期手工调整记录：AI 原方案 → 用户改法（学习偏好）
    const adjustNotes = (recentData ?? [])
      .filter((r) => r.user_adjusted)
      .slice(0, 5)
      .map((r) => {
        const row = r as { item_ids: string[] | null; ai_item_ids: string[] | null; adjust_note: string | null };
        const nameOf = (ids: string[] | null) =>
          ((ids ?? []) as string[]).map((id) => items.find((i) => i.id === id)?.name ?? id).join('、');
        const note = row.adjust_note ? `，原因：${row.adjust_note}` : '';
        return `AI 原推 [${nameOf(row.ai_item_ids)}] → 我改成了 [${nameOf(row.item_ids)}]${note}`;
      });

    // AI 生成搭配（失败自动重试 1 次）
    const recommendInput = {
      date,
      weather,
      occasion,
      items,
      recentWorn: (recentData ?? []).map((r) => ({
        date: String(r.wear_date),
        item_ids: (r.item_ids ?? []) as string[],
      })),
      excludedSets: (todayData ?? []).map((r) => (r.item_ids ?? []) as string[]),
      inspirations,
      adjustNotes,
      myOotds,
    };
    let result;
    try {
      result = await generateOutfit(recommendInput);
    } catch (firstError) {
      try {
        result = await generateOutfit(recommendInput);
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误';
        console.error('生成推荐失败:', firstError, message);
        return NextResponse.json({ error: `AI 搭配生成失败，请稍后重试` }, { status: 502 });
      }
    }

    // 只保留最新一条未采用的推荐（用户「采用」打卡后才会正式留在日历里）
    await client.from('outfit_records').delete().eq('wear_date', date).eq('status', 'recommended');

    // 入库
    const { data: recData, error: insertError } = await client
      .from('outfit_records')
      .insert({
        wear_date: date,
        item_ids: result.item_ids,
        occasion,
        reason: result.reason,
        tips: result.tips,
        weather,
        ai_item_ids: result.item_ids,
      })
      .select()
      .single();
    if (insertError) throw new Error(`保存推荐失败: ${insertError.message}`);

    const record = recData as OutfitRecord;
    const selectedItems = (
      await Promise.all(
        record.item_ids.map(async (id) => {
          const item = items.find((i) => i.id === id);
          if (!item) return null;
          return { ...item, image_url: await signedUrl(item.image_key).catch(() => '') };
        })
      )
    ).filter((it): it is NonNullable<typeof it> => it !== null);

    return NextResponse.json({ record: { ...record, items: selectedItems }, weather, occasion });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
