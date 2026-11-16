'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Star, Trash2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { OotdWithUrl } from '@/lib/types';

function todayStr(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function Stars({
  value,
  onChange,
  size = 'size-4',
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={cn('transition', onChange && 'hover:scale-110', !onChange && 'cursor-default')}
          aria-label={`${n} 星`}
        >
          <Star
            className={cn(size, n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')}
          />
        </button>
      ))}
    </span>
  );
}

export function OotdSection() {
  const [items, setItems] = useState<OotdWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [wearDate, setWearDate] = useState(todayStr);
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<OotdWithUrl | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OotdWithUrl | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ootd');
      const data = await res.json();
      setItems(res.ok ? ((data.items ?? []) as OotdWithUrl[]) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function resetForm() {
    setFile(null);
    setWearDate(todayStr());
    setRating(0);
    setNotes('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleUpload() {
    if (!file) {
      toast.error('先选一张照片');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('wear_date', wearDate);
      if (rating > 0) fd.append('rating', String(rating));
      if (notes.trim()) fd.append('notes', notes.trim());
      const res = await fetch('/api/ootd', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? '上传失败');
      setUploadOpen(false);
      resetForm();
      await load();
      if (data?.analysis_error) {
        toast.warning('照片已保存，但 AI 分析没成功，稍后可重新上传');
      } else {
        toast.success('已记录，之后推荐会参考你这套的风格');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setSaving(false);
    }
  }

  async function patchOotd(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/ootd/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? '更新失败');
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...(data.ootd as OotdWithUrl) } : it)));
    setDetail((prev) => (prev && prev.id === id ? { ...prev, ...(data.ootd as OotdWithUrl) } : prev));
  }

  async function handleRate(item: OotdWithUrl, value: number) {
    try {
      await patchOotd(item.id, { rating: value === 0 ? null : value });
      toast.success(value === 0 ? '已取消评分' : `已标记 ${value} 星，推荐会更多参考这套`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    }
  }

  async function handleDelete(item: OotdWithUrl) {
    try {
      const res = await fetch(`/api/ootd/${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? '删除失败');
      setDetail(null);
      setDeleteTarget(null);
      await load();
      toast.success('已删除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <section className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">我的 OOTD</h2>
          <p className="text-[11px] text-muted-foreground/80">上传日常穿搭，AI 会贴近你自己的风格推荐</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Camera className="mr-1 size-4" />
          记录今天
        </Button>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-32 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              还没有记录。拍一张今天穿的，之后 AI 推荐会照着你的习惯来。
            </p>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Camera className="mr-1 size-4" />
              上传 OOTD
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => setDetail(it)}
              className="w-32 shrink-0 text-left transition active:scale-[0.98]"
            >
              <div className="relative overflow-hidden rounded-xl border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image_url} alt={it.summary ?? 'OOTD'} className="h-40 w-full object-cover" loading="lazy" />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  {it.wear_date.slice(5).replace('-', '/')}
                </span>
                {it.rating ? (
                  <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                    <Star className="size-2.5 fill-amber-400 text-amber-400" />
                    {it.rating}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {it.summary ?? it.notes ?? '已记录'}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* 上传弹窗 */}
      <Dialog open={uploadOpen} onOpenChange={(o) => (o ? setUploadOpen(true) : (setUploadOpen(false), resetForm()))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>记录今天的 OOTD</DialogTitle>
            <DialogDescription>AI 会分析风格和配色，作为之后推荐的参考</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/40"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="预览" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                    <Camera className="size-6" />
                    点击拍照或选图
                  </span>
                )}
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ootd-date">日期</Label>
              <Input id="ootd-date" type="date" value={wearDate} onChange={(e) => setWearDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>我喜欢这套的程度</Label>
              <Stars value={rating} onChange={setRating} size="size-6" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ootd-notes">备注</Label>
              <Textarea
                id="ootd-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="如：这套很显瘦、配这双鞋更舒服"
                rows={2}
                maxLength={200}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => (setUploadOpen(false), resetForm())} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleUpload} disabled={saving || !file}>
              {saving ? <Spinner className="mr-1" /> : null}
              {saving ? '分析中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.wear_date.replace(/-/g, '/')} 的穿搭</DialogTitle>
                <DialogDescription>{detail.summary ?? '暂无 AI 描述'}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.image_url}
                  alt={detail.summary ?? 'OOTD'}
                  className="max-h-[50vh] w-full rounded-xl object-contain"
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">我喜欢这套</span>
                  <Stars value={detail.rating ?? 0} onChange={(v) => void handleRate(detail, v)} />
                </div>

                {detail.style && (
                  <p className="text-xs text-muted-foreground">
                    风格：{detail.style}
                    {detail.palette?.length ? ` · 配色：${detail.palette.join(' / ')}` : ''}
                  </p>
                )}
                {detail.pieces?.length ? (
                  <p className="text-xs text-muted-foreground">单品：{detail.pieces.join('、')}</p>
                ) : null}
                {detail.notes && <p className="rounded-lg bg-muted/60 p-2 text-xs">{detail.notes}</p>}
              </div>

              <DialogFooter className="sm:justify-between">
                <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(detail)}>
                  <Trash2 className="mr-1 size-4" />
                  删除
                </Button>
                <Button variant="outline" onClick={() => setDetail(null)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条 OOTD？</AlertDialogTitle>
            <AlertDialogDescription>照片会一起删除，AI 也不再参考这套搭配。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && void handleDelete(deleteTarget)}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
