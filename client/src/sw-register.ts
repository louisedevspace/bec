// Store the deferred install prompt globally so it's not missed
let deferredInstallPrompt: Event | null = null;
let installPromptListeners: ((prompt: Event | null) => void)[] = [];
let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
let serviceWorkerError: string | null = null;

// Capture the beforeinstallprompt event as early as possible
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    if (window.location.pathname.startsWith('/admin')) {
      return;
    }
    e.preventDefault();
    deferredInstallPrompt = e;
    installPromptListeners.forEach(listener => listener(e));
  });
}

export function getInstallPrompt(): Event | null {
  return deferredInstallPrompt;
}

export function onInstallPromptChange(callback: (prompt: Event | null) => void): () => void {
  installPromptListeners.push(callback);
  if (deferredInstallPrompt) {
    callback(deferredInstallPrompt);
  }
  return () => {
    installPromptListeners = installPromptListeners.filter(l => l !== callback);
  };
}

export function clearInstallPrompt(): void {
  deferredInstallPrompt = null;
}

export function getPlatform(): 'ios' | 'android' | 'desktop' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  if (/windows|macintosh|linux/.test(ua) && !isAndroid && !isIOS) return 'desktop';
  return 'unknown';
}

export function isInstalledPWA(): boolean {
  if (typeof window === 'undefined') return false;
  
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((window.navigator as any).standalone === true) return true;
  if (document.referrer.includes('android-app://')) return true;
  return false;
}

export function canInstallPWA(): { canInstall: boolean; method: 'prompt' | 'manual' | 'none'; platform: string } {
  const platform = getPlatform();
  const isInstalled = isInstalledPWA();
  
  if (isInstalled) {
    return { canInstall: false, method: 'none', platform };
  }
  
  if (platform === 'ios') {
    return { canInstall: true, method: 'manual', platform };
  }
  
  if (deferredInstallPrompt) {
    return { canInstall: true, method: 'prompt', platform };
  }
  
  return { canInstall: platform === 'android' || platform === 'desktop', method: 'prompt', platform };
}

export function getServiceWorkerStatus(): { registered: boolean; error?: string; registration?: ServiceWorkerRegistration } {
  if (serviceWorkerError) {
    return { registered: false, error: serviceWorkerError };
  }
  if (serviceWorkerRegistration) {
    return { registered: true, registration: serviceWorkerRegistration };
  }
  return { registered: false, error: 'Not registered yet' };
}

export function getPushSupport(): { supported: boolean; reason?: string } {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { supported: false, reason: 'Not running in browser' };
  }
  
  const platform = getPlatform();
  const isInstalled = isInstalledPWA();
  
  const hostname = window.location.hostname;
  const isLocalhost = /^localhost|127\.0\.0\.1$/.test(hostname);
  const isSecure = window.location.protocol === 'https:' || isLocalhost;
  
  if (!isSecure) {
    return { supported: false };
  }
  
  if (!('serviceWorker' in navigator)) {
    return { supported: false };
  }
  
  if (serviceWorkerError) {
    return { supported: false };
  }
  
  if (!('PushManager' in window)) {
    if (platform === 'ios' && !isInstalled) {
      return { supported: false };
    }
    return { supported: false };
  }
  
  if (!('Notification' in window)) {
    return { supported: false };
  }
  
  return { supported: true };
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  serviceWorkerError = null;
  
  if (typeof navigator === 'undefined') {
    serviceWorkerError = 'Not running in browser';
    return;
  }
  
  if (!('serviceWorker' in navigator)) {
    serviceWorkerError = 'Service workers not supported';
    return;
  }
  
  const isLocalhost = /^localhost|127\.0\.0\.1$/.test(window.location.hostname);
  const isSecure = window.location.protocol === 'https:' || isLocalhost;
  
  if (!isSecure) {
    serviceWorkerError = 'HTTPS required';
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', { 
      scope: '/',
      updateViaCache: 'none'
    });
    
    serviceWorkerRegistration = registration;
    await navigator.serviceWorker.ready;
    
    return registration;
  } catch (error) {
    serviceWorkerError = error instanceof Error ? error.message : String(error);
    return;
  }
}

export async function waitForServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000)
      )
    ]);
    return registration;
  } catch {
    return null;
  }
}
