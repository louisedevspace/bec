import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Menu, X, LayoutDashboard, Users, MessageSquare, Settings, 
  ChevronRight, LogOut, Shield, BarChart3, Megaphone
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Logo } from '@/components/brand/logo';

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, description: 'Overview & Orders' },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3, description: 'Platform Analytics' },
  { label: 'Users', href: '/admin/users', icon: Users, description: 'Manage Users' },
  { label: 'News', href: '/admin/news', icon: Megaphone, description: 'Announcements & Broadcasts' },
  { label: 'Notifications', href: '/admin/notifications/simple', icon: Megaphone, description: 'Send Notifications' },
  { label: 'Support', href: '/admin/support', icon: MessageSquare, description: 'Customer Support' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, description: 'Platform Config' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setAdminEmail(session.user.email);
    });
  }, []);

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
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center text-white text-xs font-bold">
              {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
            </div>
          </div>
        </div>
      </header>

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
                title={isCollapsed ? item.label : undefined}
              >
                <div className={`
                  flex items-center justify-center rounded-lg flex-shrink-0 w-8 h-8
                  ${isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-white'}
                `}>
                  <Icon size={20} />
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
