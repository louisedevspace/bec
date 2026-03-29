import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

interface IlluminatedHeroProps {
  onStartTrading?: () => void;
}

export function IlluminatedHero({ onStartTrading }: IlluminatedHeroProps) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-wrap items-center justify-center overflow-hidden',
        'bg-[#0a0a0a] text-white',
        'text-[calc(var(--size)*0.022)] [--factor:min(1000px,100vh)] [--size:min(var(--factor),100vw)]',
        'px-4 py-14 border-b border-[#1e1e1e]',
      )}
    >
      {/* Animated glow blobs */}
      <div className="absolute h-full w-full max-w-[44em] pointer-events-none">
        <div className="absolute size-full scale-[1.2] rounded-[100em] opacity-0 shadow-bgt animate-[onloadbgt_1s_ease-in-out_forwards]" />
        <div className="absolute size-full scale-[1.2] rounded-[100em] opacity-0 shadow-bgb animate-[onloadbgb_1s_ease-in-out_forwards]" />
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
        <h1 className="text-2xl md:text-4xl font-bold mb-3 tracking-tight" aria-hidden="true">
          TRADE WITH CONFIDENCE
          <br />
          <span
            className={cn(
              'relative inline-block',
              'before:absolute before:animate-[onloadopacity_1s_ease-out_forwards] before:opacity-0 before:content-[attr(data-text)]',
              'before:bg-[linear-gradient(0deg,#dfe5ee_0%,#fffaf6_50%)] before:bg-clip-text before:text-[#fffaf6]',
              'filter-[url(#glow-4)]',
            )}
            data-text="GROW WITH US"
          >
            GROW WITH US
          </span>
        </h1>

        {/* Subtitle with glow gradient */}
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

      {/* SVG Glow Filter */}
      <svg
        className="absolute -z-[1] h-0 w-0"
        width="1440"
        height="300"
        viewBox="0 0 1440 300"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter
            id="glow-4"
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
            <feColorMatrix in="blur4" result="color-0-blur" type="matrix" values="1 0 0 0 0  0 0.98 0 0 0  0 0 0.96 0 0  0 0 0 0.8 0" />
            <feOffset in="color-0-blur" result="layer-0-offsetted" dx="0" dy="0" />
            <feColorMatrix in="blur19" result="color-1-blur" type="matrix" values="0.82 0 0 0 0  0 0.49 0 0 0  0 0 0.26 0 0  0 0 0 1 0" />
            <feOffset in="color-1-blur" result="layer-1-offsetted" dx="0" dy="2" />
            <feColorMatrix in="blur9" result="color-2-blur" type="matrix" values="1 0 0 0 0  0 0.67 0 0 0  0 0 0.36 0 0  0 0 0 0.65 0" />
            <feOffset in="color-2-blur" result="layer-2-offsetted" dx="0" dy="2" />
            <feColorMatrix in="blur30" result="color-3-blur" type="matrix" values="1 0 0 0 0  0 0.61 0 0 0  0 0 0.39 0 0  0 0 0 1 0" />
            <feOffset in="color-3-blur" result="layer-3-offsetted" dx="0" dy="2" />
            <feColorMatrix in="blur30" result="color-4-blur" type="matrix" values="0.45 0 0 0 0  0 0.16 0 0 0  0 0 0 0 0  0 0 0 1 0" />
            <feOffset in="color-4-blur" result="layer-4-offsetted" dx="0" dy="16" />
            <feColorMatrix in="blur30" result="color-5-blur" type="matrix" values="0.42 0 0 0 0  0 0.20 0 0 0  0 0 0.11 0 0  0 0 0 1 0" />
            <feOffset in="color-5-blur" result="layer-5-offsetted" dx="0" dy="64" />
            <feColorMatrix in="blur30" result="color-6-blur" type="matrix" values="0.21 0 0 0 0  0 0.11 0 0 0  0 0 0.07 0 0  0 0 0 1 0" />
            <feOffset in="color-6-blur" result="layer-6-offsetted" dx="0" dy="64" />
            <feColorMatrix in="blur30" result="color-7-blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.68 0" />
            <feOffset in="color-7-blur" result="layer-7-offsetted" dx="0" dy="64" />
            <feMerge>
              <feMergeNode in="layer-0-offsetted" />
              <feMergeNode in="layer-1-offsetted" />
              <feMergeNode in="layer-2-offsetted" />
              <feMergeNode in="layer-3-offsetted" />
              <feMergeNode in="layer-4-offsetted" />
              <feMergeNode in="layer-5-offsetted" />
              <feMergeNode in="layer-6-offsetted" />
              <feMergeNode in="layer-7-offsetted" />
              <feMergeNode in="layer-0-offsetted" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
}
