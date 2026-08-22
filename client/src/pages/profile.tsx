import { useEffect, useState, useMemo } from 'react';
import { Wallet, PieChart, History, Shield, Key, Phone, LogOut, Camera, CheckCircle, XCircle, Clock, AlertCircle, FileText, Trash2, TrendingUp, Sun, Moon, ChevronRight, Lock, DollarSign, Gift, Copy, Users } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { LucideIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/hooks/use-theme';
import { PwaControls } from '@/components/pwa/pwa-controls';
import { supabase } from '../lib/supabaseClient';
import { StakingModal } from '@/components/modals/staking-modal';
import { ChangePasswordModal } from '@/components/modals/change-password-modal';
import { ProfilePictureModal } from '@/components/modals/profile-picture-modal';
import { PrivacyPolicyModal } from '@/components/modals/privacy-policy-modal';
import { DeleteAccountModal } from '@/components/modals/delete-account-modal';
import { CreditScoreBadge } from '@/components/ui/credit-score-badge';
import { useLocation } from 'wouter';
import { useCryptoPrices } from '@/hooks/use-crypto-prices';
import { formatBalance, formatUsdNumber } from '@/utils/format-utils';
import { getImageDisplayUrl } from '@/lib/image';
import { userDataQueryOptions, portfolioQueryOptions } from '@/lib/queryClient';

export default function ProfilePage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'support' | 'referrals'>(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      return tab === 'referrals' || tab === 'security' || tab === 'support' ? tab : 'overview';
    } catch {
      return 'overview';
    }
  });
  const [, setLocation] = useLocation();
  const { prices } = useCryptoPrices();
  const { isDark, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const { copied: linkCopied, copyToClipboard: copyReferralLink } = useCopyToClipboard();

  // Fetch auth user first (required for all other queries)
  const { data: authUser, isLoading: authLoading, error: authError } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      return user;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch user profile (renders immediately when available)
  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['user-profile', authUser?.id],
    queryFn: async () => {
      if (!authUser) throw new Error('No auth user');

      // Check if the user exists in the users table
      const { data: users, error: listError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id);

      if (listError) throw listError;

      let userProfile;

      if (!users || users.length === 0) {
        // User exists in Auth but not in users table — auto-create the row
        console.log('User not found in users table, creating profile...');
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch('/api/signup-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
              phone: authUser.user_metadata?.phone || '',
            }),
          });
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || 'Failed to create user profile');
          }
          // Re-fetch the newly created user row
          const { data: newUsers, error: refetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id);
          if (refetchError) throw refetchError;
          if (!newUsers || newUsers.length === 0) throw new Error('Failed to create user profile');
          userProfile = newUsers[0];
        } else {
          throw new Error('No session found');
        }
      } else {
        userProfile = users[0];
      }

      return userProfile;
    },
    enabled: !!authUser?.id,
    ...userDataQueryOptions,
  });

  // Fetch KYC status (independent, can load in parallel)
  const { data: kycStatus } = useQuery({
    queryKey: ['kyc-status', authUser?.id],
    queryFn: async () => {
      if (!authUser) return null;
      const { data: kycData, error: kycError } = await supabase
        .from('kyc_verifications')
        .select('*')
        .eq('user_id', authUser.id)
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (kycError) {
        console.error('Error fetching KYC status:', kycError);
        return null;
      }
      return kycData?.[0] || null;
    },
    enabled: !!authUser?.id,
    ...userDataQueryOptions,
  });

  // Fetch referral code/stats (loads independently, only used by the Referrals tab)
  const { data: referralData, isLoading: referralLoading } = useQuery({
    queryKey: ['referrals-me', authUser?.id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      const response = await fetch('/api/referrals/me', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Failed to load referral data');
      return response.json();
    },
    enabled: !!authUser?.id,
    ...userDataQueryOptions,
  });

  const { data: referralSettings } = useQuery({
    queryKey: ['referral-settings'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      const response = await fetch('/api/referrals/settings', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Failed to load referral settings');
      return response.json();
    },
    enabled: !!authUser?.id,
    ...userDataQueryOptions,
  });

  const referralLink = referralData?.referralCode
    ? `${window.location.origin}/signup?ref=${referralData.referralCode}`
    : '';

  // Fetch portfolio (loads independently with skeleton)
  const { data: portfolio = [], isLoading: portfolioLoading } = useQuery({
    queryKey: ['user-portfolio', authUser?.id],
    queryFn: async () => {
      if (!authUser) return [];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`/api/portfolio/${authUser.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch portfolio');
      }

      return await response.json() || [];
    },
    enabled: !!authUser?.id,
    staleTime: 30 * 1000, // 30 seconds - trading data changes often
    gcTime: 2 * 60 * 1000,
  });

  // Fetch staking positions (loads independently with skeleton)
  const { data: stakingPositions = [], isLoading: stakingLoading } = useQuery({
    queryKey: ['user-staking', authUser?.id],
    queryFn: async () => {
      if (!authUser) return [];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`/api/staking/${authUser.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch staking positions');
      }

      return await response.json() || [];
    },
    enabled: !!authUser?.id,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
  });

  // Preload profile image when profile data is available
  useEffect(() => {
    if (profile?.profile_picture) {
      const img = new Image();
      img.src = getImageDisplayUrl(profile.profile_picture);
    }
  }, [profile?.profile_picture]);

  const handlePictureUpdate = (pictureUrl: string) => {
    // Update React Query cache directly for immediate UI feedback
    queryClient.setQueryData(['user-profile', authUser?.id], (oldData: any) => ({
      ...oldData,
      profile_picture: pictureUrl
    }));
  };

  // Memoized calculations for performance
  const totalStaked = useMemo(() => {
    if (!stakingPositions || stakingPositions.length === 0 || !prices || prices.length === 0) return 0;

    let total = 0;

    stakingPositions.forEach((position: any) => {
      const price = prices.find((p: any) => p.symbol === position.symbol);
      if (price && position.status === 'active') {
        const priceValue = parseFloat(price.price);
        const stakedAmount = parseFloat(position.amount) || 0;
        total += stakedAmount * priceValue;
      }
    });

    return total;
  }, [stakingPositions, prices]);

  const totalBalance = useMemo(() => {
    if (!portfolio || portfolio.length === 0 || !prices || prices.length === 0) return 0;

    let totalValue = 0;

    // Calculate available portfolio value (ETH, BTC, USDT, etc.) - EXCLUDE staked amounts
    // All values are converted to USD for the total
    portfolio.forEach((asset: any) => {
      const price = prices.find((p: any) => p.symbol === asset.symbol);
      if (price) {
        const priceValue = parseFloat(price.price);
        const available = parseFloat(asset.available) || 0;
        const frozen = parseFloat(asset.frozen) || 0;
        const total = available + frozen;
        totalValue += total * priceValue;
      }
    });

    return totalValue;
  }, [portfolio, prices]);

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.clear();
    setLocation('/login');
  }

  function handleMenuAction(action: string) {
    switch (action) {
      case 'transaction-history':
        setLocation('/wallet?tab=history');
        break;
      case 'staking':
      case 'privacy-policy':
        setActiveModal(action);
        break;
      case 'update-password':
        setActiveModal('change-password');
        break;
      case 'customer-support':
        setLocation('/support');
        break;
      case 'logout':
        handleLogout();
        break;
      case 'delete-account':
        setActiveModal('delete-account');
        break;
      default:
        break;
    }
  }

  function handleQuickAction(action: string) {
    switch (action) {
      case 'wallet':
        setLocation('/wallet');
        break;
      case 'staking':
        setLocation('/staking');
        break;
      default:
        break;
    }
  }

  const getVerificationStatusDisplay = () => {
    if (!kycStatus) {
      return {
        status: 'not-submitted',
        icon: AlertCircle,
        color: 'text-warning',
        bgColor: 'bg-warning/10',
        text: 'KYC not submitted',
        description: 'Please submit your KYC documents for verification'
      };
    }

    switch (kycStatus.status) {
      case 'approved':
        return {
          status: 'approved',
          icon: CheckCircle,
          color: 'text-success',
          bgColor: 'bg-success/10',
          text: 'KYC Approved',
          description: 'Your identity has been verified successfully'
        };
      case 'rejected':
        return {
          status: 'rejected',
          icon: XCircle,
          color: 'text-danger',
          bgColor: 'bg-danger/10',
          text: 'KYC Rejected',
          description: kycStatus.rejection_reason || 'Your KYC application was rejected'
        };
      case 'pending':
      default:
        return {
          status: 'pending',
          icon: Clock,
          color: 'text-info',
          bgColor: 'bg-info/10',
          text: 'KYC Pending',
          description: 'Your KYC application is under review'
        };
    }
  };

  const verificationDisplay = getVerificationStatusDisplay();
  const StatusIcon = verificationDisplay.icon;

  // Show loading spinner only for initial auth/profile fetch
  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground text-sm">Loading profile...</div>
    </div>
  );

  // Handle auth or profile errors
  const error = authError || profileError;
  if (error) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-danger text-sm">Error: {(error as Error).message}</div>
    </div>
  );
  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground text-sm">No profile found.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 lg:pb-12">
      <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-5 lg:pt-10 lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start">

        {/* Identity rail */}
        <aside className="bg-card rounded-2xl border border-border p-5 lg:p-6 shadow-sm lg:sticky lg:top-24 flex flex-col items-center text-center gap-1">
          <div className="relative flex-shrink-0">
            {profile.profile_picture ? (
              <img
                src={getImageDisplayUrl(profile.profile_picture)}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-muted border border-border flex items-center justify-center text-2xl font-bold text-muted-foreground">
                {profile.full_name ? profile.full_name[0] : '?'}
              </div>
            )}
            <button
              onClick={() => setActiveModal('profile-picture')}
              className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm"
              aria-label="Change profile picture"
            >
              <Camera size={11} />
            </button>
          </div>

          <div className="mt-3 text-sm font-semibold text-foreground truncate max-w-full">{profile.full_name || 'Name not set'}</div>
          <div className="text-xs text-muted-foreground truncate max-w-full">{profile.email}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">ID: {profile.display_id || profile.id.substring(0, 8)}</div>

          <div className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full text-[11px] font-semibold ${verificationDisplay.bgColor} ${verificationDisplay.color}`}>
            <StatusIcon size={11} />
            {verificationDisplay.text}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 w-full">
            <div className="bg-muted/50 rounded-xl p-2.5 border border-border text-center">
              <PieChart size={12} className="text-primary mx-auto mb-1" />
              <div className="text-xs font-bold text-primary tabular-nums">{profile.credit_score || 60}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Credit</div>
            </div>
            <div className="bg-muted/50 rounded-xl p-2.5 border border-border text-center">
              <Wallet size={12} className="text-success mx-auto mb-1" />
              <div className="text-xs font-bold text-success tabular-nums">
                {portfolioLoading ? '···' : `$${formatUsdNumber(totalBalance)}`}
              </div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Portfolio</div>
            </div>
            <div className="bg-muted/50 rounded-xl p-2.5 border border-border text-center">
              <TrendingUp size={12} className="text-info mx-auto mb-1" />
              <div className="text-xs font-bold text-info tabular-nums">
                {stakingLoading ? '···' : `$${formatUsdNumber(totalStaked)}`}
              </div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Staked</div>
            </div>
          </div>

          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between mt-4 px-3 py-2.5 rounded-xl border border-border bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
              {isDark ? <Moon size={13} className="text-primary" /> : <Sun size={13} className="text-warning" />}
              {isDark ? 'Dark Mode' : 'Light Mode'}
            </span>
            <div className={`w-9 h-5 rounded-full relative transition-colors duration-200 ${isDark ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <div className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-background shadow-sm transition-transform duration-200 ${isDark ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
            </div>
          </button>

          <div className="w-full mt-4 pt-4 border-t border-border flex flex-col gap-1.5">
            <button
              onClick={() => handleMenuAction('logout')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-danger hover:bg-danger/10 transition-colors"
            >
              <LogOut size={13} /> Log out
            </button>
            {profile?.role === 'user' && (
              <button
                onClick={() => handleMenuAction('delete-account')}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 size={13} /> Delete account
              </button>
            )}
          </div>
        </aside>

        {/* Content */}
        <div className="mt-4 lg:mt-0 space-y-4">
          <div className="inline-flex bg-muted rounded-full p-1 gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'overview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <TrendingUp size={12} /> Overview
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'security' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Shield size={12} /> Security
            </button>
            <button
              onClick={() => setActiveTab('support')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'support' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FileText size={12} /> Support &amp; Legal
            </button>
            <button
              onClick={() => setActiveTab('referrals')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'referrals' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Gift size={12} /> Referrals
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Staking Section */}
              <div
                onClick={() => setLocation('/staking')}
                className="bg-card rounded-2xl border border-border p-4 cursor-pointer hover:border-primary/40 transition-colors shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center">
                      <TrendingUp size={20} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="text-foreground font-semibold text-sm">USDT Staking</h3>
                      <p className="text-muted-foreground text-xs">Flexible &amp; Fixed Terms</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="flex items-center gap-1.5">
                      <span className="text-success font-bold text-lg">4.0%</span>
                      <span className="text-muted-foreground text-xs">APY</span>
                    </div>
                    <div className="text-muted-foreground text-[10px] mt-0.5">Max Return</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-4 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Lock size={12} className="text-primary" />
                      <span>7-180 Days</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <DollarSign size={12} className="text-success" />
                      <span>Min $10</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary text-xs font-medium self-end sm:self-auto">
                    <span>Stake Now</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton icon={Wallet} label="My Wallet" onClick={() => handleQuickAction('wallet')} />
                  <ActionButton icon={TrendingUp} label="Staking" onClick={() => handleQuickAction('staking')} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* Verification Status Card - Hide when KYC is approved */}
              {verificationDisplay.status !== 'approved' ? (
                <div id="kyc-status-section" className="bg-card rounded-2xl border border-border p-4 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${verificationDisplay.bgColor}`}>
                      <StatusIcon size={14} className={verificationDisplay.color} />
                    </div>
                    <span className={`text-sm font-semibold ${verificationDisplay.color}`}>{verificationDisplay.text}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 ml-9">{verificationDisplay.description}</p>

                  {verificationDisplay.status === 'rejected' && kycStatus?.rejection_reason && (
                    <div className="bg-danger/5 border border-danger/20 rounded-lg p-3 ml-9 mb-2">
                      <p className="text-[11px] text-danger">{kycStatus.rejection_reason}</p>
                    </div>
                  )}

                  {(verificationDisplay.status === 'not-submitted' || verificationDisplay.status === 'rejected') && (
                    <p className="text-[11px] text-info ml-9">
                      {verificationDisplay.status === 'not-submitted'
                        ? 'Please go to the Home page to submit your KYC documents.'
                        : 'Please go to the Home page to re-submit your KYC documents.'}
                    </p>
                  )}
                </div>
              ) : (
                <div id="kyc-status-section" className="bg-card rounded-2xl border border-border p-4 shadow-sm flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/10">
                    <StatusIcon size={14} className="text-success" />
                  </div>
                  <span className="text-sm font-semibold text-success">Identity verified</span>
                </div>
              )}

              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <MenuButton icon={Key} label="Update the password" onClick={() => handleMenuAction('update-password')} isLast />
              </div>
            </div>
          )}

          {activeTab === 'support' && (
            <div className="space-y-4">
              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <MenuButton icon={History} label="Transaction history" onClick={() => handleMenuAction('transaction-history')} isLast />
              </div>
              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <MenuButton icon={FileText} label="Legal Agreements" onClick={() => handleMenuAction('privacy-policy')} />
                <MenuButton icon={Phone} label="Customer support" onClick={() => handleMenuAction('customer-support')} isLast />
              </div>
            </div>
          )}

          {activeTab === 'referrals' && (
            <div className="space-y-4">
              {referralSettings && !referralSettings.isEnabled ? (
                <div className="bg-card rounded-2xl border border-border p-4 shadow-sm text-center text-sm text-muted-foreground">
                  The referral program isn't active right now. Check back later!
                </div>
              ) : (
                <>
                  <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Gift size={16} className="text-primary" />
                      <h3 className="text-foreground font-semibold text-sm">Invite friends, earn rewards</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {referralSettings
                        ? referralSettings.rewardType === 'percentage'
                          ? `Earn ${(parseFloat(referralSettings.percentageRate) * 100).toFixed(0)}% of your friend's first deposit${referralSettings.maxRewardAmount ? ` (up to ${referralSettings.maxRewardAmount} ${referralSettings.rewardSymbol})` : ''} once they make it.`
                          : `Earn ${referralSettings.fixedAmount} ${referralSettings.rewardSymbol} for every friend who makes their first deposit.`
                        : 'Share your link and earn rewards when friends join and deposit.'}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={referralLoading ? 'Loading...' : referralLink}
                        className="flex-1 min-w-0 bg-muted rounded-lg px-3 py-2 text-xs text-foreground truncate"
                      />
                      <button
                        onClick={() => referralLink && copyReferralLink(referralLink)}
                        disabled={!referralLink}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {linkCopied ? <CheckCircle size={13} /> : <Copy size={13} />}
                        {linkCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-card rounded-2xl border border-border p-3 text-center shadow-sm">
                      <div className="text-lg font-bold text-foreground">{referralData?.totalReferred ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Referred</div>
                    </div>
                    <div className="bg-card rounded-2xl border border-border p-3 text-center shadow-sm">
                      <div className="text-lg font-bold text-foreground">{referralData?.totalRewarded ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Rewarded</div>
                    </div>
                    <div className="bg-card rounded-2xl border border-border p-3 text-center shadow-sm">
                      <div className="text-lg font-bold text-success">{referralData ? formatBalance(referralData.totalEarned, referralData.rewardSymbol || 'USDT', 'crypto') : '—'}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{referralData?.rewardSymbol || 'USDT'} Earned</div>
                    </div>
                  </div>

                  <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <Users size={14} className="text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">Your referrals</span>
                    </div>
                    {!referralData?.referrals?.length ? (
                      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                        No referrals yet — share your link to get started.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {referralData.referrals.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <div className="text-xs font-medium text-foreground">{r.referredUser?.username || r.referredUser?.display_id || 'User'}</div>
                              <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                            </div>
                            {r.status === 'rewarded' ? (
                              <span className="text-xs font-semibold text-success">+{r.reward_amount} {r.reward_symbol}</span>
                            ) : (
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">Pending deposit</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* App & Notifications */}
          <PwaControls />
        </div>
      </div>

      {/* Modals */}
      <StakingModal isOpen={activeModal === 'staking'} onClose={() => setActiveModal(null)} userId={profile?.id} />
      <ChangePasswordModal isOpen={activeModal === 'change-password'} onClose={() => setActiveModal(null)} />
      <PrivacyPolicyModal isOpen={activeModal === 'privacy-policy'} onClose={() => setActiveModal(null)} />
      <ProfilePictureModal
        isOpen={activeModal === 'profile-picture'}
        onClose={() => setActiveModal(null)}
        currentProfilePicture={profile.profile_picture}
        userId={profile.id}
        onPictureUpdate={handlePictureUpdate}
      />
      <DeleteAccountModal
        isOpen={activeModal === 'delete-account'}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/50 border border-border hover:border-primary/40 hover:bg-muted transition-all cursor-pointer group" onClick={onClick}>
      <div className="w-8 h-8 bg-muted border border-border rounded-lg flex items-center justify-center group-hover:border-primary/40 transition-colors">
        <Icon size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

function MenuButton({ icon: Icon, label, danger, onClick, showShield, isLast }: { icon: LucideIcon; label: string; danger?: boolean; onClick?: () => void; showShield?: boolean; isLast?: boolean }) {
  return (
    <button
      className={`w-full flex items-center px-4 py-3 text-left transition-colors hover:bg-muted focus:outline-none ${
        !isLast ? 'border-b border-border' : ''
      }`}
      onClick={onClick}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mr-3 ${
        danger ? 'bg-danger/10' : 'bg-muted'
      }`}>
        <Icon size={14} className={danger ? 'text-danger' : 'text-muted-foreground'} />
      </div>
      <span className={`flex-1 text-sm ${danger ? 'text-danger' : 'text-foreground'}`}>{label}</span>
      {showShield ? (
        <div className="w-5 h-5 flex items-center justify-center text-success" title="KYC Verified">
          <Shield size={14} className="fill-success/20" />
        </div>
      ) : (
        <ChevronRight size={14} className="text-muted-foreground" />
      )}
    </button>
  );
}
