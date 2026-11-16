import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { storage } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

const OCCASIONS = ['formal', 'nice', 'casual'];

// 更新 OOTD 的评分/备注/场合
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { rating?: number | null; notes?: string; occasion?: string | null };

    const updates: Record<string, unknown> = {};
    if (body.rating !== undefined) {
      if (body.rating === null) {
        updates.rating = null;
      } else {
        const n = Number(body.rating);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          return NextResponse.json({ error: '评分需为 1-5 的整数' }, { status: 400 });
        }
        updates.rating = n;
      }
    }
    if (body.notes !== undefined) {
      if (typeof body.notes !== 'string') return NextResponse.json({ error: 'notes 参数无效' }, { status: 400 });
      updates.notes = body.notes.trim().slice(0, 200) || null;
    }
    if (body.occasion !== undefined) {
      if (body.occasion !== null && !OCCASIONS.includes(body.occasion)) {
        return NextResponse.json({ error: '场合参数无效' }, { status: 400 });
      }
      updates.occasion = body.occasion;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
    }

    const client = await getSupabaseClient();
    const { data, error } = await client.from('ootd_records').update(updates).eq('id', id).select().maybeSingle();
    if (error) throw new Error(`更新失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: 'OOTD 不存在' }, { status: 404 });
    return NextResponse.json({ ootd: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除 OOTD（同时清理存储文件）
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getSupabaseClient();
    const { data, error } = await client.from('ootd_records').select('image_key').eq('id', id).maybeSingle();
    if (error) throw new Error(`查询失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: 'OOTD 不存在' }, { status: 404 });

    const { error: deleteError } = await client.from('ootd_records').delete().eq('id', id);
    if (deleteError) throw new Error(`删除失败: ${deleteError.message}`);

    const imageKey = (data as { image_key: string }).image_key;
    if (imageKey) {
      await storage.deleteFile({ fileKey: imageKey }).catch((e) => {
        console.error('删除存储文件失败:', e);
      });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
