import { Link, useLocation } from "wouter";
import { Settings } from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isCachedSupportAgent } from '@/lib/user-role';
import { NAV_ITEMS } from '@/config/nav-items';
import { useNavVisibility } from '@/hooks/use-exchange-name';

export function BottomNavigation() {
  const [location] = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  // Seeded from the cached profile — otherwise the customer tab bar renders
  // for a frame before the role query resolves.
  const [isSupportAgent, setIsSupportAgent] = useState(isCachedSupportAgent);

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
      console.log('BottomNav - Admin access check error:', error);
      setIsAdmin(false);
      setIsSupportAgent(false);
    }
  }, []);

  useEffect(() => {
    checkAdminAccess();
  }, [checkAdminAccess]);

  const isAdminActive = useMemo(() => location.startsWith('/admin'), [location]);

  const navVisibility = useNavVisibility();
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => navVisibility[item.key] !== false),
    [navVisibility]
  );

  // Chat support accounts only use the support console — the customer
  // navigation would just bounce them back to /admin/support.
  if (isSupportAgent) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="h-16 overflow-x-auto scrollbar-hide flex items-center">
        <div className="flex h-full min-w-max">
          {visibleNavItems.map(({ key, path, icon: Icon, label }) => {
            const isActive = location === path;
            return (
              <Link key={key} href={path} className={`flex flex-col items-center justify-center gap-1 h-full px-2.5 transition-colors duration-200 ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}>
                <span
                  key={isActive ? "active" : "inactive"}
                  className={`flex items-center justify-center rounded-2xl transition-all duration-200 ${
                    isActive ? "bg-primary/10 px-3.5 py-1 animate-in zoom-in-90 fade-in" : "px-3.5 py-1"
                  }`}
                >
                  <Icon size={18} />
                </span>
                <span className="text-xs font-medium">{label}</span>
              </Link>
            );
          })}
          {isAdmin && (
            <Link href="/admin/dashboard" className={`flex flex-col items-center justify-center gap-1 h-full px-2.5 transition-colors duration-200 ${
              isAdminActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
              <span
                key={isAdminActive ? "active" : "inactive"}
                className={`flex items-center justify-center rounded-2xl transition-all duration-200 ${
                  isAdminActive ? "bg-primary/10 px-3.5 py-1 animate-in zoom-in-90 fade-in" : "px-3.5 py-1"
                }`}
              >
                <Settings size={18} />
              </span>
              <span className="text-xs font-medium">Admin</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
