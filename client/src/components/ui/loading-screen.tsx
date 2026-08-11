import logo from "@/assets/logo.png";
import { useExchangeName } from "@/hooks/use-exchange-name";
import { DotGridPattern } from "@/components/ui/dot-grid-pattern";

export function LoadingScreen() {
  const exchangeName = useExchangeName();
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-[9999] overflow-hidden">
      <DotGridPattern className="opacity-60" colorClassName="text-muted-foreground" />

      {/* Ambient corner glow, echoes the hero's eclipse-sphere treatment */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.14) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Logo with a spinning conic ring and a slower pulse ring behind it */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute w-28 h-28 rounded-full animate-spin"
            style={{
              background: "conic-gradient(from 0deg, hsl(var(--primary)) 0deg, transparent 100deg, transparent 260deg, hsl(var(--primary)) 360deg)",
              animationDuration: "1.6s",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px))",
            }}
            aria-hidden="true"
          />
          <div className="absolute w-20 h-20 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: "2.2s" }} aria-hidden="true" />
          <div className="relative w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center overflow-hidden shadow-sm">
            <img src={logo} alt={exchangeName} className="w-14 h-14 object-contain" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{exchangeName}</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Securely connecting</span>
            <span className="flex items-center gap-0.5">
              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
