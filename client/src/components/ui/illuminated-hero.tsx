import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import logo from '@/assets/logo.png';

interface IlluminatedHeroProps {
  onStartTrading?: () => void;
}

export function IlluminatedHero({ onStartTrading }: IlluminatedHeroProps) {
  const { isDark } = useTheme();

  return (
    <div
      className={cn(
        'hero-glow-section relative flex w-full flex-wrap items-center justify-center overflow-hidden',
        'px-4 py-14 border-b',
        isDark
          ? 'bg-[#0a0a0a] text-white border-[#1e1e1e]'
          : 'bg-gradient-to-b from-slate-50 to-white text-slate-900 border-slate-200',
      )}
    >
      {/* Animated glow blobs */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="absolute w-full max-w-[600px] h-full">
          <div className={cn(
            'absolute size-full scale-[1.2] rounded-[100em] opacity-0 animate-[onloadbgt_1s_ease-in-out_forwards]',
            isDark ? 'shadow-bgt' : 'shadow-bgt-light',
          )} />
          <div className={cn(
            'absolute size-full scale-[1.2] rounded-[100em] opacity-0 animate-[onloadbgb_1s_ease-in-out_forwards]',
            isDark ? 'shadow-bgb' : 'shadow-bgb-light',
          )} />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto">
        {/* Logo */}
        <div className="mb-6">
          <div className={cn(
            'w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center overflow-hidden shadow-lg',
            isDark ? 'bg-[#1a1a1a] border border-[#2a2a2a]' : 'bg-white border border-slate-200',
          )}>
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Headline */}
        <h1 className={cn(
          'text-2xl md:text-4xl font-bold mb-1 tracking-tight',
          isDark ? 'text-white' : 'text-slate-800',
        )}>
          TRADE WITH CONFIDENCE
        </h1>

        {/* Illuminated glow text — uses inline style for the SVG filter */}
        <div
          className="text-2xl md:text-4xl font-bold mb-4 tracking-tight"
          style={{ filter: isDark ? 'url(#glow-dark)' : 'url(#glow-light)' }}
        >
          <span
            className={cn(
              'relative inline-block glow-text',
              isDark
                ? 'text-amber-100'
                : 'text-blue-600',
            )}
            data-text="GROW WITH US"
          >
            GROW WITH US
          </span>
        </div>

        {/* Subtitle */}
        <p className={cn(
          'max-w-xl mx-auto text-sm md:text-base font-semibold mb-8',
          isDark
            ? 'bg-gradient-to-t from-[#86868b] to-[#bdc2c9] bg-clip-text text-transparent'
            : 'text-slate-500',
        )}>
          GLOBAL REPRESENTATIVE ENCRYPTED MONEY TRADING PLATFORM
        </p>

        {/* CTA Button */}
        <button
          onClick={onStartTrading}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all text-sm"
        >
          START TRADING
        </button>
      </div>

      {/* SVG Glow Filters */}
      <svg className="absolute" width="0" height="0" aria-hidden="true">
        <defs>
          {/* Dark mode: warm amber/orange glow */}
          <filter
            id="glow-dark"
            colorInterpolationFilters="sRGB"
            x="-50%"
            y="-200%"
            width="200%"
            height="500%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur4" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="19" result="blur19" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur9" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="30" result="blur30" />
            <feColorMatrix in="blur4" result="c0" type="matrix"
              values="1 0 0 0 0  0 0.98 0 0 0  0 0 0.96 0 0  0 0 0 0.8 0" />
            <feOffset in="c0" result="l0" dx="0" dy="0" />
            <feColorMatrix in="blur19" result="c1" type="matrix"
              values="0.82 0 0 0 0  0 0.49 0 0 0  0 0 0.26 0 0  0 0 0 1 0" />
            <feOffset in="c1" result="l1" dx="0" dy="2" />
            <feColorMatrix in="blur9" result="c2" type="matrix"
              values="1 0 0 0 0  0 0.67 0 0 0  0 0 0.36 0 0  0 0 0 0.65 0" />
            <feOffset in="c2" result="l2" dx="0" dy="2" />
            <feColorMatrix in="blur30" result="c3" type="matrix"
              values="1 0 0 0 0  0 0.61 0 0 0  0 0 0.39 0 0  0 0 0 1 0" />
            <feOffset in="c3" result="l3" dx="0" dy="2" />
            <feColorMatrix in="blur30" result="c4" type="matrix"
              values="0.45 0 0 0 0  0 0.16 0 0 0  0 0 0 0 0  0 0 0 1 0" />
            <feOffset in="c4" result="l4" dx="0" dy="16" />
            <feColorMatrix in="blur30" result="c5" type="matrix"
              values="0.42 0 0 0 0  0 0.20 0 0 0  0 0 0.11 0 0  0 0 0 1 0" />
            <feOffset in="c5" result="l5" dx="0" dy="64" />
            <feMerge>
              <feMergeNode in="l0" />
              <feMergeNode in="l1" />
              <feMergeNode in="l2" />
              <feMergeNode in="l3" />
              <feMergeNode in="l4" />
              <feMergeNode in="l5" />
              <feMergeNode in="l0" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Light mode: blue/indigo glow */}
          <filter
            id="glow-light"
            colorInterpolationFilters="sRGB"
            x="-50%"
            y="-200%"
            width="200%"
            height="500%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur3" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur12" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur24" />
            <feColorMatrix in="blur3" result="c0" type="matrix"
              values="0.23 0 0 0 0  0 0.37 0 0 0  0 0 0.95 0 0  0 0 0 0.7 0" />
            <feOffset in="c0" result="l0" dx="0" dy="0" />
            <feColorMatrix in="blur12" result="c1" type="matrix"
              values="0.23 0 0 0 0  0 0.37 0 0 0  0 0 0.95 0 0  0 0 0 0.5 0" />
            <feOffset in="c1" result="l1" dx="0" dy="2" />
            <feColorMatrix in="blur24" result="c2" type="matrix"
              values="0.37 0 0 0 0  0 0.24 0 0 0  0 0 0.91 0 0  0 0 0 0.4 0" />
            <feOffset in="c2" result="l2" dx="0" dy="4" />
            <feColorMatrix in="blur24" result="c3" type="matrix"
              values="0.37 0 0 0 0  0 0.24 0 0 0  0 0 0.91 0 0  0 0 0 0.25 0" />
            <feOffset in="c3" result="l3" dx="0" dy="16" />
            <feMerge>
              <feMergeNode in="l0" />
              <feMergeNode in="l1" />
              <feMergeNode in="l2" />
              <feMergeNode in="l3" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
}
