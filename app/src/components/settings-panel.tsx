'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { DEFAULT_WEEKDAY_RULES, WEEKDAY_NAMES } from '@/lib/occasion';
import type { UserSettings } from '@/lib/types';

const WEEKDAY_KEYS = ['1', '2', '3', '4', '5', '6', '0'];

const RULE_OPTIONS = [
  { value: 'formal', label: '正式 · 有会/见客户' },
  { value: 'nice', label: '好看 · 日常通勤' },
  { value: 'casual', label: '休闲 · 舒适放松' },
];

// 设置面板：城市 + 着装惯例。穿搭日历页右上角齿轮弹窗与 /settings 页共用
export function SettingsPanel() {
  const [city, setCity] = useState('');
  const [rules, setRules] = useState<Record<string, string>>({ ...DEFAULT_WEEKDAY_RULES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (res.ok) {
        const settings = data.settings as UserSettings;
        setCity(settings.city ?? '');
        setRules({ ...DEFAULT_WEEKDAY_RULES, ...(settings.weekday_rules ?? {}) });
      } else {
        toast.error(data?.error ?? '读取设置失败');
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

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city.trim(), weekday_rules: rules }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? '保存失败');
      } else {
        toast.success('设置已保存');
      }
    } catch {
      toast.error('网络异常，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">所在城市</CardTitle>
          <CardDescription>用于查询第二天天气，推荐时自动考虑温度和降雨</CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="city-input" className="sr-only">
            所在城市
          </Label>
          <Input
            id="city-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="如：上海"
            maxLength={50}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">着装惯例（按周几）</CardTitle>
          <CardDescription>
            「按惯例」推荐时生效；每天也可以在首页临时切换「开会 / 外出 / 好看」
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {WEEKDAY_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="w-10 text-sm font-medium">{WEEKDAY_NAMES[Number(key)]}</span>
              <Select
                value={rules[key] ?? 'casual'}
                onValueChange={(v) => setRules((prev) => ({ ...prev, [key]: v }))}
              >
                <SelectTrigger className="w-[220px] max-w-[60%]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={save} disabled={saving}>
        {saving && <Spinner className="size-4" />}
        保存设置
      </Button>
    </div>
  );
}
