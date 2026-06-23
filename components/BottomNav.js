'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CalendarDays, Package, Menu } from 'lucide-react';
import { useSidebarContext } from './SidebarContext';

/**
 * BottomNav — native-app-style bottom tab bar (mobile only).
 *
 * Shows the primary destinations as tabs plus a "More" button that opens the
 * full navigation drawer (the Sidebar) for everything else. Token-based so it
 * renders correctly in both the light and dark Homzentic themes, with an
 * accent active indicator, safe-area padding, and a frosted blur.
 */

const tabs = [
  { href: '/', label: 'Home', icon: LayoutDashboard, match: (p) => p === '/' },
  { href: '/leads', label: 'Leads', icon: Users, match: (p) => p === '/leads' || p.startsWith('/leads/') },
  { href: '/appointments', label: 'Visits', icon: CalendarDays, match: (p) => p.startsWith('/appointments') },
  { href: '/inventory', label: 'Stock', icon: Package, match: (p) => p.startsWith('/inventory') },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useSidebarContext();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[80] md:hidden border-t border-border bg-surface/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="navigation"
      aria-label="Primary"
    >
      <div className="flex items-stretch justify-around px-1 h-[60px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 touch-target select-none"
              aria-current={active ? 'page' : undefined}
            >
              {/* Active top indicator */}
              <span
                className={`absolute top-0 h-0.5 w-8 rounded-full bg-accent transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`}
              />
              <Icon
                className={`w-[22px] h-[22px] transition-colors ${active ? 'text-accent' : 'text-muted'}`}
                strokeWidth={active ? 2.4 : 2}
              />
              <span className={`text-[10px] font-medium leading-none transition-colors ${active ? 'text-accent' : 'text-muted'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* More — opens the full navigation drawer */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="relative flex flex-1 flex-col items-center justify-center gap-1 touch-target select-none"
          aria-haspopup="menu"
          aria-expanded={sidebarOpen}
          aria-label="More navigation"
        >
          <Menu className="w-[22px] h-[22px] text-muted transition-colors" strokeWidth={2} />
          <span className="text-[10px] font-medium leading-none text-muted">More</span>
        </button>
      </div>
    </nav>
  );
}
