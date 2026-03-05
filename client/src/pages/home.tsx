import { PriceTicker } from "@/components/crypto/price-ticker";
import { CryptoList } from "@/components/crypto/crypto-list";
import { lazy, Suspense, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLocation } from "wouter";
import { 
  Wallet, 
  ArrowRightLeft, 
  CreditCard, 
  UserPlus,
  Banknote,
  PieChart,
  History,
  Shield,
  Clock,
  TrendingUp
} from "lucide-react";
import logo from "@/assets/logo.png";

const StakingModal = lazy(() =>
  import("@/components/modals/staking-modal").then((m) => ({
    default: m.StakingModal,
  })),
);
const VerificationModal = lazy(() =>
  import("@/components/modals/verification-modal").then((m) => ({
    default: m.VerificationModal,
  })),
);
const LoanApplicationModal = lazy(() =>
  import("@/components/modals/loan-application-modal").then((m) => ({
    default: m.LoanApplicationModal,
  })),
);
const UserLoanHistoryModal = lazy(() =>
  import("@/components/modals/user-loan-history-modal").then((m) => ({
    default: m.UserLoanHistoryModal,
  })),
);

export default function HomePage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const openModal = (modalId: string) => {
    // Financial modals now live on the wallet page — navigate with deep-link params
    const walletActions: Record<string, string> = {
      deposit: "/wallet?action=deposit",
      withdraw: "/wallet?action=withdraw",
      convert: "/wallet?action=convert",
      portfolio: "/wallet?action=portfolio",
      "transaction-history": "/wallet?tab=history",
    };
    if (walletActions[modalId]) {
      setLocation(walletActions[modalId]);
      return;
    }
    setActiveModal(modalId);
  };
  const closeModal = () => setActiveModal(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  const handleStartTrading = () => {
    window.location.href = "/futures";
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="min-h-screen steel-gradient-bg">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#111] to-[#0a0a0a] px-4 py-14 text-center border-b border-[#1e1e1e]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="mb-8">
            <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mx-auto mb-5 flex items-center justify-center overflow-hidden shadow-lg">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl md:text-4xl font-bold mb-3 text-white tracking-tight">
              TRADE WITH CONFIDENCE, GROW WITH US
            </h1>
            <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto">
              GLOBAL REPRESENTATIVE ENCRYPTED MONEY TRADING PLATFORM
            </p>
          </div>
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all text-sm"
            onClick={handleStartTrading}
          >
            START TRADING
          </button>
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-5">
        {/* Welcome Card */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-semibold text-white">{getGreeting()}, Welcome!</h2>
              <p className="text-xs text-gray-500 mt-0.5">Your trusted digital trading platform</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                <Clock size={12} />
                <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="text-[11px] text-gray-600 mt-0.5">{new Date().toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* Featured Staking Section */}
        <div className="bg-gradient-to-br from-[#0f0f0f] to-[#0a0a0a] rounded-2xl border border-[#252525] overflow-hidden">
          <div 
            onClick={() => openModal('staking')}
            className="relative cursor-pointer group"
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-blue-500/5"></div>
            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all duration-500"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all duration-500"></div>
            
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-all duration-300">
                      <TrendingUp size={26} className="text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">✓</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg tracking-tight">USDT Staking</h3>
                    <p className="text-gray-400 text-sm">Flexible & Fixed Terms</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-bold text-2xl">4.0%</span>
                    <span className="text-gray-500 text-sm">APY</span>
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">Max Return</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                      <span className="text-blue-400 text-xs">🔒</span>
                    </div>
                    <span className="text-gray-400">7-180 Days</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-green-500/10 rounded-lg flex items-center justify-center">
                      <span className="text-green-400 text-xs">$</span>
                    </div>
                    <span className="text-gray-400">Min $10</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-blue-400 text-sm font-medium group-hover:gap-3 transition-all">
                  <span>Stake Now</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions - Professional Grid */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
          <div className="grid grid-cols-4 gap-3">
            <ActionButton icon={Wallet} label="Deposit" onClick={() => openModal('deposit')} />
            <ActionButton icon={ArrowRightLeft} label="Convert" onClick={() => openModal('convert')} />
            <ActionButton icon={CreditCard} label="Loan" onClick={() => openModal('loan-application')} />
            <ActionButton icon={UserPlus} label="Invite" onClick={() => {}} />
            <ActionButton icon={Banknote} label="Withdraw" onClick={() => openModal('withdraw')} />
            <ActionButton icon={PieChart} label="Portfolio" onClick={() => openModal('portfolio')} />
            <ActionButton icon={History} label="History" onClick={() => openModal('transaction-history')} />
            <ActionButton icon={Shield} label="Verify" onClick={() => openModal('verification')} />
          </div>
        </div>

        {/* Top Cryptos Price Overview */}
        <PriceTicker symbols={["BTC", "ETH", "TRX"]} />

        {/* Market Rates */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2 border-b border-[#1e1e1e]">
            <TrendingUp size={14} className="text-gray-400" />
            <span className="text-sm font-semibold text-white">Market Rates</span>
          </div>
          <CryptoList limit={10} />
        </div>

        {/* My Loans */}
        <div className="pb-4">
          <button
            onClick={() => openModal('loan-history')}
            className="w-full bg-[#111] rounded-2xl border border-[#1e1e1e] hover:border-[#2a2a2a] p-4 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl flex items-center justify-center">
                <CreditCard size={14} className="text-gray-400" />
              </div>
              <span className="text-sm font-medium text-white">My Loans</span>
            </div>
            <span className="text-gray-600 text-xs">View History →</span>
          </button>
        </div>
      </div>

      <Suspense fallback={null}>
        <StakingModal
          isOpen={activeModal === "staking"}
          onClose={closeModal}
          userId={userId}
        />
        <VerificationModal
          isOpen={activeModal === "verification"}
          onClose={closeModal}
        />
        <LoanApplicationModal
          isOpen={activeModal === "loan-application"}
          onClose={closeModal}
          userId={userId || ""}
        />
        <UserLoanHistoryModal
          isOpen={activeModal === "loan-history"}
          onClose={closeModal}
          userId={userId || ""}
        />
      </Suspense>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
}

function ActionButton({ icon: Icon, label, onClick, href }: ActionButtonProps) {
  const content = (
    <div className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-[#0a0a0a] border border-[#1e1e1e] hover:border-[#2a2a2a] hover:bg-[#111] transition-all cursor-pointer group">
      <div className="w-8 h-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl flex items-center justify-center group-hover:border-blue-500/30 transition-colors">
        <Icon size={14} className="text-gray-400 group-hover:text-blue-400 transition-colors" />
      </div>
      <span className="text-[10px] md:text-xs font-medium text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }

  return <div onClick={onClick}>{content}</div>;
}
