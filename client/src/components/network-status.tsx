import { useState, useEffect, useCallback, useRef } from "react";
import { WifiOff, Wifi, X } from "lucide-react";

type NetworkState = "online" | "offline" | null;

export function NetworkStatusNotification() {
  const [status, setStatus] = useState<NetworkState>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMount = useRef(true);

  const clearTimer = useCallback(() => {
    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setVisible(false);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    // Don't show notification on initial load if already online
    const handleOnline = () => {
      if (initialMount.current) return;
      clearTimer();
      setStatus("online");
      setDismissed(false);
      setVisible(true);
      // Auto-hide "back online" after 4 seconds
      autoHideTimer.current = setTimeout(() => {
        setVisible(false);
      }, 4000);
    };

    const handleOffline = () => {
      initialMount.current = false;
      clearTimer();
      setStatus("offline");
      setDismissed(false);
      setVisible(true);
      // Offline notification stays until dismissed or connection restored
    };

    // If the browser is already offline on mount, show immediately
    if (!navigator.onLine) {
      initialMount.current = false;
      setStatus("offline");
      setVisible(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // After a brief delay, allow future online events to show
    const mountTimer = setTimeout(() => {
      initialMount.current = false;
    }, 2000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearTimer();
      clearTimeout(mountTimer);
    };
  }, [clearTimer]);

  if (!visible || dismissed || !status) return null;

  const isOffline = status === "offline";

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none animate-in slide-in-from-top duration-300">
      <div
        className={`
          pointer-events-auto mx-4 mt-4 flex items-center gap-3 rounded-xl px-5 py-3.5
          shadow-sm border transition-all duration-300 max-w-md w-full bg-card
          ${
            isOffline
              ? "border-danger/30 text-foreground"
              : "border-success/30 text-foreground"
          }
        `}
      >
        {/* Icon */}
        <div
          className={`
            flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full
            ${isOffline ? "bg-danger/15" : "bg-success/15"}
          `}
        >
          {isOffline ? (
            <WifiOff className="w-5 h-5 text-danger" />
          ) : (
            <Wifi className="w-5 h-5 text-success" />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight text-foreground">
            {isOffline ? "No Internet Connection" : "Back Online"}
          </p>
          <p className="text-xs mt-0.5 text-muted-foreground">
            {isOffline
              ? "Please check your network and try again"
              : "Your connection has been restored"}
          </p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className={`
            flex-shrink-0 p-1.5 rounded-lg transition-colors text-muted-foreground
            ${
              isOffline
                ? "hover:bg-danger/15 hover:text-danger"
                : "hover:bg-success/15 hover:text-success"
            }
          `}
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
