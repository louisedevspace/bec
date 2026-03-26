import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { trackClientMetric } from "@/lib/perf";
import { clearInstallPrompt, getInstallPrompt, onInstallPromptChange } from "@/sw-register";

function isInstalledNow() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as any).standalone === true;
  return standalone || iosStandalone;
}

function getVariant() {
  const existing = localStorage.getItem("pwa_reengage_variant");
  if (existing === "A" || existing === "B") return existing;
  const assigned = Math.random() < 0.5 ? "A" : "B";
  localStorage.setItem("pwa_reengage_variant", assigned);
  return assigned;
}

export function PwaReengageBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => getInstallPrompt());
  const [visible, setVisible] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const timerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number>(0);
  const variant = getVariant();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubscribe = onInstallPromptChange((prompt) => {
      setDeferredPrompt(prompt);
      setCanInstall(!!prompt);
    });
    const onInstalled = () => {
      try {
        localStorage.setItem("pwa_installed_at", String(Date.now()));
        localStorage.setItem("pwa_install_state", "installed");
      } catch {}
      setVisible(false);
      setDeferredPrompt(null);
      setCanInstall(false);
      clearInstallPrompt();
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const root = rootRef.current;
    if (!root) return;
    const inner = root.querySelector("[data-banner-content]") as HTMLElement | null;
    if (!inner) return;
    const rect = inner.getBoundingClientRect();
    const styles = window.getComputedStyle(inner);
    const mt = parseFloat(styles.marginTop || "0");
    const mb = parseFloat(styles.marginBottom || "0");
    const height = rect.height + mt + mb;
    document.documentElement.style.setProperty("--pwa-banner-top", `${height}px`);
  }, [visible]);
  useEffect(() => {
    const dontAsk = localStorage.getItem("pwa_dont_ask_again") === "true";
    if (dontAsk) return;
    const installedBefore = !!localStorage.getItem("pwa_installed_at");
    const installedNow = isInstalledNow();
    if (!installedBefore) return;
    if (installedNow) return;
    const lastPrompt = parseInt(localStorage.getItem("pwa_reengage_last_prompt_at") || "0", 10);
    const cooldownMs = 3 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastPrompt < cooldownMs) return;
    const pageViews = parseInt(localStorage.getItem("pwa_page_views") || "0", 10);
    if (variant === "A") {
      if (pageViews >= 2) {
        setVisible(true);
        shownAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
        trackClientMetric("pwa_reengage_prompt_shown", 0);
      }
    } else {
      timerRef.current = window.setTimeout(() => {
        setVisible(true);
        shownAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
        trackClientMetric("pwa_reengage_prompt_shown", 0);
      }, 30000);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [variant]);

  const onInstall = async () => {
    localStorage.setItem("pwa_reengage_last_prompt_at", String(Date.now()));
    if (!deferredPrompt) {
      trackClientMetric("pwa_reengage_no_bip", 0);
      setVisible(false);
      return;
    }
    const startedAt = shownAtRef.current || (typeof performance !== "undefined" ? performance.now() : Date.now());
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    trackClientMetric("pwa_reengage_install_initiated", Math.max(0, now - startedAt));
    setVisible(false);
    setDeferredPrompt(null);
    clearInstallPrompt();
  };

  const onDismiss = () => {
    localStorage.setItem("pwa_reengage_last_prompt_at", String(Date.now()));
    const startedAt = shownAtRef.current || (typeof performance !== "undefined" ? performance.now() : Date.now());
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    trackClientMetric("pwa_reengage_dismiss", Math.max(0, now - startedAt));
    setVisible(false);
  };

  const onDontAsk = () => {
    localStorage.setItem("pwa_dont_ask_again", "true");
    localStorage.setItem("pwa_reengage_last_prompt_at", String(Date.now()));
    trackClientMetric("pwa_reengage_dont_ask", 0);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div ref={rootRef} role="dialog" aria-label="Reinstall Becxus" aria-live="polite" className="fixed top-0 left-0 right-0 z-[1000]" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-3xl">
        <div
          data-banner-content
          className="relative m-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-2xl text-white shadow-[0_8px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.04] transform transition-transform duration-300 ease-out translate-y-0"
        >
          {/* Top edge highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          {/* Blue accent glow */}
          <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                <Logo className="w-full h-full" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Reinstall Becxus</div>
                <div className="text-xs text-gray-400">Faster launch, offline support, push notifications</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onInstall} disabled={!canInstall} className="h-8 px-3 text-xs bg-blue-500/90 hover:bg-blue-500 border border-blue-400/20 shadow-lg shadow-blue-500/20">
                Install
              </Button>
              <Button onClick={onDismiss} variant="outline" className="h-8 px-3 text-xs bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">
                Later
              </Button>
              <Button onClick={onDontAsk} variant="outline" className="h-8 px-3 text-xs bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">
                Don’t ask again
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
