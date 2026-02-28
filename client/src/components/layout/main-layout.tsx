import { BottomNavigation } from "./bottom-navigation";
import { useLocation } from "wouter";
import { Logo } from "@/components/brand/logo";
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Home, Info, TrendingUp, RefreshCw, Zap, MessageSquare, User, Settings } from "lucide-react";
import { supabase } from '../../lib/supabaseClient';

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/about", label: "About", icon: Info },
  { path: "/market", label: "Markets", icon: TrendingUp },
  { path: "/exchange", label: "Exchange", icon: RefreshCw },
  { path: "/futures", label: "Trading", icon: Zap },
  { path: "/support", label: "Support", icon: MessageSquare },
  { path: "/profile", label: "Profile", icon: User },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

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
        // Fallback to localStorage
        const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
        const hasAdminAccess = cachedProfile?.role === 'admin';
        setIsAdmin(hasAdminAccess);
      }
    } catch (error) {
      console.log('MainLayout - Admin access check error:', error);
      // Fallback to localStorage
      const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
      const hasAdminAccess = cachedProfile?.role === 'admin';
      setIsAdmin(hasAdminAccess);
    }
  }, []);

  useEffect(() => {
    checkAdminAccess();
  }, [checkAdminAccess]);

  // Memoize auth page check
  const isAuthPage = useMemo(() => location === '/login' || location === '/signup', [location]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Top Navigation - desktop only */}
      {!isAuthPage && (
        <nav className="hidden md:flex items-center justify-between px-6 h-14 border-b border-[#1e1e1e] bg-[#0a0a0a]/95 backdrop-blur-md sticky top-0 z-50" style={{ marginTop: 'var(--pwa-banner-top, 0px)' }}>
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#111] border border-[#2a2a2a] rounded-lg flex items-center justify-center overflow-hidden">
              <Logo className="w-full h-full" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">Becxus</span>
          </a>
          <div className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <a
                key={path}
                href={path}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  location === path
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                    : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </a>
            ))}
            {isAdmin && (
              <a
                href="/admin/dashboard"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  location.startsWith('/admin')
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                    : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                <Settings className="h-3.5 w-3.5" />
                Dashboard
              </a>
            )}
          </div>
        </nav>
      )}

      {/* Mobile top bar - logo only */}
      {!isAuthPage && (
        <div className="flex md:hidden items-center justify-center h-12 border-b border-[#1e1e1e] bg-[#0a0a0a]/95 backdrop-blur-md sticky top-0 z-50" style={{ marginTop: 'var(--pwa-banner-top, 0px)' }}>
          <a href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#111] border border-[#2a2a2a] rounded-lg flex items-center justify-center overflow-hidden">
              <Logo className="w-full h-full" />
            </div>
            <span className="font-bold text-base tracking-tight text-white">Becxus</span>
          </a>
        </div>
      )}

      <main className={isAuthPage ? "" : "pb-16 md:pb-0"}>
        {children}
      </main>
      {/* Bottom Navigation - mobile only */}
      {!isAuthPage && <BottomNavigation />}
    </div>
  );
}
