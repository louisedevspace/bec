import { Home, TrendingUp, Zap, Coins, MessageSquare, User, RefreshCw, Wallet, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', path: '/', label: 'Home', icon: Home },
  { key: 'markets', path: '/market', label: 'Markets', icon: TrendingUp },
  { key: 'futures', path: '/futures', label: 'Futures', icon: Zap },
  { key: 'staking', path: '/staking', label: 'Staking', icon: Coins },
  { key: 'support', path: '/support', label: 'Support', icon: MessageSquare },
  { key: 'profile', path: '/profile', label: 'Profile', icon: User },
  { key: 'exchange', path: '/exchange', label: 'Exchange', icon: RefreshCw },
  { key: 'wallet', path: '/wallet', label: 'Wallet', icon: Wallet },
  { key: 'about', path: '/about', label: 'About', icon: Info },
];
