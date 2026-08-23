import { BottomNavigation } from "./bottom-navigation";
import { useLocation } from "wouter";
import { Logo } from "@/components/brand/logo";
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Settings, Bell } from "lucide-react";
import { supabase } from '../../lib/supabaseClient';
import { isCachedSupportAgent } from '@/lib/user-role';
import { useExchangeName, useNavVisibility } from '@/hooks/use-exchange-name';
import { NAV_ITEMS } from '@/config/nav-items';
import { usePriceTickerStatus } from '@/hooks/use-price-ticker-status';
import { PriceTickerStrip } from '@/components/crypto/price-ticker-strip';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  // Seeded from the cached profile so support agents never see the customer
  // chrome flash before the role query resolves.
  const [isSupportAgent, setIsSupportAgent] = useState(isCachedSupportAgent);
  const [notifCount, setNotifCount] = useState(0);
  const exchangeName = useExchangeName();
  const navVisibility = useNavVisibility();
  const tickerStatus = usePriceTickerStatus();
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => navVisibility[item.key] !== false),
    [navVisibility]
  );

  // Memoize admin check to avoid unnecessary re-runs
  const checkAdminAccess = useCallback(async () => {
    try {
      // Get current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        return;
      }

      // Try to get fresh profile data from database
      const { data: freshProfile, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && freshProfile) {
        const hasAdminAccess = freshProfile.role === 'admin';
        setIsAdmin(hasAdminAccess);
        setIsSupportAgent(freshProfile.role === 'support');

        // Update localStorage with fresh role data
        const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
        const updatedProfile = { ...cachedProfile, role: freshProfile.role };
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
      } else {
        setIsAdmin(false);
        setIsSupportAgent(false);
      }
    } catch (error) {
      console.log('MainLayout - Admin access check error:', error);
      setIsAdmin(false);
      setIsSupportAgent(false);
    }
  }, []);

  useEffect(() => {
    checkAdminAccess();
  }, [checkAdminAccess]);

  // Fetch unread deposit notification count for user bell
  useEffect(() => {
    let cancelled = false;
    const fetchNotifCount = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setNotifCount(0); return; }
        const { count, error } = await supabase
          .from('deposit_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('hidden_for_user', false)
          .in('status', ['pending', 'approved', 'rejected']);
        if (!error && !cancelled) {
          setNotifCount(count ?? 0);
        }
      } catch { /* silent */ }
    };
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Memoize auth page check. Support agents never see the customer chrome —
  // their whole app is the support console.
  const isAuthPage = useMemo(
    () => isSupportAgent || location === '/login' || location === '/signup' || location === '/reset-password',
    [location, isSupportAgent]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isAuthPage && tickerStatus.data?.isEnabled && <PriceTickerStrip />}
      {/* Top Navigation - desktop only */}
      {!isAuthPage && (
        <nav
          className="hidden lg:flex items-center justify-between px-6 h-16 backdrop-blur-xl sticky top-0 z-50 bg-background/85 border-b border-border"
          style={{ marginTop: 'calc(var(--pwa-banner-top, 0px) + var(--ticker-height, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Logo Area */}
          <a href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-card border border-border transition-colors duration-200 group-hover:border-primary/40">
              <Logo className="w-7 h-7" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
              {exchangeName}
            </span>
          </a>

          {/* Navigation Items */}
          <div className="flex items-center gap-1">
            {visibleNavItems.map(({ key, path, label, icon: Icon }) => (
              <a
                key={key}
                href={path}
                className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  location === path
                    ? "bg-primary/10 text-primary animate-in fade-in zoom-in-95"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </a>
            ))}
            {isAdmin && (
              <a
                href="/admin/dashboard"
                className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  location.startsWith('/admin')
                    ? "bg-primary/10 text-primary animate-in fade-in zoom-in-95"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Settings className="h-4 w-4" />
                Dashboard
              </a>
            )}

            {/* Separator */}
            <div className="w-px h-6 mx-2 bg-border" />

            {/* Notification Bell for Desktop */}
            <button
              onClick={() => { setNotifCount(0); setLocation('/wallet'); }}
              className="relative p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              )}
            </button>
          </div>
        </nav>
      )}

      {/* Mobile/Tablet top bar - logo + bell */}
      {!isAuthPage && (
        <div
          className="flex lg:hidden items-center justify-between px-4 h-14 backdrop-blur-xl sticky top-0 z-50 bg-background/85 border-b border-border"
          style={{ marginTop: 'calc(var(--pwa-banner-top, 0px) + var(--ticker-height, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Logo Area */}
          <a href="/" className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden bg-card border border-border">
              <Logo className="w-6 h-6" />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">{exchangeName}</span>
          </a>

          {/* Notification Bell */}
          <button
            onClick={() => { setNotifCount(0); setLocation('/wallet'); }}
            className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
          </button>
        </div>
      )}

      <main
        className={isAuthPage ? "" : "lg:pb-0"}
        style={isAuthPage ? undefined : { paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </main>
      {/* Bottom Navigation - mobile only */}
      {!isAuthPage && <BottomNavigation />}
    </div>
  );
}
