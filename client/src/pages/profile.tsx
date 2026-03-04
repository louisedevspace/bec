import { useEffect, useState } from 'react';
import { Wallet, CreditCard, ArrowRightLeft, PieChart, History, Shield, Key, UserPlus, Download, Phone, LogOut, Camera, CheckCircle, XCircle, Clock, AlertCircle, FileText, Trash2, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PwaControls } from '@/components/pwa/pwa-controls';
import { supabase } from '../lib/supabaseClient';
import { ConvertModal } from '@/components/modals/convert-modal';
import { DepositModal } from '@/components/modals/deposit-modal';
import { WithdrawModal } from '@/components/modals/withdraw-modal';
import { PortfolioModal } from '@/components/modals/portfolio-modal';
import { StakingModal } from '@/components/modals/staking-modal';
import { UnifiedTransactionHistoryModal } from '@/components/modals/unified-transaction-history-modal';
import { ChangePasswordModal } from '@/components/modals/change-password-modal';
import { ProfilePictureModal } from '@/components/modals/profile-picture-modal';
import { PrivacyPolicyModal } from '@/components/modals/privacy-policy-modal';
import { DeleteAccountModal } from '@/components/modals/delete-account-modal';
import { CreditScoreBadge } from '@/components/ui/credit-score-badge';
import { useLocation } from 'wouter';
import { useCryptoPrices } from '@/hooks/use-crypto-prices';
import { formatBalance, formatUsdNumber } from '@/utils/format-utils';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [kycStatus, setKycStatus] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [stakingPositions, setStakingPositions] = useState<any[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [stakingLoading, setStakingLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { prices } = useCryptoPrices();

  const handlePictureUpdate = (pictureUrl: string) => {
    setProfile((prev: any) => ({
      ...prev,
      profile_picture: pictureUrl
    }));
  };

  const fetchPortfolio = async (userId: string) => {
    setPortfolioLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`/api/portfolio/${userId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch portfolio');
      }

      const data = await response.json();
      setPortfolio(data || []);
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      setPortfolio([]);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const fetchStaking = async (userId: string) => {
    setStakingLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`/api/staking/${userId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch staking positions');
      }

      const data = await response.json();
      setStakingPositions(data || []);
    } catch (error) {
      console.error('Error fetching staking positions:', error);
      setStakingPositions([]);
    } finally {
      setStakingLoading(false);
    }
  };

  const calculateTotalStaked = () => {
    if (!stakingPositions || stakingPositions.length === 0 || !prices || prices.length === 0) return 0;
    
    let totalStaked = 0;
    
    stakingPositions.forEach((position: any) => {
      const price = prices.find((p: any) => p.symbol === position.symbol);
      if (price && position.status === 'active') {
        const priceValue = parseFloat(price.price);
        const stakedAmount = parseFloat(position.amount) || 0;
        totalStaked += stakedAmount * priceValue;
      }
    });
    
    return totalStaked;
  };

  const calculateTotalBalance = () => {
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
  };

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');
        
        // Check if the user exists in the users table
        const { data: users, error: listError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id);
        
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
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                phone: user.user_metadata?.phone || '',
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
              .eq('id', user.id);
            if (refetchError) throw refetchError;
            if (!newUsers || newUsers.length === 0) throw new Error('Failed to create user profile');
            userProfile = newUsers[0];
          } else {
            throw new Error('No session found');
          }
        } else {
          userProfile = users[0];
        }
        
        setProfile(userProfile);

        // Fetch KYC verification status
        const { data: kycData, error: kycError } = await supabase
          .from('kyc_verifications')
          .select('*')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(1);

        if (kycError) {
          console.error('Error fetching KYC status:', kycError);
        } else {
          setKycStatus(kycData?.[0] || null);
        }

        // Fetch portfolio and staking data
        await Promise.all([
          fetchPortfolio(user.id),
          fetchStaking(user.id)
        ]);

      } catch (err: any) {
        console.error('Profile fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.clear();
    setLocation('/login');
  }

  function handleMenuAction(action: string) {
    switch (action) {
      case 'transaction-history':
      case 'staking':
      case 'privacy-policy':
        setActiveModal(action);
        break;
      case 'update-password':
        setActiveModal('change-password');
        break;
      case 'invite':
        alert('Invite feature coming soon!');
        break;
      case 'download-app':
        alert('Download app feature coming soon!');
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
      case 'deposit':
      case 'withdraw':
      case 'convert':
      case 'portfolio':
      case 'staking':
        setActiveModal(action);
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
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-900/20',
        text: 'KYC not submitted',
        description: 'Please submit your KYC documents for verification'
      };
    }

    switch (kycStatus.status) {
      case 'approved':
        return {
          status: 'approved',
          icon: CheckCircle,
          color: 'text-green-400',
          bgColor: 'bg-green-900/20',
          text: 'KYC Approved',
          description: 'Your identity has been verified successfully'
        };
      case 'rejected':
        return {
          status: 'rejected',
          icon: XCircle,
          color: 'text-red-400',
          bgColor: 'bg-red-900/20',
          text: 'KYC Rejected',
          description: kycStatus.rejection_reason || 'Your KYC application was rejected'
        };
      case 'pending':
      default:
        return {
          status: 'pending',
          icon: Clock,
          color: 'text-blue-400',
          bgColor: 'bg-blue-900/20',
          text: 'KYC Pending',
          description: 'Your KYC application is under review'
        };
    }
  };

  const verificationDisplay = getVerificationStatusDisplay();
  const StatusIcon = verificationDisplay.icon;

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="animate-pulse text-gray-500 text-sm">Loading profile...</div>
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-red-400 text-sm">Error: {error}</div>
    </div>
  );
  if (!profile) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-gray-500 text-sm">No profile found.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-base font-semibold text-white">My Account</h1>
        </div>

        {/* Profile Summary Card */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              {profile.profile_picture ? (
                <img
                  src={profile.profile_picture}
                  alt="Profile"
                  className="w-14 h-14 rounded-xl object-cover border border-[#2a2a2a]"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-xl font-bold text-gray-400">
                  {profile.full_name ? profile.full_name[0] : '?'}
                </div>
              )}
              <button
                onClick={() => setActiveModal('profile-picture')}
                className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-lg w-5 h-5 flex items-center justify-center hover:bg-blue-600 transition-colors shadow-lg"
              >
                <Camera size={10} />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">ID: {profile.display_id || profile.id.substring(0, 8)}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{profile.email}</div>
              <div className="text-xs text-gray-500 truncate">{profile.full_name || 'Name not set'}</div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] text-center">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Credit Score</div>
              <div className="text-sm font-bold text-yellow-400 tabular-nums">{profile.credit_score || 60}</div>
            </div>
            <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] text-center">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Portfolio</div>
              <div className="text-sm font-bold text-green-400 tabular-nums">
                {portfolioLoading ? '...' : `$${formatUsdNumber(calculateTotalBalance())}`}
              </div>
            </div>
            <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] text-center">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Staked</div>
              <div className="text-sm font-bold text-blue-400 tabular-nums">
                {stakingLoading ? '...' : `$${formatUsdNumber(calculateTotalStaked())}`}
              </div>
            </div>
          </div>
        </div>

        {/* Verification Status Card - Hide when KYC is approved */}
        {verificationDisplay.status !== 'approved' && (
          <div className={`bg-[#111] rounded-2xl border border-[#1e1e1e] p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                verificationDisplay.status === 'rejected' ? 'bg-red-500/10' :
                verificationDisplay.status === 'pending' ? 'bg-blue-500/10' : 'bg-yellow-500/10'
              }`}>
                <StatusIcon size={14} className={verificationDisplay.color} />
              </div>
              <span className={`text-sm font-semibold ${verificationDisplay.color}`}>{verificationDisplay.text}</span>
            </div>
            <p className="text-xs text-gray-500 mb-2 ml-9">{verificationDisplay.description}</p>
            
            {verificationDisplay.status === 'rejected' && kycStatus?.rejection_reason && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 ml-9 mb-2">
                <p className="text-[11px] text-red-300">{kycStatus.rejection_reason}</p>
              </div>
            )}
            
            {(verificationDisplay.status === 'not-submitted' || verificationDisplay.status === 'rejected') && (
              <p className="text-[11px] text-blue-400 ml-9">
                {verificationDisplay.status === 'not-submitted' 
                  ? 'Please go to the Home page to submit your KYC documents.'
                  : 'Please go to the Home page to re-submit your KYC documents.'}
              </p>
            )}
          </div>
        )}

        {/* Staking Section */}
        <div className="bg-gradient-to-br from-[#0f0f0f] to-[#0a0a0a] rounded-2xl border border-[#252525] overflow-hidden">
          <div 
            onClick={() => setActiveModal('staking')}
            className="relative cursor-pointer group"
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-blue-500/5"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all duration-500"></div>
            
            <div className="relative p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-all duration-300">
                      <TrendingUp size={22} className="text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-[7px] text-white font-bold">✓</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm">USDT Staking</h3>
                    <p className="text-gray-400 text-xs">Flexible & Fixed Terms</p>
                  </div>
                </div>
                <div className="text-right sm:text-right">
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-400 font-bold text-lg">4.0%</span>
                    <span className="text-gray-500 text-xs">APY</span>
                  </div>
                  <div className="text-gray-500 text-[10px] mt-0.5">Max Return</div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3 pt-3 border-t border-[#1e1e1e]">
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 bg-blue-500/10 rounded flex items-center justify-center">
                      <span className="text-blue-400 text-[10px]">🔒</span>
                    </div>
                    <span className="text-gray-400">7-180 Days</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 bg-green-500/10 rounded flex items-center justify-center">
                      <span className="text-green-400 text-[10px]">$</span>
                    </div>
                    <span className="text-gray-400">Min $10</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium group-hover:gap-2 transition-all self-end sm:self-auto">
                  <span>Stake Now</span>
                  <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
          <div className="grid grid-cols-4 gap-2">
            <ActionButton icon={Wallet} label="Deposit" onClick={() => handleQuickAction('deposit')} />
            <ActionButton icon={CreditCard} label="Withdraw" onClick={() => handleQuickAction('withdraw')} />
            <ActionButton icon={ArrowRightLeft} label="Convert" onClick={() => handleQuickAction('convert')} />
            <ActionButton icon={PieChart} label="Portfolio" onClick={() => handleQuickAction('portfolio')} />
          </div>
        </div>

        {/* Menu Section 1 */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <MenuButton icon={History} label="Transaction history" onClick={() => handleMenuAction('transaction-history')} />
          <MenuButton 
            icon={Shield} 
            label="Verification status" 
            onClick={() => {}}
            showShield={kycStatus?.status === 'approved'}
          />
          <MenuButton icon={Key} label="Update the password" onClick={() => handleMenuAction('update-password')} isLast />
        </div>

        {/* Menu Section 2 */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <MenuButton icon={UserPlus} label="Invite" onClick={() => handleMenuAction('invite')} />
          <MenuButton icon={FileText} label="Legal Agreements" onClick={() => handleMenuAction('privacy-policy')} />
          <MenuButton icon={Download} label="Download APP" onClick={() => handleMenuAction('download-app')} />
          <MenuButton icon={Phone} label="Customer support" onClick={() => handleMenuAction('customer-support')} isLast />
        </div>

        {/* Danger Section */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <MenuButton icon={LogOut} label="Log out" danger onClick={() => handleMenuAction('logout')} isLast={!profile?.role || profile?.role !== 'user'} />
          {profile?.role === 'user' && (
            <MenuButton icon={Trash2} label="Delete Account" danger onClick={() => handleMenuAction('delete-account')} isLast />
          )}
        </div>

        {/* App & Notifications */}
        <PwaControls />
      </div>

      {/* Modals */}
      <DepositModal isOpen={activeModal === 'deposit'} onClose={() => setActiveModal(null)} />
      <WithdrawModal isOpen={activeModal === 'withdraw'} onClose={() => setActiveModal(null)} />
      <ConvertModal isOpen={activeModal === 'convert'} onClose={() => setActiveModal(null)} userId={profile?.id} />
      <PortfolioModal isOpen={activeModal === 'portfolio'} onClose={() => setActiveModal(null)} />
      <StakingModal isOpen={activeModal === 'staking'} onClose={() => setActiveModal(null)} userId={profile?.id} />
      <UnifiedTransactionHistoryModal isOpen={activeModal === 'transaction-history'} onClose={() => setActiveModal(null)} userId={profile.id} />
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
    <div className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-[#0a0a0a] border border-[#1e1e1e] hover:border-[#2a2a2a] hover:bg-[#151515] transition-all cursor-pointer group" onClick={onClick}>
      <div className="w-8 h-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl flex items-center justify-center group-hover:border-blue-500/30 transition-colors">
        <Icon size={14} className="text-gray-400 group-hover:text-blue-400 transition-colors" />
      </div>
      <span className="text-[10px] font-medium text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );
}

function MenuButton({ icon: Icon, label, danger, onClick, showShield, isLast }: { icon: LucideIcon; label: string; danger?: boolean; onClick?: () => void; showShield?: boolean; isLast?: boolean }) {
  return (
    <button 
      className={`w-full flex items-center px-4 py-3 text-left transition-colors hover:bg-[#1a1a1a] focus:outline-none ${
        !isLast ? 'border-b border-[#1e1e1e]' : ''
      }`} 
      onClick={onClick}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mr-3 ${
        danger ? 'bg-red-500/10' : 'bg-[#1a1a1a]'
      }`}>
        <Icon size={14} className={danger ? 'text-red-400' : 'text-gray-400'} />
      </div>
      <span className={`flex-1 text-sm ${danger ? 'text-red-400' : 'text-gray-300'}`}>{label}</span>
      {showShield ? (
        <div className="w-5 h-5 flex items-center justify-center" title="KYC Verified">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L4 6V12C4 16.5 7.5 20.5 12 22C16.5 20.5 20 16.5 20 12V6L12 2Z" fill="#10b981"/>
            <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      ) : (
        <span className="text-gray-600 text-xs">›</span>
      )}
    </button>
  );
}
