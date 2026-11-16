import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { storage, signedUrl } from '@/lib/storage';
import { analyzeInspirationImage, type InspirationAnalysis } from '@/lib/llm';
import type { Inspiration } from '@/lib/types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_MAP: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// 灵感列表
export async function GET() {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('inspirations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`读取灵感失败: ${error.message}`);
    const list = (data ?? []) as Inspiration[];
    const withUrl = await Promise.all(
      list.map(async (it) => ({ ...it, image_url: await signedUrl(it.image_key).catch(() => '') }))
    );
    return NextResponse.json({ items: withUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 上传灵感图并做 AI 风格分析（失败仍入库，可稍后重试）
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const notes = (formData.get('notes') as string | null)?.trim().slice(0, 200) || null;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传图片文件' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: '仅支持 jpg/png/webp 格式图片' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '图片不能超过 10MB' }, { status: 400 });
    }

    const ext = EXT_MAP[file.type];
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: `inspirations/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
      contentType: file.type,
    });

    const client = await getSupabaseClient();
    const previewUrl = await signedUrl(key, 3600).catch(() => '');

    let analysis: InspirationAnalysis | null = null;
    let analysisError: string | null = null;
    try {
      analysis = await analyzeInspirationImage(previewUrl, request.headers);
    } catch (e) {
      analysisError = e instanceof Error ? e.message : '分析失败';
      console.error('灵感分析失败:', analysisError);
    }

    const { data: insData, error: insertError } = await client
      .from('inspirations')
      .insert({
        image_key: key,
        summary: analysis?.summary ?? null,
        style: analysis?.style ?? null,
        palette: analysis?.palette ?? null,
        pieces: analysis?.pieces ?? null,
        vibe: analysis?.vibe ?? null,
        notes,
      })
      .select()
      .single();
    if (insertError) throw new Error(`保存灵感失败: ${insertError.message}`);

    const inspiration = insData as Inspiration;
    return NextResponse.json({
      inspiration: { ...inspiration, image_url: await signedUrl(key).catch(() => '') },
      analysis_error: analysisError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
