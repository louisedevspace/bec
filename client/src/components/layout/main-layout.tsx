import { BottomNavigation } from "./bottom-navigation";
import { useLocation } from "wouter";
import { Logo } from "@/components/brand/logo";
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Home, Info, TrendingUp, RefreshCw, Zap, MessageSquare, User, Settings, Wallet, Bell } from "lucide-react";
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '@/hooks/use-theme';

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/about", label: "About", icon: Info },
  { path: "/market", label: "Markets", icon: TrendingUp },
  { path: "/exchange", label: "Exchange", icon: RefreshCw },
  { path: "/wallet", label: "Wallet", icon: Wallet },
  { path: "/futures", label: "Trading", icon: Zap },
  { path: "/support", label: "Support", icon: MessageSquare },
  { path: "/profile", label: "Profile", icon: User },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const { isDark } = useTheme();

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
        
        // Update localStorage with fresh role data
        const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
        const updatedProfile = { ...cachedProfile, role: freshProfile.role };
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
      } else {
        setIsAdmin(false);
      }
    } catch (error) {
      console.log('MainLayout - Admin access check error:', error);
      setIsAdmin(false);
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

  // Memoize auth page check
  const isAuthPage = useMemo(() => location === '/login' || location === '/signup' || location === '/reset-password', [location]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Top Navigation - desktop only */}
      {!isAuthPage && (
        <nav
          className={`hidden md:flex items-center justify-between px-6 h-16 backdrop-blur-xl sticky top-0 z-50 shadow-lg ${
            isDark
              ? 'bg-[#0a0a0a]/80 shadow-black/20'
              : 'bg-white/80 shadow-gray-300/30'
          }`}
          style={{ marginTop: 'var(--pwa-banner-top, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Gradient bottom border */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          
          {/* Logo Area */}
          <a href="/" className="flex items-center gap-3 group">
            <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-lg transition-all duration-300 group-hover:border-blue-500/40 group-hover:shadow-blue-500/20 ${
              isDark 
                ? 'bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-[#2a2a2a] shadow-black/30' 
                : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 shadow-blue-200/30'
            }`}>
              <Logo className="w-7 h-7" />
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span className={`font-bold text-xl tracking-tight bg-clip-text text-transparent transition-all duration-300 ${
              isDark 
                ? 'bg-gradient-to-r from-white to-gray-300 group-hover:from-blue-400 group-hover:to-blue-200' 
                : 'bg-gradient-to-r from-gray-900 to-gray-800 group-hover:from-blue-600 group-hover:to-blue-500'
            }`}>
              Becxus
            </span>
          </a>

          {/* Navigation Items */}
          <div className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <a
                key={path}
                href={path}
                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 overflow-hidden ${
                  location === path
                    ? isDark
                      ? "bg-gradient-to-r from-blue-500/20 to-blue-600/10 text-blue-400 shadow-lg shadow-blue-500/10"
                      : "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-600 shadow-lg shadow-blue-200/30"
                    : isDark
                      ? "text-gray-400 hover:text-white hover:bg-[#1a1a1a]/80"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-100/80"
                }`}
              >
                {location === path && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" />
                )}
                <Icon className={`h-4 w-4 transition-transform duration-300 ${location === path ? 'scale-110' : 'group-hover:scale-105'}`} />
                {label}
              </a>
            ))}
            {isAdmin && (
              <a
                href="/admin/dashboard"
                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 overflow-hidden ${
                  location.startsWith('/admin')
                    ? isDark
                      ? "bg-gradient-to-r from-blue-500/20 to-blue-600/10 text-blue-400 shadow-lg shadow-blue-500/10"
                      : "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-600 shadow-lg shadow-blue-200/30"
                    : isDark
                      ? "text-gray-400 hover:text-white hover:bg-[#1a1a1a]/80"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-100/80"
                }`}
              >
                {location.startsWith('/admin') && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" />
                )}
                <Settings className={`h-4 w-4 transition-transform duration-300 ${location.startsWith('/admin') ? 'scale-110' : ''}`} />
                Dashboard
              </a>
            )}

            {/* Separator */}
            <div className={`w-px h-6 mx-2 ${
              isDark 
                ? 'bg-gradient-to-b from-transparent via-[#2a2a2a] to-transparent' 
                : 'bg-gradient-to-b from-transparent via-gray-300 to-transparent'
            }`} />

            {/* Notification Bell for Desktop */}
            <button
              onClick={() => { setNotifCount(0); setLocation('/wallet'); }}
              className={`relative p-2.5 rounded-xl transition-all duration-300 ${
                isDark 
                  ? 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]/80' 
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100/80'
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              )}
            </button>
          </div>
        </nav>
      )}

      {/* Mobile top bar - logo + notification bell */}
      {!isAuthPage && (
        <div
          className={`flex md:hidden items-center justify-between px-4 h-14 backdrop-blur-xl sticky top-0 z-50 shadow-lg ${
            isDark
              ? 'bg-[#0a0a0a]/80 shadow-black/20'
              : 'bg-white/80 shadow-gray-300/30'
          }`}
          style={{ marginTop: 'var(--pwa-banner-top, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Gradient bottom border */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
          
          {/* Logo Area */}
          <a href="/" className="flex items-center gap-2.5">
            <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden shadow-md ${
              isDark 
                ? 'bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-[#2a2a2a] shadow-black/30' 
                : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 shadow-blue-200/30'
            }`}>
              <Logo className="w-6 h-6" />
            </div>
            <span className={`font-bold text-lg tracking-tight bg-clip-text text-transparent ${
              isDark 
                ? 'bg-gradient-to-r from-white to-gray-300' 
                : 'bg-gradient-to-r from-gray-900 to-gray-800'
            }`}>
              Becxus
            </span>
          </a>

          {/* Notification Bell */}
          <button
            onClick={() => { setNotifCount(0); setLocation('/wallet'); }}
            className={`relative p-2.5 rounded-xl transition-all duration-300 touch-manipulation ${
              isDark 
                ? 'bg-[#1a1a1a]/60 border border-[#2a2a2a]/50 text-gray-400 hover:text-white hover:bg-[#1a1a1a] hover:border-[#3a3a3a] active:bg-[#222]' 
                : 'bg-gray-100/60 border border-gray-200/50 text-gray-700 hover:text-gray-900 hover:bg-gray-100 hover:border-gray-300 active:bg-gray-200'
            }`}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {notifCount > 0 && (
              <span className={`absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse border-2 ${
                isDark ? 'border-[#0a0a0a]' : 'border-white'
              }`}>
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
          </button>
        </div>
      )}

      <main
        className={isAuthPage ? "" : "md:pb-0"}
        style={isAuthPage ? undefined : { paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </main>
      {/* Bottom Navigation - mobile only */}
      {!isAuthPage && <BottomNavigation />}
    </div>
  );
}
