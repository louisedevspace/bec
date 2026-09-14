import { useEffect, useState } from 'react';
import { Bell, BellOff, AlertTriangle, Loader2 } from 'lucide-react';
import { requestNotificationPermission, subscribePush } from '@/lib/push';
import { getPushSupport } from '@/sw-register';

type State = 'checking' | 'unsupported' | 'prompt' | 'granted' | 'denied' | 'working' | 'failed';

/**
 * Asks for OS notification permission and registers the push subscription.
 *
 * Rendered in the support chats so both customers and agents actually receive
 * new-message notifications — permission must be requested from a user
 * gesture, so this is a button rather than an automatic prompt.
 *
 * When permission was already granted the component re-registers the
 * subscription silently (new device, cleared storage) and renders nothing.
 */
export function EnablePushButton({ className = '' }: { className?: string }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (typeof window === 'undefined' || !('Notification' in window) || !getPushSupport().supported) {
        if (!cancelled) setState('unsupported');
        return;
      }

      if (Notification.permission === 'granted') {
        // Make sure this device is registered server-side. Don't just
        // assume it worked — a failed subscribe here means the OS
        // permission is on but the server never actually learned about
        // this device, so pushes silently never arrive.
        const sub = await subscribePush();
        if (!cancelled) setState(sub ? 'granted' : 'failed');
        return;
      }

      if (!cancelled) setState(Notification.permission === 'denied' ? 'denied' : 'prompt');
    };

    init();
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    setState('working');
    const granted = await requestNotificationPermission();
    if (!granted) {
      setState(Notification.permission === 'denied' ? 'denied' : 'prompt');
      return;
    }
    const sub = await subscribePush();
    setState(sub ? 'granted' : 'failed');
  };

  if (state === 'checking' || state === 'granted' || state === 'unsupported') return null;

  if (state === 'denied') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] text-muted-foreground ${className}`}>
        <BellOff size={13} />
        Notifications blocked in browser settings
      </span>
    );
  }

  if (state === 'failed') {
    return (
      <button
        type="button"
        onClick={enable}
        className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl border border-warning/30 bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors ${className}`}
      >
        <AlertTriangle size={13} />
        Couldn't enable notifications — tap to retry
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={state === 'working'}
      className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl border border-primary/30 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-60 ${className}`}
    >
      {state === 'working' ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
      Enable notifications
    </button>
  );
}
