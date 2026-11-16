import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 打卡「就穿这套」：当日其他记录回退为 recommended，当前记录标记 worn
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { record_id?: string };
    const recordId = body.record_id;
    if (!recordId) {
      return NextResponse.json({ error: '缺少 record_id' }, { status: 400 });
    }

    const client = await getSupabaseClient();

    const { data: target, error: fetchError } = await client
      .from('outfit_records')
      .select('id, wear_date')
      .eq('id', recordId)
      .maybeSingle();
    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!target) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

    // 同日其他 worn 记录回退
    const { error: resetError } = await client
      .from('outfit_records')
      .update({ status: 'recommended' })
      .eq('wear_date', target.wear_date)
      .eq('status', 'worn')
      .neq('id', recordId);
    if (resetError) throw new Error(`重置打卡失败: ${resetError.message}`);

    const { error: updateError } = await client
      .from('outfit_records')
      .update({ status: 'worn' })
      .eq('id', recordId);
    if (updateError) throw new Error(`打卡失败: ${updateError.message}`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
