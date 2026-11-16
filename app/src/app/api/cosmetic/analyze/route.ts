import { NextRequest, NextResponse } from 'next/server';
import { storage, signedUrl } from '@/lib/storage';
import { analyzeCosmeticImage, type CosmeticAnalysis } from '@/lib/llm';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_MAP: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// 上传化妆品包装图并做 AI 识别（返回识别结果与图片 key，用户确认后调 POST /api/cosmetic 入库）
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
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
      fileName: `cosmetics/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
      contentType: file.type,
    });
    const imageUrl = await signedUrl(key, 3600).catch(() => '');

    let analysis: CosmeticAnalysis | null = null;
    let analysisError: string | null = null;
    try {
      analysis = await analyzeCosmeticImage(imageUrl, request.headers);
    } catch (e) {
      analysisError = e instanceof Error ? e.message : '识别失败';
      console.error('化妆品识别失败:', analysisError);
    }

    return NextResponse.json({
      analysis,
      analysis_error: analysisError,
      image_key: key,
      image_url: await signedUrl(key).catch(() => ''),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
