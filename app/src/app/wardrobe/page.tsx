'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Plus, Shirt, Trash2 } from 'lucide-react';

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
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category, type ClothingItemWithUrl } from '@/lib/types';
import { InspirationSection } from '@/components/inspiration-section';

const STYLE_OPTIONS = [
  { value: 'casual', label: '休闲' },
  { value: 'business', label: '商务' },
  { value: 'formal', label: '正式' },
  { value: 'sport', label: '运动' },
  { value: 'fashion', label: '时尚' },
  { value: 'street', label: '街头' },
];
const FORMALITY_OPTIONS = [
  { value: '1', label: '1 · 运动休闲' },
  { value: '2', label: '2 · 偏休闲' },
  { value: '3', label: '3 · 日常通勤' },
  { value: '4', label: '4 · 偏正式' },
  { value: '5', label: '5 · 商务正式' },
];
const SEASON_OPTIONS = [
  { value: 'spring', label: '春' },
  { value: 'summer', label: '夏' },
  { value: 'autumn', label: '秋' },
  { value: 'winter', label: '冬' },
];
const THICKNESS_OPTIONS = [
  { value: 'thin', label: '薄款' },
  { value: 'medium', label: '适中' },
  { value: 'thick', label: '厚款' },
];

interface EditForm {
  name: string;
  category: Category;
  color: string;
  style: string;
  formality: string;
  season: string[];
  thickness: string;
  notes: string;
}

function toForm(item: ClothingItemWithUrl): EditForm {
  return {
    name: item.name,
    category: item.category,
    color: item.color ?? '',
    style: item.style ?? '',
    formality: item.formality ? String(item.formality) : '',
    season: item.season ?? [],
    thickness: item.thickness ?? '',
    notes: item.notes ?? '',
  };
}

export default function WardrobePage() {
  const [items, setItems] = useState<ClothingItemWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
  const [editing, setEditing] = useState<ClothingItemWithUrl | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<'items' | 'inspiration'>('items');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clothing');
      const data = await res.json();
      setItems(res.ok ? ((data.items ?? []) as ClothingItemWithUrl[]) : []);
      if (!res.ok) toast.error(data?.error ?? '加载衣橱失败');
    } catch {
      toast.error('网络异常，加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading({ current: 0, total: list.length });
    let ok = 0;
    let fail = 0;
    let partial = 0;
    for (let i = 0; i < list.length; i++) {
      setUploading({ current: i + 1, total: list.length });
      const fd = new FormData();
      fd.append('file', list[i]);
      try {
        const res = await fetch('/api/clothing/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          fail++;
          toast.error(data?.error ?? `第 ${i + 1} 张上传失败`);
        } else {
          ok++;
          if (data.analysis_error) partial++;
          setItems((prev) => [data.item as ClothingItemWithUrl, ...prev]);
        }
      } catch {
        fail++;
        toast.error(`第 ${i + 1} 张上传失败`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = '';
    if (ok > 0 && partial > 0) {
      toast.warning(`已添加 ${ok} 件，其中 ${partial} 件自动识别失败，请点开补充信息`);
    } else if (ok > 0) {
      toast.success(`已添加 ${ok} 件单品`);
    }
  };

  const openEdit = (item: ClothingItemWithUrl) => {
    setForm(toForm(item));
    setEditing(item);
  };

  const saveEdit = async () => {
    if (!editing || !form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clothing/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || '未命名单品',
          category: form.category,
          color: form.color.trim() || null,
          style: form.style || null,
          formality: form.formality ? Number(form.formality) : null,
          season: form.season.length > 0 ? form.season : null,
          thickness: form.thickness || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '保存失败');
      } else {
        setItems((prev) =>
          prev.map((it) => (it.id === editing.id ? { ...(data.item as ClothingItemWithUrl), image_url: editing.image_url } : it))
        );
        toast.success('已保存');
        setEditing(null);
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!editing) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clothing/${editing.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '删除失败');
      } else {
        setItems((prev) => prev.filter((it) => it.id !== editing.id));
        toast.success('已删除');
        setEditing(null);
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  return (
    <div className="space-y-4 p-4 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">我的衣橱</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? '加载中…' : `共 ${items.length} 件单品 · 拍照即可自动建档`}
          </p>
        </div>
      </header>

      {/* 视图切换：我的衣服 / 穿搭灵感 */}
      <div className="grid grid-cols-2 gap-1 rounded-full border bg-muted p-1">
        {(['items', 'inspiration'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              'rounded-full py-1.5 text-sm font-medium transition-colors',
              view === v ? 'bg-card shadow-sm' : 'text-muted-foreground'
            )}
          >
            {v === 'items' ? '我的衣服' : '穿搭灵感'}
          </button>
        ))}
      </div>

      {view === 'inspiration' ? (
        <InspirationSection />
      ) : (
      <>
      {/* 上传 */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button
        size="lg"
        className="w-full"
        onClick={() => fileRef.current?.click()}
        disabled={uploading !== null}
      >
        {uploading ? (
          <>
            <Spinner className="size-4" />
            正在识别 {uploading.current}/{uploading.total}…
          </>
        ) : (
          <>
            <Camera className="size-4" />
            拍照 / 上传衣服
          </>
        )}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        建议每件单品单独拍一张、平铺或挂拍效果最好。上传后 AI 会自动识别品类、颜色、风格和正式度，识别不准可以点开卡片修改。
      </p>

      {/* 品类筛选 */}
      {!loading && items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
              filter === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:border-primary/50'
            )}
          >
            全部 {items.length}
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const count = counts.get(cat) ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                  filter === cat
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:border-primary/50'
                )}
              >
                {CATEGORY_LABELS[cat]} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* 单品网格 */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Shirt className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {items.length === 0 ? '衣橱还是空的' : '这个分类下还没有单品'}
              <br />
              {items.length === 0 ? '拍几件衣服，AI 帮你建档' : '换个别的地方看看'}
            </p>
            {items.length === 0 && (
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Plus className="size-4" />
                添加第一件
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openEdit(item)}
              className="group space-y-1 text-left"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted transition-opacity group-hover:opacity-90">
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <Badge className="absolute bottom-1 left-1 px-1.5 py-0 text-[10px]" variant="secondary">
                  {CATEGORY_LABELS[item.category]}
                </Badge>
              </div>
              <p className="truncate text-xs font-medium">{item.name}</p>
              {item.color && <p className="truncate text-[10px] text-muted-foreground">{item.color}</p>}
            </button>
          ))}
        </div>
      )}
      </>
      )}

      {/* 编辑弹窗 */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          {editing && form && (
            <>
              <DialogHeader>
                <DialogTitle>编辑单品</DialogTitle>
                <DialogDescription>信息越准，推荐越合心意</DialogDescription>
              </DialogHeader>

              <div className="flex gap-4">
                <img
                  src={editing.image_url}
                  alt={editing.name}
                  className="h-24 w-24 shrink-0 rounded-lg border object-cover"
                />
                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-name">名称</Label>
                    <Input
                      id="edit-name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="如：白色衬衫"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>品类</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_ORDER.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {CATEGORY_LABELS[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-color">颜色</Label>
                  <Input
                    id="edit-color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    placeholder="如：藏青色"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>风格</Label>
                  <Select value={form.style || 'none'} onValueChange={(v) => setForm({ ...form, style: v === 'none' ? '' : v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择风格" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未设置</SelectItem>
                      {STYLE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>正式度</Label>
                  <Select
                    value={form.formality || 'none'}
                    onValueChange={(v) => setForm({ ...form, formality: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="1-5" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未设置</SelectItem>
                      {FORMALITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>厚度</Label>
                  <Select
                    value={form.thickness || 'none'}
                    onValueChange={(v) => setForm({ ...form, thickness: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择厚度" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未设置</SelectItem>
                      {THICKNESS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>适用季节</Label>
                <div className="flex gap-2">
                  {SEASON_OPTIONS.map((s) => {
                    const active = form.season.includes(s.value);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            season: active
                              ? form.season.filter((v) => v !== s.value)
                              : [...form.season, s.value],
                          })
                        }
                        className={cn(
                          'flex-1 rounded-md border py-1.5 text-sm transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-card text-muted-foreground hover:border-primary/50'
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">备注</Label>
                <Textarea
                  id="edit-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="材质、图案、搭配注意等（选填）"
                  rows={2}
                />
              </div>

              <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="size-4" />
                  删除
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    取消
                  </Button>
                  <Button type="button" onClick={saveEdit} disabled={saving}>
                    {saving && <Spinner className="size-4" />}
                    保存
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这件单品？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复；历史推荐里不会再出现它。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Spinner className="size-4" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
