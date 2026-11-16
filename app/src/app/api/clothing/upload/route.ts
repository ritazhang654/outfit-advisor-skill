import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { storage, signedUrl } from '@/lib/storage';
import { analyzeClothingImage, type ClothingAnalysis } from '@/lib/llm';
import type { ClothingItem } from '@/lib/types';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_SIZE = 10 * 1024 * 1024;

// 上传衣服图片 → 对象存储 → LLM 识别 → 入库
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少图片文件' }, { status: 400 });
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: '仅支持 JPG / PNG / WebP 图片' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '图片不能超过 10MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: `clothing/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
      contentType: file.type,
    });

    // LLM 识别；失败时不浪费已上传的图片，入库为待补充单品
    let analysis: ClothingAnalysis | null = null;
    let analysisError: string | null = null;
    try {
      const url = await signedUrl(key, 3600);
      analysis = await analyzeClothingImage(url);
    } catch (e) {
      analysisError = e instanceof Error ? e.message : '识别失败';
    }

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('clothing_items')
      .insert({
        image_key: key,
        category: analysis?.category ?? 'top',
        name: analysis?.name ?? '待补充单品',
        color: analysis?.color ?? null,
        style: analysis?.style ?? null,
        formality: analysis?.formality ?? null,
        season: analysis?.season ?? null,
        thickness: analysis?.thickness ?? null,
        notes: analysis?.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`保存单品失败: ${error.message}`);

    const item = data as ClothingItem;
    return NextResponse.json({
      item: { ...item, image_url: await signedUrl(key).catch(() => '') },
      analysis_error: analysisError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '上传失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
