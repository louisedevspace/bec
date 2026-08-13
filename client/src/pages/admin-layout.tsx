import { ReactNode, useState, useEffect, useRef } from 'react';
import { timeAgo } from '@/lib/date-utils';
import { Link, useLocation } from 'wouter';
import {
  Menu, X, LayoutDashboard, Users, MessageSquare, Settings,
  ChevronRight, LogOut, Shield, Megaphone, TrendingUp, Wallet,
  Bell, Check, CheckCheck, ExternalLink, Coins, CircleDot, Headphones, Gift
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Logo } from '@/components/brand/logo';
import { useAdminNotifications, type AdminNotification } from '@/hooks/use-admin-notifications';
import { useAdminPendingCounts, type BadgeKey } from '@/hooks/use-admin-pending-counts';
import { getCachedUserRole } from '@/lib/user-role';
import { useExchangeName } from '@/hooks/use-exchange-name';

// Map sidebar hrefs to badge keys for acknowledgment tracking
const HREF_TO_BADGE_KEY: Record<string, BadgeKey> = {
  '/admin/dashboard': 'dashboard',
  '/admin/wallets': 'wallets',
  '/admin/users': 'users',
  '/admin/support': 'support',
};

// `supportStaff: true` marks the pages a 'support' role account may open.
// Everything else is admin-only and is hidden from support agents.
const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, description: 'Overview & Orders', badgeKey: 'dashboard' as BadgeKey },
  { label: 'Users', href: '/admin/users', icon: Users, description: 'Manage Users', badgeKey: 'users' as BadgeKey },
  { label: 'News', href: '/admin/news', icon: Megaphone, description: 'Announcements & Broadcasts' },
  { label: 'Notifications', href: '/admin/notifications/simple', icon: Megaphone, description: 'Send Notifications' },
  { label: 'Trading Pairs', href: '/admin/trading-pairs', icon: TrendingUp, description: 'Manage Trading Pairs' },
  { label: 'Staking', href: '/admin/staking', icon: Coins, description: 'Staking Management' },
  { label: 'Gold Trading', href: '/admin/gold', icon: CircleDot, description: 'Gold Trade Management' },
  { label: 'Wallets', href: '/admin/wallets', icon: Wallet, description: 'User Wallet Management', badgeKey: 'wallets' as BadgeKey },
  { label: 'Referrals', href: '/admin/referrals', icon: Gift, description: 'Referral Program Oversight' },
  { label: 'Support', href: '/admin/support', icon: MessageSquare, description: 'Customer Support', badgeKey: 'support' as BadgeKey, supportStaff: true },
  { label: 'Support Agents', href: '/admin/support-agents', icon: Headphones, description: 'Chat Support Accounts' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, description: 'Platform Config' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const exchangeName = useExchangeName();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  // Seeded from the cached profile so the first paint already knows the role.
  // Without this the full admin nav renders for a frame before the role query
  // resolves, flashing admin-only items at support agents.
  const [viewerRole, setViewerRole] = useState<string | null>(getCachedUserRole);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Support agents can only reach the support inbox — the admin-only
  // Both endpoints now accept support agents too (server-side scoped to the
  // 'support' category/count only), so polling stays on for both roles.
  const isSupportAgent = viewerRole === 'support';
  const roleResolved = viewerRole !== null;

  const {
    notifications,
    unreadCount,
    categoryBadges,
    markAsRead,
    markAllAsRead,
    markCategoryRead,
  } = useAdminNotifications(30000);

  const { counts: pendingCounts, totalPending, getBadgeCount, acknowledgeSection } =
    useAdminPendingCounts(15000);

  // Until the role is known, show placeholders rather than the admin items —
  // guessing wrong for one frame is exactly the flash we're avoiding.
  const visibleNavItems = roleResolved
    ? navItems.filter(item => !isSupportAgent || item.supportStaff)
    : [];

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.email) setAdminEmail(session.user.email);
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      setViewerRole(data?.role ?? null);
    });
  }, []);

  // Close bell dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    if (bellOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bellOpen]);

  // Auto-acknowledge section badge when navigating to that section
  useEffect(() => {
    const badgeKey = HREF_TO_BADGE_KEY[location];
    if (badgeKey) {
      acknowledgeSection(badgeKey);
    }
    // Also mark notification category as read if applicable
    const categoryMap: Record<string, string> = {
      '/admin/users': 'users',
      '/admin/wallets': 'wallets',
      '/admin/support': 'support',
      '/admin/dashboard': 'dashboard',
    };
    const cat = categoryMap[location];
    if (cat && categoryBadges[cat] && categoryBadges[cat] > 0) {
      markCategoryRead(cat);
    }
  }, [location, acknowledgeSection, categoryBadges, markCategoryRead]);

  const handleNotificationClick = async (n: AdminNotification) => {
    if (!n.is_read) await markAsRead(n.id);
    if (n.link) setLocation(n.link);
    setBellOpen(false);
  };

  // timeAgo imported from @/lib/date-utils

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const currentPage = navItems.find(item => location.startsWith(item.href));

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Top Bar */}
      <header className="lg:hidden fixed left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b border-border shadow-sm" style={{ top: 'var(--pwa-banner-top, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:bg-accent transition-colors"
            >
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2">
              <Logo className="w-7 h-7" />
              <span className="font-bold text-foreground text-sm">{isSupportAgent ? 'Support' : 'Admin'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile Bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:bg-accent transition-colors touch-manipulation"
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[20px] h-[20px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground text-xs font-bold">
              {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Notification Panel - Rendered outside desktop header for mobile access */}
      {bellOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]" onClick={() => setBellOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          {/* Panel */}
          <div
            className="absolute left-2 right-2 bg-popover border border-border rounded-xl shadow-sm flex flex-col overflow-hidden max-h-[70vh]"
            style={{ top: 'calc(var(--pwa-banner-top, 0px) + 60px + env(safe-area-inset-top, 0px))' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors p-1.5 rounded-lg active:bg-primary/10 touch-manipulation"
                  >
                    <CheckCheck size={14} />
                    Read all
                  </button>
                )}
                <button
                  onClick={() => setBellOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:bg-accent transition-colors touch-manipulation"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Bell size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 20).map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`
                      w-full text-left px-4 py-3.5 border-b border-border hover:bg-muted active:bg-accent transition-colors flex items-start gap-3 touch-manipulation min-h-[56px]
                      ${!n.is_read ? 'bg-primary/5' : ''}
                    `}
                  >
                    <div className="mt-1.5 flex-shrink-0">
                      {!n.is_read ? (
                        <div className="w-2.5 h-2.5 bg-primary rounded-full" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground/70">{timeAgo(n.created_at)}</span>
                        {n.link && <ExternalLink size={10} className="text-muted-foreground/70" />}
                      </div>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                        className="p-2 rounded-lg text-muted-foreground hover:text-primary active:bg-primary/10 transition-colors flex-shrink-0 touch-manipulation"
                        title="Mark as read"
                      >
                        <Check size={16} />
                      </button>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/70 z-50 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full bg-card border-r border-border
          flex flex-col transition-all duration-300 ease-in-out shadow-sm lg:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:z-30
          ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-64'}
          w-72
        `}
      >
        {/* Sidebar Header */}
        <div className={`flex items-center h-16 border-b border-border ${isCollapsed ? 'justify-center px-2' : 'px-5'}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center">
                <Logo className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-foreground text-sm tracking-tight">
                  {isSupportAgent ? `${exchangeName} Support` : `${exchangeName} Admin`}
                </h1>
                <p className="text-[10px] text-muted-foreground font-medium">
                  {isSupportAgent ? 'Support Console' : 'Management Panel'}
                </p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-9 h-9 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center">
              <Logo className="w-6 h-6" />
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronRight size={16} className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {!roleResolved && (
            <div className="space-y-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          )}
          {visibleNavItems.map(item => {
            const isActive = location.startsWith(item.href);
            const Icon = item.icon;
            const badgeCount = item.badgeKey ? getBadgeCount(item.badgeKey) : 0;
            return (
              <Link
                href={item.href}
                key={item.href}
                onClick={() => {
                  setSidebarOpen(false);
                  // Acknowledge this section when clicked
                  if (item.badgeKey) {
                    acknowledgeSection(item.badgeKey);
                  }
                }}
                className={`
                  group flex items-center gap-3 rounded-xl transition-all duration-200
                  ${isCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'}
                  ${isActive
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }
                `}
                title={isCollapsed ? `${item.label}${badgeCount ? ` (${badgeCount})` : ''}` : undefined}
              >
                <div className={`
                  relative flex items-center justify-center rounded-lg flex-shrink-0 w-8 h-8
                  ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}
                `}>
                  <Icon size={20} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                      {item.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
                  </div>
                )}
                {!isCollapsed && isActive && (
                  <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className={`border-t border-border ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">
                  {isSupportAgent ? 'Support Agent' : 'Administrator'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{adminEmail}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={`
              flex items-center gap-2 w-full rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200
              ${isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'}
            `}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut size={18} />
            {!isCollapsed && <span className="text-sm font-medium">Log Out</span>}
          </button>
          {!isCollapsed && (
            <p className="text-[10px] text-muted-foreground/70 text-center mt-3">&copy; {new Date().getFullYear()} {exchangeName}</p>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${isCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64'}`}>
        {/* Desktop Top Bar */}
        <header className="hidden lg:flex items-center justify-between h-16 bg-card/95 backdrop-blur-md border-b border-border px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {currentPage && (
              <>
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <currentPage.icon size={18} className="text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground text-sm">{currentPage.label}</h2>
                  <p className="text-[11px] text-muted-foreground">{currentPage.description}</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {bellOpen && (
                <div className="absolute right-0 top-12 w-96 max-h-[480px] bg-popover border border-border rounded-xl shadow-sm z-50 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-primary" />
                      <span className="text-sm font-semibold text-foreground">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-bold">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                      >
                        <CheckCheck size={13} />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="flex-1 overflow-y-auto max-h-[380px]">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Bell size={32} className="mb-2 opacity-30" />
                        <p className="text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.slice(0, 20).map(n => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`
                            w-full text-left px-4 py-3 border-b border-border hover:bg-muted transition-colors flex items-start gap-3
                            ${!n.is_read ? 'bg-primary/5' : ''}
                          `}
                        >
                          {/* Unread dot */}
                          <div className="mt-1.5 flex-shrink-0">
                            {!n.is_read ? (
                              <div className="w-2 h-2 bg-primary rounded-full" />
                            ) : (
                              <div className="w-2 h-2 rounded-full" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {n.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{n.message}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground/70">{timeAgo(n.created_at)}</span>
                              {n.link && <ExternalLink size={10} className="text-muted-foreground/70" />}
                            </div>
                          </div>
                          {!n.is_read && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                              className="p-1 rounded text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                              title="Mark as read"
                            >
                              <Check size={14} />
                            </button>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border border-border">
              <Shield size={14} className="text-primary" />
              <span className="text-xs text-foreground font-medium">{adminEmail}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        {/* Mobile spacer: accounts for fixed admin header + safe-area-inset-top */}
        <div className="lg:hidden" style={{ height: 'calc(56px + env(safe-area-inset-top, 0px))' }} />
        <main className="p-4 md:p-6 lg:p-8 lg:pt-6 min-h-[calc(100vh-4rem)] bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
