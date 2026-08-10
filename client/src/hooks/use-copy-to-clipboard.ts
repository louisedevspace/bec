import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = async (text: string, successMessage?: string) => {
    try {
      // Check if the Clipboard API is available
      if (navigator.clipboard && window.isSecureContext) {
        // Use the modern Clipboard API
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (!successful) {
          throw new Error('Copy command failed');
        }
      }

      setCopied(true);
      toast({
        title: "Copied!",
        description: successMessage || "Text copied to clipboard.",
      });
      
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
      
      return true;
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      toast({
        title: "Copy Failed",
        description: "Failed to copy text to clipboard. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    copied,
    copyToClipboard,
  };
}
