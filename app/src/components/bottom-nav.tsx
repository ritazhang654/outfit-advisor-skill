'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brush, CalendarDays, CalendarHeart, CreditCard, Shirt, ShoppingBasket } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: '今日穿搭', icon: CalendarHeart },
  { href: '/calendar', label: '穿搭日历', icon: CalendarDays },
  { href: '/beauty', label: '美妆柜', icon: Brush },
  { href: '/food', label: '食品库', icon: ShoppingBasket },
  { href: '/wardrobe', label: '我的衣橱', icon: Shirt },
  { href: '/subscriptions', label: '订阅', icon: CreditCard },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex w-full max-w-lg">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
                active ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
