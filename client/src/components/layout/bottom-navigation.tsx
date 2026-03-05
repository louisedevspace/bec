import { Link, useLocation } from "wouter";
import { Home, TrendingUp, BarChart3, RefreshCw, User, Info, Zap, Settings, MessageSquare, Wallet } from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

const navItems = [
  { path: "/", icon: Home, label: "Home" },
  { path: "/market", icon: TrendingUp, label: "Markets" },
  { path: "/exchange", icon: RefreshCw, label: "Exchange" },
  { path: "/wallet", icon: Wallet, label: "Wallet" },
  { path: "/futures", icon: Zap, label: "Futures" },
  { path: "/support", icon: MessageSquare, label: "Support" },
  { path: "/profile", icon: User, label: "Profile" },
];

export function BottomNavigation() {
  const [location] = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

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
      console.log('BottomNav - Admin access check error:', error);
      // Fallback to localStorage
      const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
      const hasAdminAccess = cachedProfile?.role === 'admin';
      setIsAdmin(hasAdminAccess);
    }
  }, []);

  useEffect(() => {
    checkAdminAccess();
  }, [checkAdminAccess]);

  const gridCols = useMemo(() => isAdmin ? 'grid-cols-8' : 'grid-cols-7', [isAdmin]);
  const isAdminActive = useMemo(() => location.startsWith('/admin'), [location]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-[#1e1e1e] z-40 md:hidden">
      <div className={`grid h-16 ${gridCols}`}>
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location === path;
          return (
            <Link key={path} href={path} className={`flex flex-col items-center justify-center space-y-1 h-full transition-all duration-200 ${
              isActive
                ? "text-blue-500 scale-105"
                : "text-gray-500 hover:text-gray-400 scale-100"
            }`}>
              <Icon size={18} className={isActive ? "animate-pulse" : ""} />
              <span className="text-xs font-medium">{label}</span>
              {isActive && (
                <div className="absolute bottom-0 w-1 h-1 bg-blue-500 rounded-full" />
              )}
            </Link>
          );
        })}
        {isAdmin && (
          <Link href="/admin/dashboard" className={`flex flex-col items-center justify-center space-y-1 h-full transition-all duration-200 ${
            isAdminActive
              ? "text-blue-500 scale-105"
              : "text-gray-500 hover:text-gray-400 scale-100"
          }`}>
            <Settings size={18} className={isAdminActive ? "animate-pulse" : ""} />
            <span className="text-xs font-medium">Admin</span>
            {isAdminActive && (
              <div className="absolute bottom-0 w-1 h-1 bg-blue-500 rounded-full" />
            )}
          </Link>
        )}
      </div>
    </nav>
  );
}
