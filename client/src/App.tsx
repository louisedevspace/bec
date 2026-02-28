import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MainLayout } from "@/components/layout/main-layout";
import { StickyNotificationsProvider } from "@/contexts/sticky-notifications-context";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { NewsPopupManager } from "@/components/news-popup";
import { lazy, Suspense, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { authApi } from './services/api';
import { supabase } from './lib/supabaseClient';
import { useLocation } from 'wouter';
import type { RouteComponentProps } from "wouter";
import { trackClientMetric } from "./lib/perf";
import { InstallBanner, PwaReengageBanner } from "@/components/pwa";

// Eager load critical pages
import HomePage from "@/pages/home";
import LoginPage from './pages/login';
import SignupPage from './pages/signup';

// Lazy load non-critical pages
const AboutPage = lazy(() => import("@/pages/about"));
const ExchangePage = lazy(() => import("@/pages/exchange"));
const FuturesPage = lazy(() => import("@/pages/futures"));
const MarketPage = lazy(() => import("@/pages/market"));
const LoanPage = lazy(() => import("@/pages/loan"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const SupportPage = lazy(() => import('./pages/support'));
const NotFound = lazy(() => import("@/pages/not-found"));

// Lazy load admin pages
const AdminDashboard = lazy(() => import('./pages/admin-dashboard'));
const AdminUsers = lazy(() => import('./pages/admin-user'));
const AdminSettings = lazy(() => import('./pages/admin-settings'));
const AdminSupport = lazy(() => import('./pages/admin-support'));
const AdminAnalytics = lazy(() => import('./pages/admin-analytics'));
const AdminNews = lazy(() => import('./pages/admin-news'));
const AdminNotifications = lazy(() => import('./pages/admin-notifications'));
const AdminSimpleNotifications = lazy(() => import('./pages/admin-simple-notifications'));
const AdminStreamlinedNotifications = lazy(() => import('./pages/admin-streamlined-notifications'));
const AdminNotificationsRedirect = lazy(() => import('./pages/admin-notifications-redirect'));

function Router() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useLocation();
  const mountTimeRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const prevLocationRef = useRef(location);

  // Memoize auth check to avoid unnecessary re-runs
  const checkAuth = useCallback(async () => {
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
      setIsAuthenticated(!!currentUser);
      setLoading(false);
      
      // If not authenticated and not on login/signup, redirect to login
      if (!currentUser && location !== '/login' && location !== '/signup') {
        setLocation('/login');
        return;
      }
      
      // Check admin role - fetch fresh data from database
      if (currentUser) {
        try {
          // First try localStorage for quick check
          const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
          const hasAdminAccess = cachedProfile?.role === 'admin';
          setIsAdmin(hasAdminAccess);
          
          // If we have admin access from cache, use it immediately
          if (hasAdminAccess) {
            return;
          }
          
          // Only try to fetch fresh data if we don't have admin access from cache
          const { data: freshProfile, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .maybeSingle();
          
          if (!error && freshProfile) {
            const hasAdminAccess = freshProfile.role === 'admin';
            setIsAdmin(hasAdminAccess);
            
            // Update localStorage with fresh role data
            if (cachedProfile?.role !== freshProfile.role) {
              const updatedProfile = { ...cachedProfile, role: freshProfile.role };
              localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
            }
          }
        } catch (error) {
          console.log('Admin access check error:', error);
          // Don't set to false if we have cached admin access
          const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
          if (cachedProfile?.role !== 'admin') {
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setLoading(false);
      setIsAuthenticated(false);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!loading) {
      const end = typeof performance !== "undefined" ? performance.now() : 0;
      const duration = end - mountTimeRef.current;
      if (duration > 0) {
        trackClientMetric("initial_app_load", duration);
      }
    }
  }, [loading]);

  useEffect(() => {
    if (prevLocationRef.current !== location) {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      const duration = now - mountTimeRef.current;
      if (duration > 0) {
        trackClientMetric("navigation", duration);
      }
      try {
        const views = parseInt(localStorage.getItem("pwa_page_views") || "0", 10) + 1;
        localStorage.setItem("pwa_page_views", String(views));
      } catch {}
      prevLocationRef.current = location;
      mountTimeRef.current = now;
    }
  }, [location]);

  // Memoize route components to prevent unnecessary re-renders
  const adminRedirect = useMemo(() => {
    return isAuthenticated && isAdmin
      ? (_props: RouteComponentProps) => {
          setLocation("/admin/dashboard");
          return null;
        }
      : (_props: RouteComponentProps) => {
          setLocation("/");
          return null;
        };
  }, [isAuthenticated, isAdmin, setLocation]);

  const protectedRoute = useCallback(
    (Component: React.ComponentType<any>) => {
      return (_props: RouteComponentProps) =>
        isAuthenticated ? <Component /> : <LoginPage />;
    },
    [isAuthenticated]
  );

  if (loading) return <LoadingScreen />;

  return (
    <MainLayout>
      <Suspense fallback={<LoadingScreen />}>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/signup" component={SignupPage} />
          {/* Admin routes */}
          <Route path="/admin" component={adminRedirect} />
          <Route path="/admin/dashboard" component={isAuthenticated && isAdmin ? AdminDashboard : adminRedirect} />
          <Route path="/admin/analytics" component={isAuthenticated && isAdmin ? AdminAnalytics : adminRedirect} />
          <Route path="/admin/users" component={isAuthenticated && isAdmin ? AdminUsers : adminRedirect} />
          <Route path="/admin/news" component={isAuthenticated && isAdmin ? AdminNews : adminRedirect} />
          <Route path="/admin/notifications" component={isAuthenticated && isAdmin ? AdminNotificationsRedirect : adminRedirect} />
          <Route path="/admin/notifications/simple" component={isAuthenticated && isAdmin ? AdminStreamlinedNotifications : adminRedirect} />
          <Route path="/admin/settings" component={isAuthenticated && isAdmin ? AdminSettings : adminRedirect} />
          <Route path="/admin/support" component={isAuthenticated && isAdmin ? AdminSupport : adminRedirect} />
          {/* User routes */}
          <Route path="/" component={isAuthenticated ? HomePage : LoginPage} />
          <Route path="/about" component={protectedRoute(AboutPage)} />
          <Route path="/exchange" component={protectedRoute(ExchangePage)} />
          <Route path="/futures" component={protectedRoute(FuturesPage)} />
          <Route path="/market" component={protectedRoute(MarketPage)} />
          <Route path="/loan" component={protectedRoute(LoanPage)} />
          <Route path="/profile" component={protectedRoute(ProfilePage)} />
          <Route path="/support" component={protectedRoute(SupportPage)} />

          <Route component={NotFound} />
        </Switch>
      </Suspense>
      {/* News Popup for authenticated users (including admins) */}
      {isAuthenticated && user && (
        <NewsPopupManager 
          userId={user.id} 
          userRole={user?.role}
          isVerified={user?.isVerified}
        />
      )}
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StickyNotificationsProvider>
          <div className="dark min-h-screen becxus-bg">
            <Toaster />
            <InstallBanner />
            <PwaReengageBanner />
            <Router />
          </div>
        </StickyNotificationsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
