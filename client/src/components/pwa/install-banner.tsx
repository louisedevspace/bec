import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { Logo } from "@/components/brand/logo";
import { trackClientMetric } from "@/lib/perf";

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
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
    const onBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
      shownAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    };
    const onAppInstalled = () => {
      try {
        localStorage.setItem("pwa_installed_at", String(Date.now()));
        localStorage.setItem("pwa_install_state", "installed");
      } catch {}
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
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
        <div data-banner-content className="m-3 rounded-xl border border-[#1e1e1e] bg-[#111] text-white shadow-2xl shadow-black/50 transform transition-transform duration-300 ease-out translate-y-0">
          <div className="flex items-center justify-between p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] flex items-center justify-center overflow-hidden">
                <Logo className="w-full h-full" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Install {config.appName}</div>
                <div className="text-xs text-gray-400">Add to your home screen for a faster, app-like experience</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button aria-label="Install Becxus" onClick={onInstall} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                Install
              </Button>
              <Button aria-label="Dismiss" onClick={onDismiss} variant="outline" className="h-8 px-3 text-xs bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]">
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
