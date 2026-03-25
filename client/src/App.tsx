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
import { NetworkStatusNotification } from "@/components/network-status";

// Eager load critical pages
import HomePage from "@/pages/home";
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import ResetPasswordPage from './pages/reset-password';

// Lazy load non-critical pages
const AboutPage = lazy(() => import("@/pages/about"));
const ExchangePage = lazy(() => import("@/pages/exchange"));
const FuturesPage = lazy(() => import("@/pages/futures"));
const MarketPage = lazy(() => import("@/pages/market"));
const LoanPage = lazy(() => import("@/pages/loan"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const SupportPage = lazy(() => import('./pages/support'));
const ImageViewerPage = lazy(() => import('./pages/image-viewer'));
const NotFound = lazy(() => import("@/pages/not-found"));

// Lazy load admin pages
const AdminDashboard = lazy(() => import('./pages/admin-dashboard'));
const AdminUsers = lazy(() => import('./pages/admin-user'));
const AdminSettings = lazy(() => import('./pages/admin-settings'));
const AdminSupport = lazy(() => import('./pages/admin-support'));
const AdminNews = lazy(() => import('./pages/admin-news'));
const AdminNotifications = lazy(() => import('./pages/admin-notifications'));
const AdminSimpleNotifications = lazy(() => import('./pages/admin-simple-notifications'));
const AdminStreamlinedNotifications = lazy(() => import('./pages/admin-streamlined-notifications'));
const AdminNotificationsRedirect = lazy(() => import('./pages/admin-notifications-redirect'));
const AdminTradingPairs = lazy(() => import('./pages/admin-trading-pairs'));
const AdminWallets = lazy(() => import('./pages/admin-wallets'));
const AdminStaking = lazy(() => import('./pages/admin-staking'));
const AdminUserDetail = lazy(() => import('./pages/admin-user-detail'));
const WalletPage = lazy(() => import('./pages/wallet'));

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
      
      // If not authenticated and not on login/signup/reset-password, redirect to login
      if (!currentUser && location !== '/login' && location !== '/signup' && location !== '/reset-password') {
        setIsAdmin(false);
        setLoading(false);
        setLocation('/login');
        return;
      }
      
      // Check admin role - fetch fresh data from database
      if (currentUser) {
        try {
          const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
          const { data: freshProfile, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .maybeSingle();

          const hasAdminAccess = !error && freshProfile?.role === 'admin';
          setIsAdmin(hasAdminAccess);

          if (!error && freshProfile) {
            const updatedProfile = { ...cachedProfile, role: freshProfile.role };
            localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
          }
        } catch (error) {
          console.log('Admin access check error:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    } catch (error) {
      console.error('Auth check error:', error);
      setLoading(false);
      setIsAuthenticated(false);
      setIsAdmin(false);
    }
  }, [location, setLocation]);

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

  // Redirect to /reset-password when Supabase fires PASSWORD_RECOVERY from email link
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setLocation('/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, [setLocation]);

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

  const adminUsersRedirect = useMemo(() => {
    return isAuthenticated && isAdmin
      ? (_props: RouteComponentProps) => {
          setLocation("/admin/users");
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
          <Route path="/reset-password" component={ResetPasswordPage} />
          {/* Admin routes */}
          <Route path="/admin" component={adminRedirect} />
          <Route path="/admin/dashboard" component={isAuthenticated && isAdmin ? AdminDashboard : adminRedirect} />
          <Route path="/admin/analytics" component={adminRedirect} />
          <Route path="/admin/users" component={isAuthenticated && isAdmin ? AdminUsers : adminRedirect} />
          <Route path="/admin/users/:userId" component={isAuthenticated && isAdmin ? AdminUserDetail : adminRedirect} />
          <Route path="/admin/deleted-users" component={adminUsersRedirect} />
          <Route path="/admin/news" component={isAuthenticated && isAdmin ? AdminNews : adminRedirect} />
          <Route path="/admin/notifications" component={isAuthenticated && isAdmin ? AdminNotificationsRedirect : adminRedirect} />
          <Route path="/admin/notifications/simple" component={isAuthenticated && isAdmin ? AdminStreamlinedNotifications : adminRedirect} />
          <Route path="/admin/settings" component={isAuthenticated && isAdmin ? AdminSettings : adminRedirect} />
          <Route path="/admin/trading-pairs" component={isAuthenticated && isAdmin ? AdminTradingPairs : adminRedirect} />
          <Route path="/admin/support" component={isAuthenticated && isAdmin ? AdminSupport : adminRedirect} />
          <Route path="/admin/wallets" component={isAuthenticated && isAdmin ? AdminWallets : adminRedirect} />
          <Route path="/admin/staking" component={isAuthenticated && isAdmin ? AdminStaking : adminRedirect} />
          {/* User routes */}
          <Route path="/" component={isAuthenticated ? HomePage : LoginPage} />
          <Route path="/about" component={protectedRoute(AboutPage)} />
          <Route path="/exchange" component={protectedRoute(ExchangePage)} />
          <Route path="/futures" component={protectedRoute(FuturesPage)} />
          <Route path="/market" component={protectedRoute(MarketPage)} />
          <Route path="/loan" component={protectedRoute(LoanPage)} />
          <Route path="/profile" component={protectedRoute(ProfilePage)} />
          <Route path="/support" component={protectedRoute(SupportPage)} />
          <Route path="/wallet" component={protectedRoute(WalletPage)} />
          <Route path="/image-viewer" component={protectedRoute(ImageViewerPage)} />

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
          <div className="min-h-screen becxus-bg">
            <Toaster />
            <NetworkStatusNotification />
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
