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
        'hero-glow-section relative flex w-full items-center justify-center overflow-hidden px-4 py-14 border-b',
        isDark ? 'bg-black text-white border-[#1e1e1e]' : 'bg-[#f0f2f5] text-slate-900 border-slate-200',
      )}
    >
      {/* Eclipse spheres */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 w-[800px] h-[800px] md:w-[1000px] md:h-[1000px] rounded-full',
            'opacity-0 animate-[onloadbgt_1s_ease-in-out_forwards]',
            isDark ? 'sphere-dark sphere-glow-dark-top' : 'sphere-light sphere-glow-light-top',
          )}
        />
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 w-[800px] h-[800px] md:w-[1000px] md:h-[1000px] rounded-full',
            'opacity-0 animate-[onloadbgb_1s_ease-in-out_forwards]',
            isDark ? 'sphere-dark sphere-glow-dark-bottom' : 'sphere-light sphere-glow-light-bottom',
          )}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto">
        <div className="mb-6">
          <div
            className={cn(
              'w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center overflow-hidden shadow-lg',
              isDark ? 'bg-[#1a1a1a] border border-[#2a2a2a]' : 'bg-white border border-slate-200',
            )}
          >
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
        </div>

        <h1
          className={cn(
            'text-2xl md:text-4xl font-bold mb-1 tracking-tight',
            isDark ? 'text-white' : 'text-slate-800',
          )}
        >
          TRADE WITH CONFIDENCE
        </h1>

        {/* Illuminated glow text — separate SVG filter per theme */}
        <div
          className="text-2xl md:text-4xl font-bold mb-4 tracking-tight hero-glow-text"
          style={{ filter: isDark ? 'url(#glow-dark)' : 'url(#glow-light)' }}
        >
          <span className={isDark ? 'text-amber-100' : 'text-blue-600'}>
            GROW WITH US
          </span>
        </div>

        <p
          className={cn(
            'max-w-xl mx-auto text-sm md:text-base font-semibold mb-8',
            isDark
              ? 'bg-gradient-to-t from-[#86868b] to-[#bdc2c9] bg-clip-text text-transparent'
              : 'text-slate-500',
          )}
        >
          GLOBAL REPRESENTATIVE ENCRYPTED MONEY TRADING PLATFORM
        </p>

        <button
          onClick={onStartTrading}
          className={cn(
            'group relative px-10 py-3.5 rounded-xl font-semibold text-sm tracking-wide text-white overflow-hidden transition-all duration-300',
            'bg-gradient-to-r from-blue-600 to-blue-500',
            'hover:from-blue-500 hover:to-blue-400 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-[1.03]',
            'active:scale-[0.98]',
          )}
        >
          <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <span className="relative">START TRADING</span>
        </button>
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

          {/* Light: blue/indigo glow (dark text on light bg) */}
          <filter id="glow-light" colorInterpolationFilters="sRGB" x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur4" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur14" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur8" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur24" />
            {/* Tight inner glow — deep blue */}
            <feColorMatrix in="blur4" result="c0" type="matrix" values="0.15 0 0 0 0  0 0.25 0 0 0  0 0 0.95 0 0  0 0 0 0.85 0" />
            <feOffset in="c0" result="l0" dx="0" dy="0" />
            {/* Mid spread — indigo */}
            <feColorMatrix in="blur14" result="c1" type="matrix" values="0.20 0 0 0 0  0 0.15 0 0 0  0 0 0.90 0 0  0 0 0 0.7 0" />
            <feOffset in="c1" result="l1" dx="0" dy="2" />
            {/* Wide bloom — purple */}
            <feColorMatrix in="blur8" result="c2" type="matrix" values="0.30 0 0 0 0  0 0.10 0 0 0  0 0 0.85 0 0  0 0 0 0.5 0" />
            <feOffset in="c2" result="l2" dx="0" dy="2" />
            {/* Outer haze */}
            <feColorMatrix in="blur24" result="c3" type="matrix" values="0.25 0 0 0 0  0 0.20 0 0 0  0 0 0.80 0 0  0 0 0 0.6 0" />
            <feOffset in="c3" result="l3" dx="0" dy="4" />
            {/* Deep drop */}
            <feColorMatrix in="blur24" result="c4" type="matrix" values="0.15 0 0 0 0  0 0.08 0 0 0  0 0 0.60 0 0  0 0 0 0.4 0" />
            <feOffset in="c4" result="l4" dx="0" dy="16" />
            <feMerge>
              <feMergeNode in="l0" /><feMergeNode in="l1" /><feMergeNode in="l2" />
              <feMergeNode in="l3" /><feMergeNode in="l4" />
              <feMergeNode in="l0" /><feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
}
