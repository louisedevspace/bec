import { useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError || !data.user) throw loginError || new Error('Login failed');
      
      // Fetch user profile from users table
      console.log('User ID:', data.user.id);
      const { data: profile, error: profileError } = await supabase.from('users').select('*').eq('id', data.user.id).single();
      
      if (profileError) {
        console.error('Profile select error:', profileError);
        throw new Error('User profile not found. Please contact support.');
      }
      
      // Ensure role is present in profile
      if (profile && !profile.role) {
        profile.role = 'user';
      }
      
      // Store user profile in localStorage
      localStorage.setItem('userProfile', JSON.stringify(profile));
      
      // Clean up any legacy localStorage keys
      try { 
        localStorage.removeItem('fullName'); 
        localStorage.removeItem('pendingProfile');
      } catch (e) {}
      
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-100">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-8 bg-white p-10 rounded-xl shadow-xl border border-gray-100">
        <div className="flex flex-col items-center mb-2">
          <Logo className="w-16 h-16 mb-2" />
          <h2 className="text-3xl font-bold mb-1 text-blue-900">Welcome Back</h2>
          <p className="text-gray-500 text-sm">Sign in to your Becxus account</p>
        </div>
        <div>
          <Label htmlFor="email" className="text-base font-medium text-gray-700 mb-2 block">Email Address</Label>
          <Input id="email" type="email" placeholder="e.g. you@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="password" className="text-base font-medium text-gray-700 mb-2 block">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="absolute right-2 top-2 text-gray-400" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</Button>
        <div className="text-sm text-center mt-2 text-gray-600">
          Don't have an account? <a href="/signup" className="text-blue-600 underline">Sign up</a>
        </div>
      </form>
    </div>
  );
}
