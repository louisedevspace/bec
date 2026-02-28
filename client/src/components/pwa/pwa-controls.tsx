import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { subscribePush, requestNotificationPermission, unsubscribePush } from "@/lib/push";
import { useToast } from "@/hooks/use-toast";
import { 
  getInstallPrompt, 
  onInstallPromptChange, 
  clearInstallPrompt,
  getPlatform,
  isInstalledPWA,
  getPushSupport,
  getServiceWorkerStatus,
  registerServiceWorker
} from "@/sw-register";
import { Share, Download } from "lucide-react";

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => getInstallPrompt());
  const [isInstalled, setIsInstalled] = useState(() => isInstalledPWA());
  const [platform, setPlatform] = useState<string>('unknown');

  useEffect(() => {
    setPlatform(getPlatform());
    
    const unsubscribe = onInstallPromptChange((prompt) => {
      setDeferredPrompt(prompt);
    });

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      clearInstallPrompt();
    };
    
    window.addEventListener("appinstalled", handleInstalled);
    
    const checkInstalled = () => {
      setIsInstalled(isInstalledPWA());
    };
    
    document.addEventListener('visibilitychange', checkInstalled);
    
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", handleInstalled);
      document.removeEventListener('visibilitychange', checkInstalled);
    };
  }, []);

  return { deferredPrompt, isInstalled, platform };
}

function usePushState() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const checkStatus = async () => {
      const status = getServiceWorkerStatus();
      
      if (!status.registered && !status.error) {
        await registerServiceWorker();
      }
      
      const support = getPushSupport();
      setSupported(support.supported);
      
      if (!support.supported) return;
      
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setEnabled(!!sub);
      } catch {
        setSupported(false);
      }
    };
    
    checkStatus();
  }, []);

  const toggle = async () => {
    setLoading(true);
    try {
      if (!enabled) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          toast({
            title: "Permission Denied",
            description: "Please enable notifications in your browser settings.",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
        
        const sub = await subscribePush();
        if (sub) {
          setEnabled(true);
          toast({
            title: "Notifications Enabled",
            description: "You will now receive push notifications."
          });
        } else {
          toast({
            title: "Unable to Enable",
            description: "Push notifications are not available at this time.",
            variant: "destructive"
          });
        }
      } else {
        const success = await unsubscribePush();
        if (success) {
          setEnabled(false);
          toast({
            title: "Notifications Disabled",
            description: "You will no longer receive push notifications."
          });
        }
      }
    } catch {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return { enabled, loading, toggle, supported };
}

export function PwaControls() {
  const { deferredPrompt, isInstalled, platform } = useInstallPrompt();
  const { enabled, loading, toggle, supported } = usePushState();
  const { toast } = useToast();
  
  const isIOS = platform === 'ios';
  const canPromptInstall = !!deferredPrompt && !isInstalled;
  
  const handleInstall = async () => {
    if (isIOS) {
      toast({
        title: "Install on iOS",
        description: "Tap the Share button, then 'Add to Home Screen'",
      });
      return;
    }
    
    if (!deferredPrompt) {
      toast({
        title: "Installation",
        description: "Use your browser menu to install this app.",
      });
      return;
    }
    
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        clearInstallPrompt();
        toast({
          title: "App Installed!",
          description: "Becxus has been added to your home screen."
        });
      }
    } catch {
      // Silently handle
    }
  };

  const getInstallButtonProps = () => {
    if (isInstalled) {
      return { disabled: true, label: "Installed", icon: null };
    }
    
    if (isIOS) {
      return { disabled: false, label: "Add to Home", icon: <Share size={14} className="mr-1" /> };
    }
    
    return {
      disabled: false,
      label: "Install App",
      icon: <Download size={14} className="mr-1" />
    };
  };
  
  const buttonProps = getInstallButtonProps();

  return (
    <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-shrink-0">
          <div className="text-sm font-semibold text-white">App & Notifications</div>
          <div className="text-xs text-gray-500">Install the app and manage push notifications</div>
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
          <Button 
            onClick={handleInstall} 
            disabled={buttonProps.disabled}
            className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 flex items-center"
          >
            {buttonProps.icon}
            {buttonProps.label}
          </Button>
          
          {supported ? (
            <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg px-3 py-2 border border-[#2a2a2a]">
              <span className="text-xs text-gray-300 font-medium">Push</span>
              <Switch 
                checked={enabled} 
                disabled={loading} 
                onCheckedChange={toggle}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg px-3 py-2 border border-[#2a2a2a]">
              <span className="text-xs text-gray-500">Push unavailable</span>
            </div>
          )}
        </div>
      </div>
      
      {!isInstalled && isIOS && (
        <div className="mt-3 text-xs text-gray-500 border-t border-[#1e1e1e] pt-3">
          <span>
            <strong>iOS:</strong> Tap <Share size={12} className="inline mx-1" /> Share, then "Add to Home Screen"
          </span>
        </div>
      )}
    </div>
  );
}
