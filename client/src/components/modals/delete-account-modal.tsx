import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleDeleteAccount = async () => {
    if (confirmationText !== 'DELETE') {
      toast({
        title: 'Error',
        description: 'Please type "DELETE" to confirm account deletion.',
        variant: 'destructive',
      });
      return;
    }

    setIsDeleting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete account');
      }

      toast({
        title: 'Account Deleted',
        description: 'Your account has been successfully deleted.',
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      localStorage.clear();
      setLocation('/login');
      
    } catch (error) {
      console.error('Error deleting account:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete account. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#111] border border-[#1e1e1e] text-white" hideCloseButton>
        <DialogHeader className="relative pb-4">
          <DialogTitle className="text-center text-lg font-semibold text-white flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
            Delete Account
          </DialogTitle>
          <button
            onClick={onClose}
            className="absolute top-0 right-0 w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
          >
            <X size={14} className="text-gray-400" />
          </button>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-center">
            <div className="text-red-400 text-sm font-medium mb-2">
              ⚠️ This action cannot be undone
            </div>
            <p className="text-gray-400 text-sm">
              Deleting your account will permanently remove all your data, including:
            </p>
            <ul className="text-gray-400 text-sm mt-2 text-left">
              <li>• Portfolio and balances</li>
              <li>• Transaction history</li>
              <li>• Staking positions</li>
              <li>• KYC documents</li>
              <li>• All personal information</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="confirmation" className="text-sm font-medium text-gray-300">
                Type "DELETE" to confirm:
              </Label>
              <Input
                id="confirmation"
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Type DELETE here"
                className="mt-1 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600 rounded-xl focus:border-[#3a3a3a]"
                disabled={isDeleting}
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 bg-transparent border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] hover:text-white rounded-xl"
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl"
              disabled={isDeleting || confirmationText !== 'DELETE'}
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

