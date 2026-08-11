import { useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '../lib/supabaseClient';
import { config } from '../lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { useExchangeName } from '@/hooks/use-exchange-name';
import { Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export default function SignupPage() {
  const exchangeName = useExchangeName();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Register with Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: config.authRedirectUrl
        }
      });
      if (signUpError || !data.user) throw signUpError || new Error('Signup failed');

      // 2. Store complete profile data in localStorage for later use after email confirmation
      localStorage.setItem('pendingProfile', JSON.stringify({
        id: data.user.id,
        username: email.split('@')[0],
        email: email,
        full_name: fullName,
        phone,
        role: 'user',
        is_active: true,
        is_verified: false,
        credit_score: 0.60,
        display_id: Math.random().toString(36).substring(2, 10).toUpperCase()
      }));

      setSuccess('Signup successful! Please check your email and click the confirmation link. You will be redirected to the login page where you can sign in.');
      setTimeout(() => setLocation('/login'), 2000);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5 bg-card p-8 md:p-10 rounded-xl border border-border shadow-sm">
        <div className="flex flex-col items-center mb-2">
          <div className="w-16 h-16 bg-muted border border-border rounded-xl mb-4 flex items-center justify-center overflow-hidden">
            <Logo className="w-full h-full" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-1 text-foreground tracking-tight">Create Your Account</h2>
          <p className="text-muted-foreground text-sm">Sign up to access {exchangeName}</p>
        </div>
        <div>
          <Label htmlFor="fullName" className="text-sm font-medium text-muted-foreground mb-2 block">Full Name</Label>
          <Input id="fullName" placeholder="e.g. John Doe" value={fullName} onChange={e => setFullName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="phone" className="text-sm font-medium text-muted-foreground mb-2 block">Phone Number</Label>
          <Input id="phone" placeholder="e.g. +1 234 567 8901" value={phone} onChange={e => setPhone(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="email" className="text-sm font-medium text-muted-foreground mb-2 block">Email Address</Label>
          <Input id="email" type="email" placeholder="e.g. you@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="password" className="text-sm font-medium text-muted-foreground mb-2 block">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" value={password} onChange={e => setPassword(e.target.value)} required className="pr-10" />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg">
            <AlertCircle size={16} className="text-danger flex-shrink-0" />
            <span className="text-danger text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg">
            <CheckCircle size={16} className="text-success flex-shrink-0" />
            <span className="text-success text-sm">{success}</span>
          </div>
        )}

        <Button type="submit" className="w-full font-semibold" disabled={loading}>{loading ? 'Signing up...' : 'Sign Up'}</Button>
        <div className="text-sm text-center mt-2 text-muted-foreground">
          Already have an account? <a href="/login" className="text-primary hover:text-primary/80 transition-colors">Login</a>
        </div>
      </form>
    </div>
  );
}
