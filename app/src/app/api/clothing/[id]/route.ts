import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { storage } from '@/lib/storage';
import type { ClothingItem } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

// 更新单品属性（编辑衣橱信息）
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const allowed = ['name', 'category', 'color', 'style', 'formality', 'season', 'thickness', 'notes'] as const;
    const updates: Record<string, unknown> = {};
    for (const field of allowed) {
      if (field in body) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('clothing_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`更新失败: ${error.message}`);
    return NextResponse.json({ item: data as ClothingItem });
  } catch (e) {
    const message = e instanceof Error ? e.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除单品（清理对象存储 + 数据库记录）
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const client = await getSupabaseClient();

    const { data, error: fetchError } = await client
      .from('clothing_items')
      .select('id, image_key')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!data) return NextResponse.json({ error: '单品不存在' }, { status: 404 });

    const { error: delError } = await client.from('clothing_items').delete().eq('id', id);
    if (delError) throw new Error(`删除失败: ${delError.message}`);

    // 数据库删除成功后清理图片；存储清理失败不阻塞删除结果
    await storage.deleteFile({ fileKey: data.image_key }).catch((e) => {
      console.error('清理图片失败:', e);
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
