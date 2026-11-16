'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Brush, Camera, LayoutGrid, List, Pencil, Plus, TriangleAlert } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CosmeticCategory,
  CosmeticStatus,
  CosmeticSpec,
  CosmeticWithUrl,
  COSMETIC_CATEGORY_LABELS,
  COSMETIC_CATEGORY_ORDER,
  COSMETIC_SPEC_LABELS,
  COSMETIC_STATUS_LABELS,
  COSMETIC_SUBCATEGORIES,
} from '@/lib/types';

const SPEC_OPTIONS: CosmeticSpec[] = ['full', 'mid', 'sample'];
const STATUS_OPTIONS: CosmeticStatus[] = ['stock', 'in_use', 'done'];
const SHELF_OPTIONS = [6, 12, 18, 24, 36];
const EXPIRY_LEVEL_CLASS: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
};

interface CosmeticForm {
  name: string;
  brand: string;
  category: CosmeticCategory;
  subcategory: string;
  spec_type: CosmeticSpec;
  size: string;
  shade: string;
  quantity: string;
  status: CosmeticStatus;
  opened_at: string;
  shelf_months: string;
  expiry_date: string;
  notes: string;
}

const EMPTY_FORM: CosmeticForm = {
  name: '',
  brand: '',
  category: 'skincare',
  subcategory: 'other',
  spec_type: 'full',
  size: '',
  shade: '',
  quantity: '1',
  status: 'in_use',
  opened_at: '',
  shelf_months: '12',
  expiry_date: '',
  notes: '',
};

// AI 返回的细分类别（中文或 key）归一化为 key
function normalizeSub(category: CosmeticCategory, raw: string | null): string {
  if (!raw) return 'other';
  const subs = COSMETIC_SUBCATEGORIES[category];
  const byKey = subs.find((s) => s.key === raw);
  if (byKey) return byKey.key;
  const byLabel = subs.find((s) => s.label === raw);
  return byLabel ? byLabel.key : 'other';
}

function formFromItem(it: CosmeticWithUrl): CosmeticForm {
  return {
    name: it.name,
    brand: it.brand ?? '',
    category: it.category,
    subcategory: it.subcategory ?? 'other',
    spec_type: it.spec_type,
    size: it.size ?? '',
    shade: it.shade ?? '',
    quantity: String(it.quantity ?? 1),
    status: it.status,
    opened_at: it.opened_at ?? '',
    shelf_months: String(it.shelf_months ?? 12),
    expiry_date: it.expiry_date ?? '',
    notes: it.notes ?? '',
  };
}

// 保质期状态：包装印刷到期日 与 开封后计算到期日，取更早的一个
function expiryInfo(c: CosmeticWithUrl): { label: string; level: 'ok' | 'warn' | 'expired' | 'none'; days: number } {
  if (c.status === 'done') return { label: '已用完', level: 'none', days: Number.POSITIVE_INFINITY };
  const candidates: { days: number; from: 'printed' | 'opened' }[] = [];
  if (c.expiry_date) {
    const days = Math.ceil((new Date(`${c.expiry_date}T00:00:00`).getTime() - Date.now()) / 86400000);
    candidates.push({ days, from: 'printed' });
  }
  if (c.status === 'in_use' && c.opened_at) {
    const d = new Date(`${c.opened_at}T00:00:00`);
    d.setMonth(d.getMonth() + (c.shelf_months ?? 12));
    candidates.push({ days: Math.ceil((d.getTime() - Date.now()) / 86400000), from: 'opened' });
  }
  if (candidates.length === 0) {
    return { label: c.status === 'stock' ? '未开封' : '未记录有效期', level: 'none', days: Number.POSITIVE_INFINITY };
  }
  const worst = candidates.reduce((a, b) => (b.days < a.days ? b : a));
  if (worst.days < 0) return { label: `已过期 ${-worst.days} 天`, level: 'expired', days: worst.days };
  if (worst.days <= 30) return { label: `${worst.days} 天后到期`, level: 'warn', days: worst.days };
  return { label: worst.from === 'printed' ? `有效期剩 ${worst.days} 天` : `开封后剩 ${worst.days} 天`, level: 'ok', days: worst.days };
}

export default function BeautyPage() {
  const [items, setItems] = useState<CosmeticWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<CosmeticCategory | 'all'>('all');
  const [filterSub, setFilterSub] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [viewDone, setViewDone] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ key: string; url: string } | null>(null);
  const [form, setForm] = useState<CosmeticForm>(EMPTY_FORM);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CosmeticWithUrl | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/cosmetic');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? '加载失败');
      setItems(data.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doneItems = items.filter((c) => c.status === 'done');
  const activeItems = items.filter((c) => c.status !== 'done');
  const stats = {
    total: activeItems.length,
    skincare: activeItems.filter((c) => c.category === 'skincare').length,
    makeup: activeItems.filter((c) => c.category === 'makeup').length,
    perfume: activeItems.filter((c) => c.category === 'perfume').length,
    other: activeItems.filter((c) => c.category === 'other').length,
  };
  const alertItems = items
    .map((c) => ({ c, expiry: expiryInfo(c) }))
    .filter(({ expiry }) => expiry.level === 'expired' || expiry.level === 'warn')
    .sort((a, b) => a.expiry.days - b.expiry.days);
  const alertCount = alertItems.length;

  const subOptions = filterCat === 'all' ? [] : COSMETIC_SUBCATEGORIES[filterCat];
  const filtered = viewDone
    ? doneItems
    : activeItems.filter((c) => {
        if (filterCat !== 'all' && c.category !== filterCat) return false;
        if (filterCat !== 'all' && filterSub !== 'all' && c.subcategory !== filterSub) return false;
        return true;
      });
  const subCounts = new Map<string, number>();
  if (filterCat !== 'all') {
    for (const c of activeItems) {
      if (c.category !== filterCat || !c.subcategory) continue;
      subCounts.set(c.subcategory, (subCounts.get(c.subcategory) ?? 0) + 1);
    }
  }

  async function handleToggleDone(c: CosmeticWithUrl) {
    setTogglingId(c.id);
    try {
      const res = await fetch(`/api/cosmetic/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_use' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? '操作失败');
      } else {
        toast.success('已恢复为在用');
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setTogglingId(null);
      refresh();
    }
  }

  function openManualAdd() {
    setEditingId(null);
    setPendingImage(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  async function handleAnalyzeFile(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('请选择 jpg/png/webp 格式的图片');
      return;
    }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/cosmetic/analyze', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? '识别失败，请重试');
        return;
      }
      const analysis = data?.analysis ?? null;
      if (data?.analysis_error || !analysis) {
        toast.warning('没认出包装信息，手动填一下就行');
      } else {
        toast.success('识别完成，确认下信息再保存');
      }
      const cat: CosmeticCategory = COSMETIC_CATEGORY_ORDER.includes(analysis?.category)
        ? analysis.category
        : 'skincare';
      setEditingId(null);
      setPendingImage(data?.image_key ? { key: data.image_key, url: data.image_url ?? '' } : null);
      setForm({
        ...EMPTY_FORM,
        name: analysis?.name ?? '',
        brand: analysis?.brand ?? '',
        category: cat,
        subcategory: normalizeSub(cat, analysis?.subcategory ?? null),
        spec_type: SPEC_OPTIONS.includes(analysis?.spec_type) ? analysis.spec_type : 'full',
        size: analysis?.size ?? '',
        shade: analysis?.shade ?? '',
        quantity: analysis?.quantity && analysis.quantity > 1 ? String(analysis.quantity) : '1',
      });
      setDialogOpen(true);
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setAnalyzing(false);
    }
  }

  function openEdit(it: CosmeticWithUrl) {
    setEditingId(it.id);
    setPendingImage(it.image_key ? { key: it.image_key, url: it.image_url } : null);
    setForm(formFromItem(it));
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('请填写名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        category: form.category,
        subcategory: form.subcategory || null,
        spec_type: form.spec_type,
        size: form.size.trim() || null,
        shade: form.shade.trim() || null,
        quantity: Math.max(1, Math.min(999, Number(form.quantity) || 1)),
        status: form.status,
        opened_at: form.opened_at || null,
        shelf_months: Number(form.shelf_months) || 12,
        expiry_date: form.expiry_date || null,
        notes: form.notes.trim() || null,
      };
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/cosmetic/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/cosmetic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, image_key: pendingImage?.key ?? null }),
        });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? '保存失败');
        return;
      }
      toast.success(editingId ? '已更新' : '已加入美妆柜');
      setDialogOpen(false);
      refresh();
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      const res = await fetch(`/api/cosmetic/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? '删除失败');
      } else {
        toast.success('已删除');
      }
    } catch {
      toast.error('网络异常，请重试');
    }
    refresh();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Brush className="h-5 w-5" /> 美妆柜
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            共 {stats.total} 件 · 护肤 {stats.skincare} · 彩妆 {stats.makeup} · 香水 {stats.perfume} · 其他 {stats.other}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {alertCount > 0 && (
            <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-700" variant="outline">
              <TriangleAlert className="h-3.5 w-3.5" /> {alertCount} 件到期提醒
            </Badge>
          )}
          <div className="flex items-center rounded-md border">
            <button
              onClick={() => setView('grid')}
              aria-label="卡片视图"
              className={cn('rounded-l-md p-1.5 transition-colors', view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              aria-label="清单视图"
              className={cn('rounded-r-md p-1.5 transition-colors', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 到期总结：按剩余时间从紧到松 */}
      {alertCount > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="space-y-1.5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5" /> 到期提醒 · 越靠上越急
            </p>
            {alertItems.map(({ c, expiry }) => (
              <button
                key={c.id}
                onClick={() => openEdit(c)}
                className="flex w-full items-center justify-between gap-2 rounded text-left text-xs transition-opacity hover:opacity-75"
              >
                <span className="truncate">{c.name}{c.brand ? ` · ${c.brand}` : ''}</span>
                <Badge variant="outline" className={cn('shrink-0', EXPIRY_LEVEL_CLASS[expiry.level])}>
                  {expiry.label}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={analyzing} onClick={() => fileRef.current?.click()}>
          {analyzing ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {analyzing ? '识别中…' : '拍照添加'}
        </Button>
        <Button onClick={openManualAdd}>
          <Plus className="h-4 w-4" /> 手动添加
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAnalyzeFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* 大类筛选 */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(['all', ...COSMETIC_CATEGORY_ORDER] as const).map((cat) => {
          const count = cat === 'all' ? stats.total : stats[cat];
          const selected = !viewDone && filterCat === cat;
          return (
            <button
              key={cat}
              onClick={() => {
                setViewDone(false);
                setFilterCat(cat);
                setFilterSub('all');
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              {cat === 'all' ? '全部' : COSMETIC_CATEGORY_LABELS[cat]} {count}
            </button>
          );
        })}
        <button
          onClick={() => setViewDone((v) => !v)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            viewDone
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground'
          )}
        >
          已用完 {doneItems.length}
        </button>
      </div>
      {/* 子类筛选（联动） */}
      {subOptions.length > 0 && !viewDone && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterSub('all')}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              filterSub === 'all'
                ? 'border-foreground bg-foreground text-background'
                : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            全部
          </button>
          {subOptions.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilterSub(s.key)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                filterSub === s.key
                  ? 'border-foreground bg-foreground text-background'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              {s.label} {subCounts.get(s.key) ?? 0}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Brush className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{viewDone ? '还没有用完的物品' : '美妆柜还空着'}</p>
            <p className="text-xs text-muted-foreground">
              {viewDone
                ? '在编辑弹窗里把状态改成「已用完」，物品就会收进这里出库'
                : '拍一下包装正面，AI 认出名称、品牌、类别；认不出就手输名称，一样自动归类'}
            </p>
          </CardContent>
        </Card>
      ) : viewDone ? (
        <Card>
          <CardContent className="divide-y p-0">
            {doneItems.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 p-2.5">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-50 to-rose-100 text-sm text-rose-300">
                      {c.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.brand ?? '—'}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={togglingId === c.id}
                  onClick={() => handleToggleDone(c)}
                >
                  恢复在用
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : view === 'list' ? (
        <div className="space-y-4">
          {COSMETIC_CATEGORY_ORDER.filter((cat) => filtered.some((c) => c.category === cat)).map((cat) => {
            const groupItems = filtered.filter((c) => c.category === cat);
            return (
              <div key={cat}>
                <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {COSMETIC_CATEGORY_LABELS[cat]}
                  <span className="font-normal">{groupItems.length} 件</span>
                </p>
                <Card>
                  <CardContent className="divide-y p-0">
                    {groupItems.map((c) => {
                      const expiry = expiryInfo(c);
                      const subLabel =
                        COSMETIC_SUBCATEGORIES[c.category].find((s) => s.key === c.subcategory)?.label ??
                        COSMETIC_CATEGORY_LABELS[c.category];
                      return (
                        <button
                          key={c.id}
                          onClick={() => openEdit(c)}
                          className="flex w-full items-center gap-2.5 p-2.5 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                            {c.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-50 to-rose-100 text-sm text-rose-300">
                                {c.name.slice(0, 1)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[c.brand, subLabel, c.size, c.quantity > 1 ? `×${c.quantity}` : null].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {COSMETIC_SPEC_LABELS[c.spec_type]} · {COSMETIC_STATUS_LABELS[c.status]}
                            </Badge>
                            <Badge variant="outline" className={cn('text-[10px]', EXPIRY_LEVEL_CLASS[expiry.level])}>
                              {expiry.label}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((c) => {
            const expiry = expiryInfo(c);
            const subLabel =
              COSMETIC_SUBCATEGORIES[c.category].find((s) => s.key === c.subcategory)?.label ??
              COSMETIC_CATEGORY_LABELS[c.category];
            return (
              <Card
                key={c.id}
                className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
                onClick={() => openEdit(c)}
              >
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-pink-50 to-rose-100 text-rose-300">
                      <Brush className="h-7 w-7" />
                      <span className="text-3xl font-light">{c.name.slice(0, 1)}</span>
                    </div>
                  )}
                  <Badge
                    variant="outline"
                    className="absolute left-1.5 top-1.5 border-white/60 bg-black/45 text-[10px] text-white"
                  >
                    {COSMETIC_SPEC_LABELS[c.spec_type]}
                  </Badge>
                </div>
                <CardContent className="space-y-1.5 p-2.5">
                  <p className="truncate text-sm font-medium" title={c.name}>
                    {c.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.brand, subLabel, c.shade, c.quantity > 1 ? `×${c.quantity}` : null].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {COSMETIC_STATUS_LABELS[c.status]}
                    </Badge>
                    <Badge variant="outline" className={cn('text-[10px]', EXPIRY_LEVEL_CLASS[expiry.level])}>
                      {expiry.label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新增 / 编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑化妆品' : '加入美妆柜'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改信息后保存' : '拍照识别或手动填写都可以，带 * 的必填'}
            </DialogDescription>
          </DialogHeader>

          {pendingImage?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pendingImage.url}
              alt="包装图"
              className="mx-auto max-h-36 rounded-lg border object-contain"
            />
          )}

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>名称 *</Label>
              <Input
                placeholder="如：氨基酸洁面乳"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>品牌</Label>
                <Input
                  placeholder="如：雅诗兰黛"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>容量 / 净含量</Label>
                <Input
                  placeholder="如：50ml"
                  value={form.size}
                  onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>类别</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as CosmeticCategory, subcategory: 'other' }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COSMETIC_CATEGORY_ORDER.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {COSMETIC_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>细分类别</Label>
                <Select
                  value={form.subcategory || 'none'}
                  onValueChange={(v) => setForm((f) => ({ ...f, subcategory: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COSMETIC_SUBCATEGORIES[form.category].map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>规格</Label>
                <Select
                  value={form.spec_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, spec_type: v as CosmeticSpec }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEC_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {COSMETIC_SPEC_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>色号</Label>
                <Input
                  placeholder="口红/粉底可填，如 #999"
                  value={form.shade}
                  onChange={(e) => setForm((f) => ({ ...f, shade: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>数量</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as CosmeticStatus }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {COSMETIC_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>有效期至</Label>
                <Input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
                />
                <p className="text-[10px] leading-tight text-muted-foreground">包装上印的到期日，未开封也建议填</p>
              </div>
              <div className="space-y-1">
                <Label>开封日期</Label>
                <Input
                  type="date"
                  value={form.opened_at}
                  onChange={(e) => setForm((f) => ({ ...f, opened_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>开封后保质</Label>
                <Select
                  value={form.shelf_months}
                  onValueChange={(v) => setForm((f) => ({ ...f, shelf_months: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHELF_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} 个月
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.status === 'in_use' && (
                  <p className="text-[10px] leading-tight text-muted-foreground">
                    开封后 {form.shelf_months} 个月内用完最好
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>备注</Label>
              <Textarea
                rows={2}
                placeholder="使用感受、适合季节等，选填"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="mt-2 items-center gap-2 sm:justify-between">
            {editingId ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={saving}
                onClick={() => {
                  const target = items.find((i) => i.id === editingId) ?? null;
                  setDialogOpen(false);
                  setDeleting(target);
                }}
              >
                删除
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，包装图也会一并清除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
