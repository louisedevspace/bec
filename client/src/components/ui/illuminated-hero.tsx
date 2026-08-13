import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import { DotGridPattern } from '@/components/ui/dot-grid-pattern';
import { Eye, EyeOff, Wallet, Banknote, ArrowRightLeft, History, ArrowRight } from 'lucide-react';
import logo from '@/assets/logo.png';

interface IlluminatedHeroProps {
  greeting: string;
  onStartTrading?: () => void;
  onViewWallet?: () => void;
  totalValue: number;
  estimatedPnl: number;
  hideBalances: boolean;
  onToggleHideBalances: () => void;
  onQuickAction: (action: string) => void;
  formattedTotalValue: string;
  formattedPnl: string;
}

export function IlluminatedHero({
  greeting,
  onStartTrading,
  onViewWallet,
  estimatedPnl,
  hideBalances,
  onToggleHideBalances,
  onQuickAction,
  formattedTotalValue,
  formattedPnl,
}: IlluminatedHeroProps) {
  const { isDark } = useTheme();

  return (
    <div
      className={cn(
        'hero-glow-section relative flex w-full items-center overflow-hidden px-4 py-12 md:py-16 border-b border-border bg-background text-foreground',
      )}
    >
      {/* Eclipse spheres — signature ambient glow, kept from the prior treatment */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 w-[800px] h-[800px] md:w-[1100px] md:h-[1100px] rounded-full',
            'opacity-0 animate-[onloadbgt_1s_ease-in-out_forwards]',
            isDark ? 'sphere-dark sphere-glow-dark-top' : 'sphere-light sphere-glow-light-top',
          )}
        />
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 w-[800px] h-[800px] md:w-[1100px] md:h-[1100px] rounded-full',
            'opacity-0 animate-[onloadbgb_1s_ease-in-out_forwards]',
            isDark ? 'sphere-dark sphere-glow-dark-bottom' : 'sphere-light sphere-glow-light-bottom',
          )}
        />
      </div>

      {/* Blueprint texture — small dots, plus marks, x marks */}
      <DotGridPattern className="opacity-70" colorClassName="text-muted-foreground" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
        {/* Left — greeting, headline, CTAs */}
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground mb-4 px-2.5 py-1 rounded-full border border-border bg-card/60">
            {greeting}
          </div>

          <div className="mb-5">
            <div className="w-14 h-14 rounded-2xl mx-auto lg:mx-0 mb-5 flex items-center justify-center overflow-hidden shadow-sm bg-card border border-border">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
          </div>

          <h1 className="text-3xl md:text-5xl font-bold mb-1 tracking-tight text-foreground text-balance">
            TRADE WITH CONFIDENCE
          </h1>

          <div
            className="text-3xl md:text-5xl font-bold mb-5 tracking-tight hero-glow-text"
            style={{ filter: isDark ? 'url(#glow-dark)' : 'url(#glow-light)' }}
          >
            <span className="text-primary">GROW WITH US</span>
          </div>

          <p className="max-w-xl mx-auto lg:mx-0 text-sm md:text-base font-semibold mb-8 text-muted-foreground text-balance">
            GLOBAL REPRESENTATIVE ENCRYPTED MONEY TRADING PLATFORM
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
            <button
              onClick={onStartTrading}
              className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3.5 rounded-2xl shadow-sm transition-colors text-sm inline-flex items-center justify-center gap-2 group"
            >
              START TRADING
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={onViewWallet}
              className="w-full sm:w-auto bg-card hover:bg-muted text-foreground border border-border font-semibold px-8 py-3.5 rounded-2xl transition-colors text-sm"
            >
              VIEW WALLET
            </button>
          </div>
        </div>

        {/* Right — live portfolio glance card, floating over the glow */}
        <div className="relative">
          <div className="rounded-3xl border border-border bg-card/90 backdrop-blur-xl shadow-lg p-5 md:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Total Portfolio Value</p>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl md:text-3xl font-bold text-foreground tabular-nums">
                    {hideBalances ? '••••••' : formattedTotalValue}
                  </span>
                  {!hideBalances && (
                    <span className={`text-xs font-semibold tabular-nums ${estimatedPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                      {estimatedPnl >= 0 ? '+' : '-'}{formattedPnl}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onToggleHideBalances}
                className="shrink-0 p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={hideBalances ? 'Show balances' : 'Hide balances'}
              >
                {hideBalances ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <HeroQuickAction icon={Wallet} label="Deposit" onClick={() => onQuickAction('deposit')} />
              <HeroQuickAction icon={Banknote} label="Withdraw" onClick={() => onQuickAction('withdraw')} />
              <HeroQuickAction icon={ArrowRightLeft} label="Convert" onClick={() => onQuickAction('convert')} />
              <HeroQuickAction icon={History} label="History" onClick={() => onQuickAction('transaction-history')} />
            </div>
          </div>
        </div>
      </div>

      {/* SVG Glow Filters — both rendered, only one active via inline style */}
      <svg className="absolute" width="0" height="0" aria-hidden="true">
        <defs>
          {/* Dark: warm amber glow (light text on dark bg) */}
          <filter id="glow-dark" colorInterpolationFilters="sRGB" x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur4" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="19" result="blur19" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur9" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="30" result="blur30" />
            <feColorMatrix in="blur4" result="c0" type="matrix" values="1 0 0 0 0  0 0.98 0 0 0  0 0 0.96 0 0  0 0 0 0.8 0" />
            <feOffset in="c0" result="l0" dx="0" dy="0" />
            <feColorMatrix in="blur19" result="c1" type="matrix" values="0.82 0 0 0 0  0 0.49 0 0 0  0 0 0.26 0 0  0 0 0 1 0" />
            <feOffset in="c1" result="l1" dx="0" dy="2" />
            <feColorMatrix in="blur9" result="c2" type="matrix" values="1 0 0 0 0  0 0.67 0 0 0  0 0 0.36 0 0  0 0 0 0.65 0" />
            <feOffset in="c2" result="l2" dx="0" dy="2" />
            <feColorMatrix in="blur30" result="c3" type="matrix" values="1 0 0 0 0  0 0.61 0 0 0  0 0 0.39 0 0  0 0 0 1 0" />
            <feOffset in="c3" result="l3" dx="0" dy="2" />
            <feColorMatrix in="blur30" result="c4" type="matrix" values="0.45 0 0 0 0  0 0.16 0 0 0  0 0 0 0 0  0 0 0 1 0" />
            <feOffset in="c4" result="l4" dx="0" dy="16" />
            <feColorMatrix in="blur30" result="c5" type="matrix" values="0.42 0 0 0 0  0 0.20 0 0 0  0 0 0.11 0 0  0 0 0 1 0" />
            <feOffset in="c5" result="l5" dx="0" dy="64" />
            <feMerge>
              <feMergeNode in="l0" /><feMergeNode in="l1" /><feMergeNode in="l2" />
              <feMergeNode in="l3" /><feMergeNode in="l4" /><feMergeNode in="l5" />
              <feMergeNode in="l0" /><feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Light: soft accent-colored glow (dark text on light bg).
              Near-identity color matrices — like #glow-dark below — so the
              glow just inherits whatever color the text already is
              (text-primary, i.e. the site's configured accent) instead of
              forcing a fixed hue. This used to hard-multiply everything
              toward blue/indigo/purple regardless of the actual accent
              theme, which read as an awkward, mismatched flare. */}
          <filter id="glow-light" colorInterpolationFilters="sRGB" x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur4" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur14" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur24" />
            <feColorMatrix in="blur4" result="c0" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" />
            <feOffset in="c0" result="l0" dx="0" dy="0" />
            <feColorMatrix in="blur14" result="c1" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.3 0" />
            <feOffset in="c1" result="l1" dx="0" dy="2" />
            <feColorMatrix in="blur24" result="c2" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.18 0" />
            <feOffset in="c2" result="l2" dx="0" dy="4" />
            <feMerge>
              <feMergeNode in="l0" /><feMergeNode in="l1" /><feMergeNode in="l2" />
              <feMergeNode in="l0" /><feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
}

function HeroQuickAction({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ size?: number | string; className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-2 rounded-xl bg-background border border-border hover:border-primary/40 hover:bg-muted transition-all group"
    >
      <Icon size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
      <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight">{label}</span>
    </button>
  );
}
