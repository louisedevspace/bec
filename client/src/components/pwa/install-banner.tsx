import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { Logo } from "@/components/brand/logo";
import { trackClientMetric } from "@/lib/perf";
import { clearInstallPrompt, getInstallPrompt, onInstallPromptChange } from "@/sw-register";

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => getInstallPrompt());
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("pwaBannerDismissed") === "true";
    const installed = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    const installedBefore = !!localStorage.getItem("pwa_installed_at");
    if (dismissed || installed || installedBefore) {
      setVisible(false);
      return;
    }
    const unsubscribe = onInstallPromptChange((prompt) => {
      setDeferredPrompt(prompt);
      setVisible(!!prompt);
      if (prompt) {
        shownAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      }
    });
    const onAppInstalled = () => {
      try {
        localStorage.setItem("pwa_installed_at", String(Date.now()));
        localStorage.setItem("pwa_install_state", "installed");
      } catch {}
      setVisible(false);
      setDeferredPrompt(null);
      clearInstallPrompt();
    };
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.setProperty("--pwa-banner-top", "0px");
      return;
    }
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

  const onInstall = async () => {
    if (!deferredPrompt) return;
    const startedAt = shownAtRef.current || (typeof performance !== "undefined" ? performance.now() : Date.now());
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    trackClientMetric("pwa_install_initiated", Math.max(0, now - startedAt));
    setDeferredPrompt(null);
    setVisible(false);
    clearInstallPrompt();
  };

  const onDismiss = () => {
    const startedAt = shownAtRef.current || (typeof performance !== "undefined" ? performance.now() : Date.now());
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    trackClientMetric("pwa_install_banner_dismissed", Math.max(0, now - startedAt));
    sessionStorage.setItem("pwaBannerDismissed", "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Install Becxus"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[1000] pointer-events-none"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto max-w-3xl pointer-events-auto">
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
                <div className="text-sm font-semibold text-white">Install {config.appName}</div>
                <div className="text-xs text-gray-400">Add to your home screen for a faster, app-like experience</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button aria-label="Install Becxus" onClick={onInstall} className="h-8 px-3 text-xs bg-blue-500/90 hover:bg-blue-500 border border-blue-400/20 shadow-lg shadow-blue-500/20">
                Install
              </Button>
              <Button aria-label="Dismiss" onClick={onDismiss} variant="outline" className="h-8 px-3 text-xs bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
