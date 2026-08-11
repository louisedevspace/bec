import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { Eye, EyeOff, AlertCircle, CheckCircle, Lock } from 'lucide-react';
import { useLocation } from 'wouter';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => setLocation('/login'), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 bg-card p-8 md:p-10 rounded-xl border border-border shadow-sm">
        <div className="flex flex-col items-center mb-2">
          <div className="w-16 h-16 bg-muted border border-border rounded-xl mb-4 flex items-center justify-center overflow-hidden">
            <Logo className="w-full h-full" />
          </div>
          <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-xl mb-3 flex items-center justify-center">
            <Lock size={22} className="text-primary" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-1 text-foreground tracking-tight">Set New Password</h2>
          <p className="text-muted-foreground text-sm text-center">Choose a strong new password for your account</p>
        </div>

        {!success ? (
          <>
            <div>
              <Label htmlFor="new-password" className="text-sm font-medium text-muted-foreground mb-2 block">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password (min 6 characters)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirm-password" className="text-sm font-medium text-muted-foreground mb-2 block">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg">
                <AlertCircle size={16} className="text-danger flex-shrink-0" />
                <span className="text-danger text-sm">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full font-semibold"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg">
            <CheckCircle size={16} className="text-success flex-shrink-0" />
            <span className="text-success text-sm">Password updated successfully! Redirecting to login...</span>
          </div>
        )}
      </form>
    </div>
  );
}
