import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { storage } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

// 更新灵感备注
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { notes?: string };
    if (typeof body.notes !== 'string') return NextResponse.json({ error: 'notes 参数无效' }, { status: 400 });
    const notes = body.notes.trim().slice(0, 200) || null;

    const client = await getSupabaseClient();
    const { data, error } = await client.from('inspirations').update({ notes }).eq('id', id).select().maybeSingle();
    if (error) throw new Error(`更新失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '灵感不存在' }, { status: 404 });
    return NextResponse.json({ inspiration: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除灵感（同时清理存储文件）
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getSupabaseClient();
    const { data, error } = await client.from('inspirations').select('image_key').eq('id', id).maybeSingle();
    if (error) throw new Error(`查询失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '灵感不存在' }, { status: 404 });

    const { error: deleteError } = await client.from('inspirations').delete().eq('id', id);
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
