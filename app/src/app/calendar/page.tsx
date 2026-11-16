'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsPanel } from '@/components/settings-panel';
import { toast } from 'sonner';
import { CATEGORY_LABELS, OCCASION_LABELS, type Occasion } from '@/lib/types';

interface DayRecord {
  wear_date: string;
  record_id: string;
  occasion: Occasion;
  reason: string | null;
  tips: string | null;
  user_adjusted: boolean;
  items: Array<{
    id: string;
    name: string;
    category: string;
    image_url: string;
  }>;
}

const WEEK_HEADS = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function CalendarPage() {
  const today = new Date();
  const [ym, setYm] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
  const [days, setDays] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async (month: string) => {
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/outfit/calendar?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setDays(data.days ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '日历加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(ym);
  }, [ym, load]);

  const [year, month] = ym.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  const daysMap = useMemo(() => {
    const map = new Map<string, DayRecord>();
    for (const d of days) map.set(d.wear_date, d);
    return map;
  }, [days]);

  const selectedRecord = selected ? daysMap.get(selected) : null;
  const totalDays = days.length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-start justify-between px-5 pt-8 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">穿搭日历</h1>
          <p className="mt-1 text-sm text-muted-foreground">记录每天实际穿了的搭配</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="设置"
          className="mt-0.5"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 className="size-5 text-muted-foreground" />
        </Button>
      </header>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>设置</DialogTitle>
            <DialogDescription>城市和着装惯例，决定每天怎么推荐</DialogDescription>
          </DialogHeader>
          <SettingsPanel />
        </DialogContent>
      </Dialog>

      <div className="px-5">
        {/* 月份切换 */}
        <div className="mb-4 flex items-center justify-between rounded-2xl border bg-card p-3">
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="上一个月">
            <ChevronLeft className="size-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{ym.replace('-', ' 年 ')} 月</span>
            {ym !== `${today.getFullYear()}-${pad(today.getMonth() + 1)}` && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-full text-xs"
                onClick={() => setYm(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`)}
              >
                今天
              </Button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="下一个月">
            <ChevronRight className="size-5" />
          </Button>
        </div>

        {/* 月历网格 */}
        <div className="rounded-2xl border bg-card p-3">
          <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
            {WEEK_HEADS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const dateStr = `${ym}-${pad(day)}`;
                const record = daysMap.get(dateStr);
                const isSelected = selected === dateStr;
                const isToday = dateStr === todayStr;
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelected(record ? (isSelected ? null : dateStr) : null)}
                    disabled={!record}
                    className={`relative flex min-h-14 flex-col items-center rounded-xl border p-1 transition-colors ${
                      record
                        ? `border-transparent bg-muted/70 hover:bg-muted ${isSelected ? 'ring-2 ring-primary' : ''}`
                        : 'border-transparent text-muted-foreground/50'
                    }`}
                  >
                    <span className={`self-start text-xs ${isToday ? 'font-bold text-primary' : ''}`}>{day}</span>
                    {record && (
                      <div className="mt-0.5 flex -space-x-1.5">
                        {record.items.slice(0, 2).map((it) =>
                          it.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={it.id}
                              src={it.image_url}
                              alt={it.name}
                              className="size-5 rounded-full border border-card object-cover"
                            />
                          ) : null
                        )}
                        {record.items.length > 2 && (
                          <span className="size-5 rounded-full border border-card bg-secondary text-[9px] leading-[18px]">
                            +{record.items.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {loading ? '加载中…' : totalDays > 0 ? `本月已记录 ${totalDays} 天穿搭` : '本月还没有打卡记录，采用推荐后这里就能看到'}
        </p>

        {/* 当日详情 */}
        {selectedRecord && (
          <div className="mt-4 rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {selectedRecord.wear_date.slice(5).replace('-', ' 月 ')} 日穿搭
              </h2>
              <div className="flex items-center gap-1.5">
                {selectedRecord.user_adjusted && <Badge variant="outline">手工调整</Badge>}
                <Badge variant="secondary">{OCCASION_LABELS[selectedRecord.occasion]}</Badge>
              </div>
            </div>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {selectedRecord.items.map((it) => (
                <div key={it.id} className="w-24 shrink-0">
                  <div className="aspect-square w-24 overflow-hidden rounded-xl bg-muted">
                    {it.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.name} className="size-full object-cover" />
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{it.name}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {(CATEGORY_LABELS as Record<string, string>)[it.category] ?? it.category}
                  </p>
                </div>
              ))}
            </div>
            {selectedRecord.reason && <p className="mt-2 text-sm leading-relaxed">{selectedRecord.reason}</p>}
            {selectedRecord.tips && <p className="mt-1 text-xs text-muted-foreground">💡 {selectedRecord.tips}</p>}
          </div>
        )}

        {/* 空状态引导 */}
        {!loading && days.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <CalendarDays className="size-8 text-muted-foreground/50" />
            <p>在「今日穿搭」里点击「就穿这套」完成打卡，</p>
            <p>当天穿搭就会出现在日历上。</p>
          </div>
        )}
      </div>
    </div>
  );
}
