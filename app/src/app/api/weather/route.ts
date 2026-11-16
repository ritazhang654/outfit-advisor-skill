import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getWeatherByDate } from '@/lib/weather';
import { isValidDate } from '@/lib/occasion';

// 查询某日天气（城市取自设置）
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') ?? '';
    if (!isValidDate(date)) {
      return NextResponse.json({ error: '日期格式无效' }, { status: 400 });
    }

    const client = await getSupabaseClient();
    const { data: settings, error } = await client.from('user_settings').select('city').maybeSingle();
    if (error) throw new Error(`读取设置失败: ${error.message}`);
    if (!settings?.city) {
      return NextResponse.json({ error: '请先在「设置」里填写所在城市', need_city: true }, { status: 400 });
    }

    const weather = await getWeatherByDate(settings.city, date);
    return NextResponse.json({ weather });
  } catch (e) {
    const message = e instanceof Error ? e.message : '天气查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
