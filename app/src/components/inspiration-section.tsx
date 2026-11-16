'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { InspirationWithUrl } from '@/lib/types';

const STYLE_LABELS: Record<string, string> = {
  casual: '休闲',
  business: '商务',
  formal: '正式',
  fashion: '时尚',
  street: '街头',
  sport: '运动',
};

// 穿搭灵感：收藏喜欢的搭配图，AI 分析风格供推荐参考
export function InspirationSection() {
  const [items, setItems] = useState<InspirationWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
  const [detail, setDetail] = useState<InspirationWithUrl | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InspirationWithUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/inspiration');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setItems(data.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '灵感加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFiles = async (files: FileList) => {
    const list = Array.from(files).filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
    if (list.length === 0) {
      toast.error('请选择 jpg/png/webp 格式的图片');
      return;
    }
    setUploading({ current: 0, total: list.length });
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      setUploading({ current: i + 1, total: list.length });
      try {
        const fd = new FormData();
        fd.append('file', list[i]);
        const res = await fetch('/api/inspiration', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          failed++;
          toast.error(data?.error ?? '上传失败');
        } else if (data.analysis_error) {
          toast.warning('图片已收藏，但 AI 分析失败，可稍后再试');
        }
      } catch {
        failed++;
        toast.error('网络异常，请重试');
      }
    }
    setUploading(null);
    if (failed === 0) toast.success('灵感已收藏，AI 已学习它的风格');
    if (fileRef.current) fileRef.current.value = '';
    await load();
  };

  const openDetail = (it: InspirationWithUrl) => {
    setDetail(it);
    setNoteDraft(it.notes ?? '');
  };

  const saveNote = async () => {
    if (!detail) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/inspiration/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: noteDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '保存失败');
      } else {
        toast.success('备注已保存');
        const updated = data.inspiration as InspirationWithUrl;
        setItems((prev) => prev.map((it) => (it.id === updated.id ? { ...it, notes: updated.notes } : it)));
        setDetail((prev) => (prev ? { ...prev, notes: updated.notes } : prev));
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setNoteSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/inspiration/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '删除失败');
      } else {
        toast.success('已删除');
        setItems((prev) => prev.filter((it) => it.id !== deleteTarget.id));
        setDetail(null);
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-dashed bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">看到好看的搭配？发给我</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              AI 会分析风格和配色，之后生成推荐时参考你的审美
            </p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Button className="mt-3 w-full" onClick={() => fileRef.current?.click()} disabled={!!uploading}>
          {uploading ? <Spinner className="size-4" /> : <ImagePlus className="size-4" />}
          {uploading ? `分析中 ${uploading.current}/${uploading.total}` : '上传灵感图片'}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">还没有收藏灵感，上传第一张吧</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => openDetail(it)}
              className="group overflow-hidden rounded-2xl border bg-card text-left"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {it.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image_url}
                    alt={it.summary ?? '灵感搭配'}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                )}
                {it.style && (
                  <Badge className="absolute left-2 top-2 px-1.5 py-0 text-[10px]">
                    {STYLE_LABELS[it.style] ?? it.style}
                  </Badge>
                )}
              </div>
              <p className="line-clamp-2 p-2 text-xs leading-snug text-muted-foreground">
                {it.summary ?? '（未分析，点开查看）'}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* 灵感详情 */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>灵感详情</DialogTitle>
                <DialogDescription>AI 对这套搭配的分析</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl border bg-muted">
                  {detail.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.image_url} alt={detail.summary ?? '灵感搭配'} className="max-h-72 w-full object-contain" />
                  )}
                </div>
                <div className="space-y-1.5 text-sm">
                  {detail.summary && (
                    <p>
                      <span className="font-medium">风格概括：</span>
                      {detail.summary}
                    </p>
                  )}
                  {detail.palette && detail.palette.length > 0 && (
                    <p>
                      <span className="font-medium">配色：</span>
                      {detail.palette.join(' / ')}
                    </p>
                  )}
                  {detail.pieces && detail.pieces.length > 0 && (
                    <p>
                      <span className="font-medium">关键单品：</span>
                      {detail.pieces.join('、')}
                    </p>
                  )}
                  {detail.vibe && (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">氛围：</span>
                      {detail.vibe}
                    </p>
                  )}
                  {!detail.summary && (
                    <p className="text-muted-foreground">这张图还没有 AI 分析结果，删除后重新上传可重试。</p>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">我的备注（AI 推荐时也会参考）</p>
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="比如：喜欢这个配色，希望外套也是这种感觉"
                    rows={2}
                    maxLength={200}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={saveNote}
                    disabled={noteSaving || noteDraft === (detail.notes ?? '')}
                  >
                    {noteSaving ? <Spinner className="size-3.5" /> : null}
                    保存备注
                  </Button>
                </div>
              </div>
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(detail)}
                >
                  <Trash2 className="size-4" />
                  删除
                </Button>
                <Button onClick={() => setDetail(null)}>关闭</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这张灵感？</AlertDialogTitle>
            <AlertDialogDescription>删除后 AI 推荐将不再参考它的风格，无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Spinner className="size-4" /> : null}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
