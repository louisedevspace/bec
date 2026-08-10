import logo from "@/assets/logo.png";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center z-[9999]">
      {/* Animated background gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Loading container */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Logo with glow and animation */}
        <div className="relative w-24 h-24">
          {/* Outer glow pulse */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 to-blue-500/5 blur-xl animate-pulse" />

          {/* Logo container */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#1e1e1e] to-[#0a0a0a] rounded-2xl border border-[#2a2a2a] flex items-center justify-center overflow-hidden shadow-2xl"
            style={{
              animation: 'subtle-scale 2s ease-in-out infinite',
            }}
          >
            <img src={logo} alt="Becxus" className="w-16 h-16 object-contain" />
          </div>

          {/* Animated ring effect */}
          <style>{`
            @keyframes subtle-scale {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.05); }
            }
            @keyframes pulse-ring {
              0% {
                box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
              }
              50% {
                box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
              }
              100% {
                box-shadow: 0 0 0 12px rgba(59, 130, 246, 0);
              }
            }
          `}</style>
          <div className="absolute inset-0 rounded-2xl border-2 border-blue-500/20 animate-pulse opacity-50" />
        </div>

        {/* Loading text with dots */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-medium text-gray-400">Loading</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
