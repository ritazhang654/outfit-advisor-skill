'use client';

import { SettingsPanel } from '@/components/settings-panel';

export default function SettingsPage() {
  return (
    <div className="p-4 pt-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">城市和着装惯例，决定每天怎么推荐</p>
      </header>
      <SettingsPanel />
    </div>
  );
}
