import { useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { Eye, EyeOff } from 'lucide-react';

export default function SignupPage() {
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
          emailRedirectTo: `${window.location.origin}/login`
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#111] to-[#0a0a0a] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-md space-y-5 bg-[#111] p-8 md:p-10 rounded-2xl border border-[#1e1e1e] shadow-2xl shadow-black/40">
        <div className="flex flex-col items-center mb-2">
          <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mb-4 flex items-center justify-center overflow-hidden shadow-lg">
            <Logo className="w-full h-full" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-1 text-white tracking-tight">Create Your Account</h2>
          <p className="text-gray-500 text-sm">Sign up to access Becxus</p>
        </div>
        <div>
          <Label htmlFor="fullName" className="text-sm font-medium text-gray-400 mb-2 block">Full Name</Label>
          <Input id="fullName" placeholder="e.g. John Doe" value={fullName} onChange={e => setFullName(e.target.value)} required className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl" />
        </div>
        <div>
          <Label htmlFor="phone" className="text-sm font-medium text-gray-400 mb-2 block">Phone Number</Label>
          <Input id="phone" placeholder="e.g. +1 234 567 8901" value={phone} onChange={e => setPhone(e.target.value)} required className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl" />
        </div>
        <div>
          <Label htmlFor="email" className="text-sm font-medium text-gray-400 mb-2 block">Email Address</Label>
          <Input id="email" type="email" placeholder="e.g. you@email.com" value={email} onChange={e => setEmail(e.target.value)} required className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl" />
        </div>
        <div>
          <Label htmlFor="password" className="text-sm font-medium text-gray-400 mb-2 block">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl pr-10" />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
        {success && <div className="text-green-500 text-sm text-center">{success}</div>}
        <Button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all" disabled={loading}>{loading ? 'Signing up...' : 'Sign Up'}</Button>
        <div className="text-sm text-center mt-2 text-gray-500">
          Already have an account? <a href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">Login</a>
        </div>
      </form>
    </div>
  );
} 
