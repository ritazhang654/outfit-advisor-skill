'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Minus, PackageOpen, Plus, Star, Trash2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  FOOD_CATEGORY_LABELS,
  FOOD_CATEGORY_ORDER,
  FOOD_UNITS,
  type Food,
  type FoodCategory,
} from '@/lib/types';

type FormState = {
  name: string;
  brand: string;
  category: FoodCategory;
  quantity: string;
  unit: string;
  min_quantity: string;
  expire_at: string;
  rating: number;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  brand: '',
  category: 'other',
  quantity: '1',
  unit: '件',
  min_quantity: '1',
  expire_at: '',
  rating: 0,
  notes: '',
};

function todayStr(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysBetween(target: string): number {
  const t = new Date(`${target}T00:00:00+08:00`).getTime();
  const now = new Date(`${todayStr()}T00:00:00+08:00`).getTime();
  return Math.round((t - now) / 86400000);
}

type Level = 'expired' | 'urgent' | 'warn' | 'ok' | 'none';

function expiryInfo(date: string | null): { label: string; level: Level; days: number | null } {
  if (!date) return { label: '无有效期', level: 'none', days: null };
  const days = daysBetween(date);
  if (days < 0) return { label: `已过期 ${-days} 天`, level: 'expired', days };
  if (days === 0) return { label: '今天到期', level: 'urgent', days };
  if (days <= 7) return { label: `${days} 天后到期`, level: 'urgent', days };
  if (days <= 30) return { label: `${days} 天后到期`, level: 'warn', days };
  return { label: date.slice(5).replace('-', '/'), level: 'ok', days };
}

const LEVEL_CLASS: Record<Level, string> = {
  expired: 'border-red-200 bg-red-50 text-red-600',
  urgent: 'border-amber-200 bg-amber-50 text-amber-700',
  warn: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  ok: 'border-border text-muted-foreground',
  none: 'border-border text-muted-foreground/70',
};

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
          className={cn(onChange && 'transition hover:scale-110', !onChange && 'cursor-default')}
          aria-label={`${n} 星`}
        >
          <Star className={cn(size, n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
        </button>
      ))}
    </span>
  );
}

export default function FoodPage() {
  const [items, setItems] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<'all' | FoodCategory>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Food | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  function applyScanPreview(file: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (file) {
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setScanPreview(url);
    } else {
      setScanPreview(null);
    }
  }

  async function handleScan(file: File) {
    applyScanPreview(file);
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/food/analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? '识别失败');
      const a = data.analysis as {
        name?: string;
        brand?: string | null;
        category?: FoodCategory;
        quantity?: number;
        unit?: string;
        expire_at?: string | null;
        notes?: string | null;
      };
      setForm((prev) => ({
        ...prev,
        name: a.name?.trim() || prev.name,
        brand: a.brand?.trim() || prev.brand,
        category: a.category ?? prev.category,
        quantity: a.quantity !== undefined ? String(a.quantity) : prev.quantity,
        unit: a.unit || prev.unit,
        expire_at: a.expire_at ?? prev.expire_at,
        notes: a.notes?.trim() || prev.notes,
      }));
      toast.success('已识别，核对一下再保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '识别失败，可以手动填写');
    } finally {
      setScanning(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/food');
      const data = await res.json();
      setItems(res.ok ? ((data.items ?? []) as Food[]) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const low = items.filter((it) => it.quantity <= it.min_quantity);
    const expiring = items.filter((it) => {
      const level = expiryInfo(it.expire_at).level;
      return level === 'expired' || level === 'urgent';
    });
    return { total: items.length, low, expiring };
  }, [items]);

  const catCounts = useMemo(() => {
    const map = new Map<FoodCategory, number>();
    items.forEach((it) => map.set(it.category, (map.get(it.category) ?? 0) + 1));
    return map;
  }, [items]);

  const filtered = useMemo(() => (cat === 'all' ? items : items.filter((it) => it.category === cat)), [items, cat]);

  const alertItems = useMemo(() => {
    const merged = new Map<string, Food>();
    [...stats.expiring, ...stats.low].forEach((it) => merged.set(it.id, it));
    return Array.from(merged.values())
      .sort((a, b) => {
        const da = expiryInfo(a.expire_at).days;
        const db = expiryInfo(b.expire_at).days;
        return (da ?? 99999) - (db ?? 99999);
      })
      .slice(0, 6);
  }, [stats]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    applyScanPreview(null);
    setDialogOpen(true);
  }

  function openEdit(item: Food) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      brand: item.brand ?? '',
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit ?? '件',
      min_quantity: String(item.min_quantity),
      expire_at: item.expire_at ?? '',
      rating: item.rating ?? 0,
      notes: item.notes ?? '',
    });
    applyScanPreview(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('名称是必填的');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        category: form.category,
        quantity: Math.max(0, Math.min(9999, Number(form.quantity) || 0)),
        unit: form.unit || '件',
        min_quantity: Math.max(0, Math.min(9999, Number(form.min_quantity) || 0)),
        expire_at: form.expire_at || null,
        rating: form.rating > 0 ? form.rating : null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(editingId ? `/api/food/${editingId}` : '/api/food', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '保存失败');
      } else {
        toast.success(editingId ? '已保存' : '已添加');
        setDialogOpen(false);
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setSaving(false);
      void load();
    }
  }

  async function adjust(item: Food, delta: number) {
    const next = Math.max(0, item.quantity + delta);
    if (next === item.quantity) return;
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/food/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? '更新失败');
      setItems((prev) => prev.map((it) => (it.id === item.id ? (data.item as Food) : it)));
      if (next === 0) toast.success(`「${item.name}」已清空`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(item: Food) {
    try {
      const res = await fetch(`/api/food/${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? '删除失败');
      setDeleteTarget(null);
      await load();
      toast.success('已删除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4 pb-24">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">食品库</h1>
        <p className="text-xs text-muted-foreground">
          共 {stats.total} 项
          {stats.expiring.length > 0 ? ` · ${stats.expiring.length} 项临期` : ''}
          {stats.low.length > 0 ? ` · ${stats.low.length} 项需补货` : ''}
        </p>
      </header>

      <Button className="w-full" onClick={openCreate}>
        <Plus className="mr-1 size-4" />
        添加食品
      </Button>

      {alertItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="space-y-2 p-3">
            <p className="text-xs font-medium text-amber-800">该处理一下了</p>
            {alertItems.map((it) => {
              const info = expiryInfo(it.expire_at);
              const low = it.quantity <= it.min_quantity;
              return (
                <button
                  key={it.id}
                  onClick={() => openEdit(it)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="truncate text-xs text-amber-900">{it.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-amber-700">
                    {low && <span>只剩 {it.quantity}{it.unit ?? '件'}</span>}
                    {info.level === 'expired' || info.level === 'urgent' ? <span>{info.label}</span> : null}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCat('all')}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition',
            cat === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
          )}
        >
          全部 {items.length}
        </button>
        {FOOD_CATEGORY_ORDER.map((key) => {
          const count = catCounts.get(key) ?? 0;
          if (count === 0 && cat !== key) return null;
          return (
            <button
              key={key}
              onClick={() => setCat(key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition',
                cat === key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
              )}
            >
              {FOOD_CATEGORY_LABELS[key]} {count}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <PackageOpen className="size-7 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {items.length === 0 ? '还没有记录食品，点上面「添加食品」开始' : '这个分类下还没有东西'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {filtered.map((it) => {
              const info = expiryInfo(it.expire_at);
              const low = it.quantity <= it.min_quantity;
              return (
                <div key={it.id} className="flex items-center gap-2 p-3">
                  <button onClick={() => openEdit(it)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{it.name}</span>
                      {low && (
                        <Badge variant="outline" className="shrink-0 border-red-200 bg-red-50 px-1 text-[10px] text-red-600">
                          需补货
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                      <span>{FOOD_CATEGORY_LABELS[it.category]}</span>
                      {it.brand ? <span>· {it.brand}</span> : null}
                      <span>
                        · 剩 {it.quantity}
                        {it.unit ?? '件'}
                      </span>
                      {it.rating ? (
                        <span className="flex items-center gap-0.5 text-amber-600">
                          <Star className="size-2.5 fill-amber-400 text-amber-400" />
                          {it.rating}
                        </span>
                      ) : null}
                    </p>
                  </button>

                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px]', LEVEL_CLASS[info.level])}>
                    {info.label}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void adjust(it, -1)}
                      disabled={togglingId === it.id || it.quantity === 0}
                      className="flex size-7 items-center justify-center rounded-full border text-muted-foreground disabled:opacity-40"
                      aria-label="减一"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <button
                      onClick={() => void adjust(it, 1)}
                      disabled={togglingId === it.id}
                      className="flex size-7 items-center justify-center rounded-full border text-muted-foreground disabled:opacity-40"
                      aria-label="加一"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        点名称可以改数量、有效期和打分；数量减到 0 就是吃完了
      </p>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑食品' : '添加食品'}</DialogTitle>
            <DialogDescription>记好数量和有效期，临期和缺货会在这里提醒你</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <input
                ref={scanRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleScan(f);
                }}
              />
              <button
                type="button"
                onClick={() => scanRef.current?.click()}
                disabled={scanning}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed bg-muted/40 p-3 text-left disabled:opacity-70"
              >
                {scanPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scanPreview} alt="待识别" className="size-12 rounded-lg object-cover" />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-lg bg-muted">
                    <Camera className="size-5 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{scanning ? '识别中…' : '拍照识别'}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {scanning ? '正在读取名称、类别和有效期' : '拍包装或实物，自动填好下面的信息'}
                  </span>
                </span>
                {scanning ? <Spinner className="shrink-0" /> : null}
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="food-name">名称 *</Label>
              <Input
                id="food-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：无糖酸奶"
                maxLength={100}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="food-brand">品牌</Label>
                <Input
                  id="food-brand"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  placeholder="可选"
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label>类别</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as FoodCategory })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOOD_CATEGORY_ORDER.map((key) => (
                      <SelectItem key={key} value={key}>
                        {FOOD_CATEGORY_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="food-qty">数量</Label>
                <Input
                  id="food-qty"
                  type="number"
                  min={0}
                  max={9999}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>单位</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOOD_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="food-min">少于多少提醒补货</Label>
                <Input
                  id="food-min"
                  type="number"
                  min={0}
                  max={9999}
                  value={form.min_quantity}
                  onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-exp">有效期至</Label>
                <Input
                  id="food-exp"
                  type="date"
                  value={form.expire_at}
                  onChange={(e) => setForm({ ...form, expire_at: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>好吃程度</Label>
              <Stars value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} size="size-6" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="food-notes">备注</Label>
              <Textarea
                id="food-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="如：山姆买的、要冷藏"
                rows={2}
                maxLength={200}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            {editingId ? (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  const target = items.find((it) => it.id === editingId);
                  if (target) {
                    setDialogOpen(false);
                    setDeleteTarget(target);
                  }
                }}
              >
                <Trash2 className="mr-1 size-4" />
                删除
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>删除后这条记录就没了，只吃完了可以改成数量 0 保留记录。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && void handleDelete(deleteTarget)}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
