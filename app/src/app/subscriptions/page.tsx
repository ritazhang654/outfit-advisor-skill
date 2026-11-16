'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, RefreshCw } from 'lucide-react';

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
  SUB_CATEGORY_LABELS,
  SUB_CATEGORY_ORDER,
  SUB_CYCLE_LABELS,
  SUB_CYCLE_PER_YEAR,
  type SubCategory,
  type SubCycle,
  type SubStatus,
  type Subscription,
} from '@/lib/types';

const CATEGORY_OPTIONS = ['all', ...SUB_CATEGORY_ORDER] as const;
const CYCLE_OPTIONS: SubCycle[] = ['monthly', 'quarterly', 'yearly', 'one_time'];

interface SubForm {
  name: string;
  vendor: string;
  category: SubCategory;
  cycle: SubCycle;
  price: string; // 单位：元
  expire_at: string;
  auto_renew: 'yes' | 'no';
  status: SubStatus;
  notes: string;
}

const EMPTY_FORM: SubForm = {
  name: '',
  vendor: '',
  category: 'other',
  cycle: 'yearly',
  price: '',
  expire_at: '',
  auto_renew: 'no',
  status: 'active',
  notes: '',
};

function formFromItem(it: Subscription): SubForm {
  return {
    name: it.name,
    vendor: it.vendor ?? '',
    category: it.category,
    cycle: it.cycle,
    price: it.price % 100 === 0 ? String(it.price / 100) : (it.price / 100).toFixed(2),
    expire_at: it.expire_at ?? '',
    auto_renew: it.auto_renew ? 'yes' : 'no',
    status: it.status,
    notes: it.notes ?? '',
  };
}

// 分 → 显示元
function fmtPrice(price: number): string {
  return price % 100 === 0 ? String(price / 100) : (price / 100).toFixed(2);
}

// 剩余天数
function daysLeft(expireAt: string | null): number | null {
  if (!expireAt) return null;
  const today = new Date(Date.now() + 8 * 3600 * 1000);
  const todayIso = today.toISOString().slice(0, 10);
  return Math.round((new Date(expireAt).getTime() - new Date(todayIso).getTime()) / 86400000);
}

type ExpiryLevel = 'expired' | 'urgent' | 'warn' | 'ok' | 'none';

const LEVEL_CLASS: Record<ExpiryLevel, string> = {
  expired: 'border-red-200 bg-red-50 text-red-600',
  urgent: 'border-red-200 bg-red-50 text-red-600',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
  ok: 'border-border text-muted-foreground',
  none: 'border-border text-muted-foreground',
};

function expiryInfo(it: Subscription): { label: string; level: ExpiryLevel; days: number } {
  const days = daysLeft(it.expire_at);
  if (days === null) return { label: '没填到期日', level: 'none', days: Number.POSITIVE_INFINITY };
  if (days < 0) return { label: `已过期 ${-days} 天`, level: 'expired', days };
  if (days === 0) return { label: '今天到期', level: 'urgent', days };
  if (days <= 7) return { label: `剩 ${days} 天`, level: 'urgent', days };
  if (days <= 30) return { label: `剩 ${days} 天`, level: 'warn', days };
  return { label: `剩 ${days} 天`, level: 'ok', days };
}

export default function SubscriptionsPage() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<'all' | SubCategory>('all');
  const [viewCancelled, setViewCancelled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SubForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription');
      const data = await res.json();
      if (res.ok) {
        setItems((data.items ?? []) as Subscription[]);
      } else {
        toast.error(data?.error ?? '读取订阅失败');
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeItems = items.filter((s) => s.status !== 'cancelled');
  const cancelledItems = items.filter((s) => s.status === 'cancelled');

  // 年化花费：包月×12、包季×4、包年×1；买断不计入
  const yearCost = activeItems.reduce(
    (sum, s) => sum + (s.price * SUB_CYCLE_PER_YEAR[s.cycle]) / 100,
    0
  );
  const monthlyCost = yearCost / 12;
  const monthlyStr =
    monthlyCost >= 10 ? String(Math.round(monthlyCost)) : (Math.round(monthlyCost * 10) / 10).toString();
  const soonCount = activeItems.filter((s) => {
    const d = daysLeft(s.expire_at);
    return d !== null && d <= 30;
  }).length;

  const catCount = (cat: SubCategory) => activeItems.filter((s) => s.category === cat).length;

  const listItems = viewCancelled
    ? cancelledItems
    : activeItems.filter((s) => filterCat === 'all' || s.category === filterCat);

  // 到期提醒：active 里已过期或 30 天内到期的，按天数升序
  const alertItems = activeItems
    .map((s) => ({ item: s, info: expiryInfo(s) }))
    .filter(({ info }) => info.level === 'expired' || info.level === 'urgent' || info.level === 'warn')
    .sort((a, b) => a.info.days - b.info.days);

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(it: Subscription) {
    setEditingId(it.id);
    setForm(formFromItem(it));
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('名称是必填的');
      return;
    }
    if (form.price.trim() && !(Number(form.price) >= 0)) {
      toast.error('费用格式不对');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        vendor: form.vendor.trim() || null,
        category: form.category,
        cycle: form.cycle,
        price: Math.round((Number(form.price) || 0) * 100),
        expire_at: form.expire_at || null,
        auto_renew: form.auto_renew === 'yes',
        status: form.status,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(editingId ? `/api/subscription/${editingId}` : '/api/subscription', {
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

  async function handleRenew(it: Subscription) {
    setRenewingId(it.id);
    try {
      const res = await fetch(`/api/subscription/${it.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renew: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '续费失败');
      } else {
        const item = data.item as Subscription;
        toast.success(`已续到 ${item.expire_at ?? ''}`);
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setRenewingId(null);
      void load();
    }
  }

  async function handleToggleCancelled(it: Subscription) {
    try {
      const res = await fetch(`/api/subscription/${it.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: it.status === 'cancelled' ? 'active' : 'cancelled' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? '操作失败');
      } else {
        toast.success(it.status === 'cancelled' ? '已恢复续费' : '已收进已取消');
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      void load();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/subscription/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? '删除失败');
      } else {
        toast.success('已删除');
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setDeleteTarget(null);
      void load();
    }
  }

  return (
    <div className="min-h-screen pb-20">
      <header className="flex items-start justify-between px-5 pt-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CreditCard className="size-6 text-primary" />
            订阅
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {items.length} 条
            {viewCancelled
              ? ` · 已取消 ${cancelledItems.length}`
              : ` · 月均 ¥${monthlyStr} · 一年约 ¥${fmtPrice(Math.round(yearCost * 100))}${soonCount > 0 ? ` · ${soonCount} 件 30 天内到期` : ''}`}
          </p>
        </div>
      </header>

      <div className="px-5 pt-4">
        <Button size="lg" className="w-full" onClick={openAdd}>
          ＋ 添加订阅
        </Button>
      </div>

      {/* 分类筛选 */}
      <div className="mb-4 flex flex-wrap gap-1.5 px-5 pt-4">
        {CATEGORY_OPTIONS.map((cat) => {
          const count = cat === 'all' ? activeItems.length : catCount(cat);
          const selected = !viewCancelled && filterCat === cat;
          return (
            <button
              key={cat}
              onClick={() => {
                setViewCancelled(false);
                setFilterCat(cat);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              {cat === 'all' ? '全部' : SUB_CATEGORY_LABELS[cat]} {count}
            </button>
          );
        })}
        <button
          onClick={() => setViewCancelled((v) => !v)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            viewCancelled
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground'
          )}
        >
          已取消 {cancelledItems.length}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 px-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : alertItems.length > 0 && !viewCancelled ? (
        <>
          <div className="px-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-amber-700">
                ⚠️ 到期提醒 · 越靠上越急
              </p>
              <div className="divide-y divide-amber-100">
                {alertItems.slice(0, 6).map(({ item, info }) => (
                  <button
                    key={item.id}
                    onClick={() => openEdit(item)}
                    className="flex w-full items-center justify-between py-1.5 text-left"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {item.name}
                      {item.vendor ? <span className="text-muted-foreground"> · {item.vendor}</span> : null}
                    </span>
                    <Badge variant="outline" className={cn('ml-2 shrink-0 text-[10px]', LEVEL_CLASS[info.level])}>
                      {info.label}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="space-y-3 px-5 pt-4">
        {loading ? null : listItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{viewCancelled ? '没有已取消的订阅' : '还没有记录订阅'}</p>
              <p className="text-xs text-muted-foreground">
                {viewCancelled
                  ? '在编辑弹窗里把状态改成「已取消」，订阅就会收进这里'
                  : '把 WPS、扣子会员这类按期付费的都记进来，到期前一眼能看到'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {listItems.map((s) => {
                const expiry = expiryInfo(s);
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3">
                    <button onClick={() => openEdit(s)} className="min-w-0 flex-1 text-left">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {s.name}
                        {s.auto_renew && s.status === 'active' && (
                          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                            自动续费
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          SUB_CATEGORY_LABELS[s.category],
                          `${SUB_CYCLE_LABELS[s.cycle]} ¥${fmtPrice(s.price)}`,
                          s.vendor ?? null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {s.status === 'active' ? (
                        <>
                          <Badge variant="outline" className={cn('text-[10px]', LEVEL_CLASS[expiry.level])}>
                            {expiry.label}
                          </Badge>
                          {s.cycle !== 'one_time' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 rounded-full px-2 text-[10px]"
                              disabled={renewingId === s.id}
                              onClick={() => handleRenew(s)}
                            >
                              {renewingId === s.id ? (
                                <Spinner className="size-3" />
                              ) : (
                                <RefreshCw className="mr-0.5 size-3" />
                              )}
                              续费
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 rounded-full px-2 text-[10px]"
                          onClick={() => handleToggleCancelled(s)}
                        >
                          恢复
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {viewCancelled && cancelledItems.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            点「恢复」可以重新启用；点名称进编辑也可以彻底删除
          </p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑订阅' : '添加订阅'}</DialogTitle>
            <DialogDescription>会员、套餐这类按期付费的都可以记</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>名称 *</Label>
              <Input
                placeholder="如：WPS 会员"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>商家</Label>
                <Input
                  placeholder="选填，如 金山"
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>类别</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v as SubCategory }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_CATEGORY_ORDER.map((c) => (
                      <SelectItem key={c} value={c}>
                        {SUB_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>计费方式</Label>
                <Select
                  value={form.cycle}
                  onValueChange={(v) => setForm((f) => ({ ...f, cycle: v as SubCycle }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLE_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {SUB_CYCLE_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>每期费用（元）</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="如 118"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>到期日</Label>
                <Input
                  type="date"
                  value={form.expire_at}
                  onChange={(e) => setForm((f) => ({ ...f, expire_at: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>自动续费</Label>
                <Select
                  value={form.auto_renew}
                  onValueChange={(v) => setForm((f) => ({ ...f, auto_renew: v as 'yes' | 'no' }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">是（记得按需关）</SelectItem>
                    <SelectItem value="no">否</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as SubStatus }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">在续</SelectItem>
                  <SelectItem value="cancelled">已取消（不再续）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] leading-tight text-muted-foreground">
                改成「已取消」就会收进单独的已取消区，不再计入花费
              </p>
            </div>
            <div className="space-y-1">
              <Label>备注</Label>
              <Textarea
                rows={2}
                placeholder="如：用哪个手机号登录的、怎么取消自动续费，选填"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {editingId && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  const target = items.find((i) => i.id === editingId) ?? null;
                  setDialogOpen(false);
                  setDeleteTarget(target);
                }}
              >
                删除
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Spinner className="size-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后不可恢复。只是不想续费了的话，建议改成「已取消」留个记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>先不删</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
