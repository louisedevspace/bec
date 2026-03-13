import { ReactNode, useState, useEffect, useRef } from 'react';
import { timeAgo } from '@/lib/date-utils';
import { Link, useLocation } from 'wouter';
import {
  Menu, X, LayoutDashboard, Users, MessageSquare, Settings,
  ChevronRight, LogOut, Shield, Megaphone, TrendingUp, Wallet,
  Bell, Check, CheckCheck, ExternalLink, Coins
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Logo } from '@/components/brand/logo';
import { useAdminNotifications, type AdminNotification } from '@/hooks/use-admin-notifications';
import { useAdminPendingCounts, type PendingCounts } from '@/hooks/use-admin-pending-counts';

// Map sidebar hrefs to notification categories (for admin notification events)
const CATEGORY_MAP: Record<string, string> = {
  '/admin/users': 'users',
  '/admin/wallets': 'wallets',
  '/admin/support': 'support',
  '/admin/dashboard': 'dashboard',
  '/admin/trading-pairs': 'trading_pairs',
};

// Compute pending badge count for each nav item from real DB counts
function getPendingBadge(key: string | undefined, counts: PendingCounts): number {
  if (!key) return 0;
  switch (key) {
    case 'dashboard': return counts.trades + counts.futures;
    case 'wallets': return counts.deposits + counts.withdrawals;
    case 'users': return counts.kyc + counts.loans;
    case 'support': return counts.support;
    default: return 0;
  }
}

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, description: 'Overview & Orders', badgeKey: 'dashboard' },
  { label: 'Users', href: '/admin/users', icon: Users, description: 'Manage Users', badgeKey: 'users' },
  { label: 'News', href: '/admin/news', icon: Megaphone, description: 'Announcements & Broadcasts' },
  { label: 'Notifications', href: '/admin/notifications/simple', icon: Megaphone, description: 'Send Notifications' },
  { label: 'Trading Pairs', href: '/admin/trading-pairs', icon: TrendingUp, description: 'Manage Trading Pairs' },
  { label: 'Staking', href: '/admin/staking', icon: Coins, description: 'Staking Management' },
  { label: 'Wallets', href: '/admin/wallets', icon: Wallet, description: 'User Wallet Management', badgeKey: 'wallets' },
  { label: 'Support', href: '/admin/support', icon: MessageSquare, description: 'Customer Support', badgeKey: 'support' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, description: 'Platform Config' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    categoryBadges,
    markAsRead,
    markAllAsRead,
    markCategoryRead,
  } = useAdminNotifications(30000);

  const { counts: pendingCounts, totalPending } = useAdminPendingCounts(15000);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setAdminEmail(session.user.email);
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

  // Auto-clear category badge when navigating to that section
  useEffect(() => {
    const cat = CATEGORY_MAP[location];
    if (cat && categoryBadges[cat] && categoryBadges[cat] > 0) {
      markCategoryRead(cat);
    }
  }, [location]);

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
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Mobile Top Bar */}
      <header className="lg:hidden fixed left-0 right-0 z-50 bg-[#111]/95 backdrop-blur-md border-b border-[#1e1e1e] shadow-sm" style={{ top: 'var(--pwa-banner-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#1a1a1a] active:bg-[#222] transition-colors"
            >
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2">
              <Logo className="w-7 h-7" />
              <span className="font-bold text-white text-sm">Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile Bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#1a1a1a] active:bg-[#222] transition-colors touch-manipulation"
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[20px] h-[20px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center text-white text-xs font-bold">
              {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Notification Panel - Rendered outside desktop header for mobile access */}
      {bellOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]" onClick={() => setBellOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          {/* Panel */}
          <div
            className="absolute left-2 right-2 bg-[#161616] border border-[#2a2a2a] rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden max-h-[70vh]"
            style={{ top: 'calc(var(--pwa-banner-top, 0px) + 60px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#222] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-blue-400" />
                <span className="text-sm font-semibold text-white">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors p-1.5 rounded-lg active:bg-blue-500/10 touch-manipulation"
                  >
                    <CheckCheck size={14} />
                    Read all
                  </button>
                )}
                <button
                  onClick={() => setBellOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1a1a] active:bg-[#222] transition-colors touch-manipulation"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Bell size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 20).map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`
                      w-full text-left px-4 py-3.5 border-b border-[#1e1e1e] hover:bg-[#1a1a1a] active:bg-[#222] transition-colors flex items-start gap-3 touch-manipulation min-h-[56px]
                      ${!n.is_read ? 'bg-blue-500/5' : ''}
                    `}
                  >
                    <div className="mt-1.5 flex-shrink-0">
                      {!n.is_read ? (
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${!n.is_read ? 'text-white' : 'text-gray-400'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-600">{timeAgo(n.created_at)}</span>
                        {n.link && <ExternalLink size={10} className="text-gray-600" />}
                      </div>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                        className="p-2 rounded-lg text-gray-500 hover:text-blue-400 active:bg-blue-500/10 transition-colors flex-shrink-0 touch-manipulation"
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
          className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full bg-[#111] border-r border-[#1e1e1e]
          flex flex-col transition-all duration-300 ease-in-out shadow-xl lg:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:z-30
          ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-64'}
          w-72
        `}
      >
        {/* Sidebar Header */}
        <div className={`flex items-center h-16 border-b border-[#1e1e1e] ${isCollapsed ? 'justify-center px-2' : 'px-5'}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                <Logo className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-white text-sm tracking-tight">Becxus Admin</h1>
                <p className="text-[10px] text-gray-400 font-medium">Management Panel</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Logo className="w-6 h-6" />
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-colors"
          >
            <X size={18} />
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-colors"
          >
            <ChevronRight size={16} className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = location.startsWith(item.href);
            const Icon = item.icon;
            const badgeCount = getPendingBadge(item.badgeKey, pendingCounts);
            return (
              <Link
                href={item.href}
                key={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  group flex items-center gap-3 rounded-xl transition-all duration-200
                  ${isCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'}
                  ${isActive
                    ? 'bg-blue-500/10 text-blue-400 shadow-sm ring-1 ring-blue-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
                  }
                `}
                title={isCollapsed ? `${item.label}${badgeCount ? ` (${badgeCount})` : ''}` : undefined}
              >
                <div className={`
                  relative flex items-center justify-center rounded-lg flex-shrink-0 w-8 h-8
                  ${isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-white'}
                `}>
                  <Icon size={20} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-400' : ''}`}>
                      {item.label}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">{item.description}</p>
                  </div>
                )}
                {!isCollapsed && isActive && (
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className={`border-t border-[#1e1e1e] ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-300 truncate">Administrator</p>
                <p className="text-[10px] text-gray-500 truncate">{adminEmail}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={`
              flex items-center gap-2 w-full rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200
              ${isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'}
            `}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut size={18} />
            {!isCollapsed && <span className="text-sm font-medium">Log Out</span>}
          </button>
          {!isCollapsed && (
            <p className="text-[10px] text-gray-600 text-center mt-3">&copy; {new Date().getFullYear()} Becxus</p>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${isCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64'}`}>
        {/* Desktop Top Bar */}
        <header className="hidden lg:flex items-center justify-between h-16 bg-[#111]/95 backdrop-blur-md border-b border-[#1e1e1e] px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {currentPage && (
              <>
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <currentPage.icon size={18} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-white text-sm">{currentPage.label}</h2>
                  <p className="text-[11px] text-gray-500">{currentPage.description}</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-colors"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {bellOpen && (
                <div className="absolute right-0 top-12 w-96 max-h-[480px] bg-[#161616] border border-[#2a2a2a] rounded-2xl shadow-2xl shadow-black/60 z-50 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-blue-400" />
                      <span className="text-sm font-semibold text-white">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <CheckCheck size={13} />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="flex-1 overflow-y-auto max-h-[380px]">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <Bell size={32} className="mb-2 opacity-30" />
                        <p className="text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.slice(0, 20).map(n => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`
                            w-full text-left px-4 py-3 border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors flex items-start gap-3
                            ${!n.is_read ? 'bg-blue-500/5' : ''}
                          `}
                        >
                          {/* Unread dot */}
                          <div className="mt-1.5 flex-shrink-0">
                            {!n.is_read ? (
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            ) : (
                              <div className="w-2 h-2 rounded-full" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${!n.is_read ? 'text-white' : 'text-gray-400'}`}>
                              {n.title}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{n.message}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-gray-600">{timeAgo(n.created_at)}</span>
                              {n.link && <ExternalLink size={10} className="text-gray-600" />}
                            </div>
                          </div>
                          {!n.is_read && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                              className="p-1 rounded text-gray-500 hover:text-blue-400 transition-colors flex-shrink-0"
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

            <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-1.5 rounded-lg border border-[#2a2a2a]">
              <Shield size={14} className="text-blue-400" />
              <span className="text-xs text-gray-300 font-medium">{adminEmail}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 md:p-6 lg:p-8 pt-[72px] lg:pt-6 min-h-[calc(100vh-4rem)] bg-[#0a0a0a]">
          {children}
        </main>
      </div>
    </div>
  );
}
