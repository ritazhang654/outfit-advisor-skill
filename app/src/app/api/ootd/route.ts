import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { storage, signedUrl } from '@/lib/storage';
import { analyzeOotdImage } from '@/lib/llm';
import type { OotdRecord } from '@/lib/types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_MAP: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 我的 OOTD 列表
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('ootd_records')
      .select('*')
      .order('wear_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`读取 OOTD 失败: ${error.message}`);
    const list = (data ?? []) as OotdRecord[];
    const withUrl = await Promise.all(
      list.map(async (it) => ({ ...it, image_url: await signedUrl(it.image_key).catch(() => '') }))
    );
    return NextResponse.json({ items: withUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 上传今天的 OOTD，AI 分析后入库（分析失败也入库，不影响记录）
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const wearDateRaw = ((formData.get('wear_date') as string | null) ?? '').trim();
    const notes = (formData.get('notes') as string | null)?.trim().slice(0, 200) || null;
    const ratingRaw = formData.get('rating');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传图片文件' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: '仅支持 jpg/png/webp 格式图片' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '图片不能超过 10MB' }, { status: 400 });
    }

    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const wearDate = wearDateRaw || today;
    if (!DATE_RE.test(wearDate)) {
      return NextResponse.json({ error: '日期格式应为 YYYY-MM-DD' }, { status: 400 });
    }

    let rating: number | null = null;
    if (ratingRaw !== null && ratingRaw !== '') {
      const n = Number(ratingRaw);
      rating = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
    }

    const ext = EXT_MAP[file.type];
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: `ootd/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
      contentType: file.type,
    });

    const client = await getSupabaseClient();
    const previewUrl = await signedUrl(key, 3600).catch(() => '');

    let analysis = null;
    let analysisError: string | null = null;
    try {
      analysis = await analyzeOotdImage(previewUrl, request.headers);
    } catch (e) {
      analysisError = e instanceof Error ? e.message : '分析失败';
      console.error('OOTD 分析失败:', analysisError);
    }

    const { data, error } = await client
      .from('ootd_records')
      .insert({
        image_key: key,
        wear_date: wearDate,
        occasion: analysis?.occasion ?? null,
        summary: analysis?.summary ?? null,
        style: analysis?.style ?? null,
        palette: analysis?.palette ?? null,
        pieces: analysis?.pieces ?? null,
        rating,
        notes,
      })
      .select()
      .single();
    if (error) throw new Error(`保存 OOTD 失败: ${error.message}`);

    const record = data as OotdRecord;
    return NextResponse.json({
      ootd: { ...record, image_url: await signedUrl(key).catch(() => '') },
      analysis_error: analysisError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
