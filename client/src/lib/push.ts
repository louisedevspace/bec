import { supabase } from './supabaseClient';
import { getPushSupport, isInstalledPWA, getPlatform, waitForServiceWorker } from '@/sw-register';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }
  
  const platform = getPlatform();
  if (platform === 'ios' && !isInstalledPWA()) {
    return false;
  }
  
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

export async function subscribePush(registration?: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  try {
    const pushSupport = getPushSupport();
    if (!pushSupport.supported) {
      return null;
    }

    let reg: ServiceWorkerRegistration | null;
    try {
      reg = registration || await waitForServiceWorker();
      if (!reg) {
        return null;
      }
    } catch {
      return null;
    }
    
    const resp = await fetch('/api/push/public-key');
    if (!resp.ok) {
      return null;
    }
    
    const { publicKey } = await resp.json();
    if (!publicKey) {
      return null;
    }

    let sub = await reg.pushManager.getSubscription();
    
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      return null;
    }

    const saveResp = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(sub.toJSON()),
    });

    if (!saveResp.ok) {
      return null;
    }

    return sub;
  } catch {
    return null;
  }
}

export async function unsubscribePush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) {
      return true;
    }
    
    const reg = await waitForServiceWorker();
    if (!reg) {
      return true;
    }
    
    const sub = await reg.pushManager.getSubscription();
    
    if (sub) {
      await sub.unsubscribe();
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (token) {
      await fetch('/api/push/unsubscribe', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    }

    return true;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
