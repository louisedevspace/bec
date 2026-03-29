import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

interface IlluminatedHeroProps {
  onStartTrading?: () => void;
}

export function IlluminatedHero({ onStartTrading }: IlluminatedHeroProps) {
  return (
    <div className="hero-glow-section relative flex w-full items-center justify-center overflow-hidden bg-black text-white px-4 py-14 border-b border-[#1e1e1e]">
      {/* Eclipse spheres — solid dark circles with outer rim glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute left-1/2 -translate-x-1/2 w-[800px] h-[800px] md:w-[1000px] md:h-[1000px] rounded-full sphere-dark sphere-glow-top opacity-0 animate-[onloadbgt_1s_ease-in-out_forwards]" />
        <div className="absolute left-1/2 -translate-x-1/2 w-[800px] h-[800px] md:w-[1000px] md:h-[1000px] rounded-full sphere-dark sphere-glow-bottom opacity-0 animate-[onloadbgb_1s_ease-in-out_forwards]" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto">
        {/* Logo */}
        <div className="mb-6">
          <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mx-auto mb-5 flex items-center justify-center overflow-hidden shadow-lg">
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-2xl md:text-4xl font-bold mb-1 tracking-tight text-white">
          TRADE WITH CONFIDENCE
        </h1>

        {/* Illuminated glow text — always uses the warm amber SVG filter */}
        <div
          className="text-2xl md:text-4xl font-bold mb-4 tracking-tight"
          style={{ filter: 'url(#glow-hero)' }}
        >
          <span className="relative inline-block text-amber-100">
            GROW WITH US
          </span>
        </div>

        {/* Subtitle */}
        <p className="max-w-xl mx-auto text-sm md:text-base font-semibold bg-gradient-to-t from-[#86868b] to-[#bdc2c9] bg-clip-text text-transparent mb-8">
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

      {/* SVG Glow Filter — warm amber/orange illumination */}
      <svg className="absolute" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id="glow-hero" colorInterpolationFilters="sRGB" x="-50%" y="-200%" width="200%" height="500%">
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
        </defs>
      </svg>
    </div>
  );
}
