import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '../../lib/supabaseClient';
import { buildApiUrl } from '../../lib/config';

interface AdminChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    email: string;
  };
}

export function AdminChangePasswordModal({ isOpen, onClose, user }: AdminChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setError(null);
      setSuccess(null);
    }
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate passwords
      if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters long');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('New passwords do not match');
      }

      // Get current user session (admin session)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Admin not authenticated');
      }

      // Call backend API to update user password
      const response = await fetch(buildApiUrl('/admin/update-user-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: user.id,
          newPassword
        })
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        throw new Error(result.message || 'Failed to update password');
      }

      setSuccess(`Password updated successfully for ${user.email}!`);

      // Clear form
      setNewPassword('');
      setConfirmPassword('');

      // Close modal after 3 seconds
      closeTimerRef.current = setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 3000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-xl">Change User Password</DialogTitle>
          <DialogDescription>
            Set a new password for this account
          </DialogDescription>
        </DialogHeader>

        {/* Identity zone: who this action targets */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
            {user.email ? user.email[0].toUpperCase() : '?'}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Target account</div>
            <div className="text-sm font-medium text-foreground truncate">{user.email}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Credentials zone */}
          <div className="space-y-4 p-4 rounded-2xl border border-border bg-muted/10">
            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
                  placeholder="Enter new password (min 6 characters)"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
                  placeholder="Confirm new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-center space-x-2 p-3 bg-warning/10 border border-warning/30 rounded-2xl">
            <Shield size={20} className="text-warning shrink-0" />
            <span className="text-warning text-sm">
              This will update the password for {user.email}. The user will be able to login with the new password immediately.
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-danger/10 border border-danger/30 rounded-2xl">
              <AlertCircle size={20} className="text-danger shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center space-x-2 p-3 bg-success/10 border border-success/30 rounded-2xl">
              <CheckCircle size={20} className="text-success shrink-0" />
              <span className="text-success text-sm">{success}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
