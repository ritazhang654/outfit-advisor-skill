'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, MapPin, RefreshCw, Shirt, SlidersHorizontal, Sparkles, X } from 'lucide-react';

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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { OotdSection } from '@/components/ootd-section';
import { cn } from '@/lib/utils';
import { WEEKDAY_NAMES, weekdayOf, type ScheduleChoice } from '@/lib/occasion';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OCCASION_LABELS,
  type ClothingItemWithUrl,
  type OutfitRecordWithItems,
  type WeatherInfo,
} from '@/lib/types';

const SCHEDULES: Array<{ value: ScheduleChoice; label: string }> = [
  { value: 'auto', label: '按惯例' },
  { value: 'meeting', label: '开会·正式' },
  { value: 'outing', label: '外出·舒适' },
  { value: 'nice', label: '好看就行' },
];

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}月${d}日 ${WEEKDAY_NAMES[weekdayOf(date)]}`;
}

function weatherEmoji(desc: string): string {
  if (desc.includes('雷')) return '⛈️';
  if (desc.includes('雪')) return '❄️';
  if (desc.includes('雨')) return '🌧️';
  if (desc.includes('雾') || desc.includes('霾')) return '🌫️';
  if (desc.includes('阴')) return '☁️';
  if (desc.includes('云')) return '⛅';
  return '☀️';
}

export default function HomePage() {
  const [dateStr] = useState(tomorrowStr);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [needCity, setNeedCity] = useState(false);
  const [records, setRecords] = useState<OutfitRecordWithItems[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [history, setHistory] = useState<OutfitRecordWithItems[]>([]);
  const [schedule, setSchedule] = useState<ScheduleChoice>('auto');
  const [generating, setGenerating] = useState(false);
  const [wearingId, setWearingId] = useState<string | null>(null);

  // 手工调整推荐
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustIds, setAdjustIds] = useState<string[]>([]);
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [wardrobeItems, setWardrobeItems] = useState<ClothingItemWithUrl[]>([]);

  const loadWeather = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const res = await fetch(`/api/weather?date=${dateStr}`);
      const data = await res.json();
      if (!res.ok) {
        if (data?.need_city) setNeedCity(true);
        setWeather(null);
      } else {
        setNeedCity(false);
        setWeather(data.weather ?? null);
      }
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  }, [dateStr]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const res = await fetch(`/api/outfit/records?date=${dateStr}`);
      const data = await res.json();
      setRecords(res.ok ? ((data.records ?? []) as OutfitRecordWithItems[]) : []);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [dateStr]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/outfit/history');
      const data = await res.json();
      setHistory(res.ok ? ((data.records ?? []) as OutfitRecordWithItems[]) : []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadWeather();
    void loadRecords();
    void loadHistory();
  }, [loadWeather, loadRecords, loadHistory]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/outfit/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, schedule }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '生成失败，请重试');
      } else {
        toast.success('明天的穿搭选好了');
        await Promise.all([loadRecords(), loadWeather()]);
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const wear = async (recordId: string) => {
    setWearingId(recordId);
    try {
      const res = await fetch('/api/outfit/wear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '打卡失败');
      } else {
        toast.success('已打卡，明天就穿这套');
        setRecords((prev) => prev.map((r) => (r.id === recordId ? { ...r, status: 'worn' as const } : r)));
        void loadHistory();
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setWearingId(null);
    }
  };

  // ---- 手工调整 ----
  const openAdjust = async (record: OutfitRecordWithItems) => {
    setAdjustIds(record.item_ids);
    setAdjustNote(record.adjust_note ?? '');
    setAdjustOpen(true);
    try {
      const res = await fetch('/api/clothing');
      const data = await res.json();
      setWardrobeItems(res.ok ? ((data.items ?? []) as ClothingItemWithUrl[]) : []);
    } catch {
      setWardrobeItems([]);
    }
  };

  const itemById = (id: string) =>
    wardrobeItems.find((i) => i.id === id) ?? latest?.items.find((i) => i.id === id);

  const saveAdjust = async () => {
    if (!latest) return;
    const cats = new Set(
      adjustIds
        .map((id) => itemById(id)?.category ?? '')
        .filter((c) => c !== '')
    );
    if (!cats.has('dress') && !cats.has('top') && !cats.has('bottom')) {
      toast.error('搭配里至少要有一件上装、裤/裙或连衣裙');
      return;
    }
    setAdjustSaving(true);
    try {
      const res = await fetch('/api/outfit/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: latest.id, item_ids: adjustIds, note: adjustNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '保存调整失败');
      } else {
        toast.success('已保存，AI 会记住你的偏好');
        setRecords((prev) =>
          prev.map((r) =>
            r.id === latest.id
              ? {
                  ...r,
                  item_ids: adjustIds,
                  user_adjusted: true,
                  adjust_note: adjustNote || null,
                  items: adjustIds
                    .map((id) => itemById(id))
                    .filter((it): it is ClothingItemWithUrl => Boolean(it)),
                }
              : r
          )
        );
        setAdjustOpen(false);
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setAdjustSaving(false);
    }
  };

  const latest = records[0];

  return (
    <div className="space-y-4 p-4 pt-6">
      <header>
        <h1 className="text-xl font-semibold">明日穿搭</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatDisplayDate(dateStr)} · 根据天气和日程帮你搭配
        </p>
      </header>

      {/* 天气卡片 */}
      {weatherLoading ? (
        <Skeleton className="h-[88px] rounded-xl" />
      ) : needCity ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <p className="flex-1 text-sm text-muted-foreground">先设置所在城市，才能按天气推荐穿搭</p>
            <Button size="sm" asChild>
              <Link href="/settings">去设置</Link>
            </Button>
          </CardContent>
        </Card>
      ) : weather ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-card">
          <CardContent className="flex items-center justify-between p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{formatDisplayDate(weather.date)}</p>
              <p className="text-2xl font-semibold tracking-tight">
                {weather.temp_min}~{weather.temp_max}°C
              </p>
              <p className="text-sm text-muted-foreground">
                {weather.desc}
                {weather.precipitation_prob != null ? ` · 降水 ${weather.precipitation_prob}%` : ''}
              </p>
            </div>
            <span className="text-5xl" role="img" aria-label={weather.desc}>
              {weatherEmoji(weather.desc)}
            </span>
          </CardContent>
        </Card>
      ) : null}

      {/* 场景选择 */}
      <div className="flex gap-2 overflow-x-auto pb-0.5" role="radiogroup" aria-label="明日安排">
        {SCHEDULES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={schedule === s.value}
            onClick={() => setSchedule(s.value)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              schedule === s.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 推荐卡片 */}
      {recordsLoading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : latest ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={latest.status === 'worn' ? 'default' : 'secondary'}>
                  {latest.status === 'worn' ? '已打卡' : '推荐'}
                </Badge>
                <Badge variant="outline">{OCCASION_LABELS[latest.occasion]}</Badge>
              </div>
              {records.length > 1 && (
                <span className="text-xs text-muted-foreground">已换 {records.length} 套</span>
              )}
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {latest.items.map((item) => (
                <div key={item.id} className="w-24 shrink-0 space-y-1">
                  <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{item.name}</p>
                </div>
              ))}
            </div>

            {latest.reason && <p className="text-sm leading-relaxed">{latest.reason}</p>}
            {latest.tips && (
              <p className="rounded-lg bg-muted p-2.5 text-xs leading-relaxed text-muted-foreground">
                💡 {latest.tips}
              </p>
            )}

            {latest.status !== 'worn' && (
              <>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => openAdjust(latest)}>
                    <SlidersHorizontal className="size-4" />
                    调整
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={generate} disabled={generating}>
                    {generating ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                    换一套
                  </Button>
                </div>
                <Button className="w-full" onClick={() => wear(latest.id)} disabled={wearingId === latest.id}>
                  {wearingId === latest.id ? <Spinner className="size-4" /> : <Check className="size-4" />}
                  就穿这套
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Shirt className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              还没有明天的穿搭推荐
              <br />
              AI 会结合天气、日程和你的衣橱挑一套
            </p>
            <Button size="lg" onClick={generate} disabled={generating}>
              {generating ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
              {generating ? 'AI 正在挑选搭配…' : '生成明日穿搭'}
            </Button>
          </CardContent>
        </Card>
      )}

      {generating && latest && (
        <p className="text-center text-xs text-muted-foreground">AI 正在重新搭配，大约需要十几秒…</p>
      )}

      {/* 打卡历史 */}
      {history.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-sm font-medium text-muted-foreground">最近穿过的</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {history.map((r) => (
              <Card key={r.id} className="w-44 shrink-0">
                <CardContent className="space-y-2 p-3">
                  <p className="text-xs text-muted-foreground">
                    {r.wear_date.slice(5).replace('-', '/')} · {OCCASION_LABELS[r.occasion]}
                  </p>
                  <div className="flex -space-x-3">
                    {r.items.slice(0, 4).map((item) => (
                      <img
                        key={item.id}
                        src={item.image_url}
                        alt={item.name}
                        className="h-11 w-11 rounded-md border-2 border-card object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                  {r.reason && <p className="line-clamp-2 text-xs leading-relaxed">{r.reason}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <OotdSection />

      {/* 手工调整弹窗 */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>调整明天的搭配</DialogTitle>
            <DialogDescription>从衣橱里替换或增删单品，AI 会记住你的偏好</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">当前组合（点 × 移除，至少保留一件主件）</p>
              <div className="flex flex-wrap gap-2">
                {adjustIds.map((id) => {
                  const item = itemById(id);
                  return (
                    <span key={id} className="flex items-center gap-1.5 rounded-full border bg-muted/60 py-1 pl-1 pr-2 text-xs">
                      {item?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="size-6 rounded-full object-cover" />
                      ) : (
                        <span className="size-6 rounded-full bg-secondary" />
                      )}
                      <span className="max-w-24 truncate">{item?.name ?? '单品'}</span>
                      <button
                        onClick={() => setAdjustIds((prev) => prev.filter((x) => x !== id))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="移除"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  );
                })}
                {adjustIds.length === 0 && <span className="text-xs text-muted-foreground">还没有单品，从下面添加吧</span>}
              </div>
            </div>

            <div className="space-y-3">
              {CATEGORY_ORDER.map((cat) => {
                const candidates = wardrobeItems.filter((i) => i.category === cat && !adjustIds.includes(i.id));
                if (candidates.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      添加{CATEGORY_LABELS[cat]}
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {candidates.map((item) => (
                        <button
                          key={item.id}
                          onClick={() =>
                            setAdjustIds((prev) => (prev.length >= 8 ? prev : [...prev, item.id]))
                          }
                          className="w-16 shrink-0 text-left"
                        >
                          <div className="aspect-square w-16 overflow-hidden rounded-lg border bg-muted">
                            {item.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_url} alt={item.name} className="size-full object-cover" />
                            )}
                          </div>
                          <p className="mt-0.5 w-16 truncate text-[10px] text-muted-foreground">{item.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {adjustIds.length >= 8 && (
                <p className="text-xs text-muted-foreground">最多 8 件，先移除一些再添加</p>
              )}
            </div>

            <div>
              <Textarea
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="为什么这么改？写下来 AI 会学习你的偏好（可选）"
                rows={2}
                maxLength={200}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              取消
            </Button>
            <Button onClick={saveAdjust} disabled={adjustSaving}>
              {adjustSaving ? <Spinner className="size-4" /> : <Check className="size-4" />}
              保存调整
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
