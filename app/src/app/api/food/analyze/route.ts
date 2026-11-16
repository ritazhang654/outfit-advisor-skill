import { NextRequest, NextResponse } from 'next/server';
import { storage, signedUrl } from '@/lib/storage';
import { analyzeFoodImage } from '@/lib/llm';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_MAP: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// 上传食品包装照，AI 识别后只返回结果供表单预填，不落库
export async function POST(request: NextRequest) {
  let tempKey: string | null = null;
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
    tempKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `food-tmp/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
      contentType: file.type,
    });

    const previewUrl = await signedUrl(tempKey, 1800);
    const analysis = await analyzeFoodImage(previewUrl, request.headers);

    return NextResponse.json({ analysis });
  } catch (e) {
    const message = e instanceof Error ? e.message : '识别失败';
    console.error('食品识别失败:', message);
    return NextResponse.json({ error: `识别失败，请重试或手动填写（${message.slice(0, 60)}）` }, { status: 502 });
  } finally {
    // 识别用的临时图不保留，避免堆积无用文件
    if (tempKey) {
      await storage.deleteFile({ fileKey: tempKey }).catch((err) => {
        console.error('清理临时图片失败:', err);
      });
    }
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
