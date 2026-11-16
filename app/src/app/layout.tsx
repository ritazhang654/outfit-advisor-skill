import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { BottomNav } from '@/components/bottom-nav';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '每日穿搭',
    template: '%s | 每日穿搭',
  },
  description: '智能衣橱与每日穿搭推荐：拍下你的衣服，每天自动搭配好第二天的穿搭。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-muted/40 text-foreground min-h-screen">
        <div className="mx-auto min-h-screen w-full max-w-lg pb-20">{children}</div>
        <BottomNav />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
