import { useState } from 'react';
import { useLocation } from 'wouter';
import { authApi } from '@/services/api';
import { supabase } from '@/lib/supabaseClient';
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
      
      // If user profile doesn't exist, check for pending profile data
      if (!profile && profileError?.code === 'PGRST116') {
        console.log('User profile not found, checking for pending profile...');
        
        if (pendingProfile) {
          console.log('Found pending profile, creating user...');
          const parsed = JSON.parse(pendingProfile);
          
          // Create user profile with data from localStorage (NO PASSWORD in users table)
          const { data: newProfile, error: createError } = await supabase
            .from('users')
            .insert([{
              id: data.user.id,
              username: parsed.username || (data.user.email ?? '').split('@')[0],
              email: data.user.email ?? '',
              full_name: parsed.full_name || '',
              phone: parsed.phone || '',
              role: 'user',
              is_active: true,
              is_verified: true, // Mark as verified since they confirmed email
              credit_score: 60,
              display_id: parsed.display_id || Math.random().toString(36).substring(2, 10).toUpperCase()
            }])
            .select()
            .single();
          
          if (createError) {
            console.error('Error creating user profile:', createError);
            throw new Error('Failed to create user profile: ' + createError.message);
          }
          
          profile = newProfile;
          console.log('✅ User profile created successfully');
          
          // Clear the pending profile
          localStorage.removeItem('pendingProfile');
        } else {
          throw new Error('User profile not found and no pending profile data. Please try signing up again.');
        }
      } else if (profileError) {
        console.error('Profile select error:', profileError);
        throw profileError;
      }
      // --- Ensure role is present in profile and store in localStorage ---
      if (profile && !profile.role) {
        // Optionally, fetch again or set a default role
        profile.role = 'user';
      }
      localStorage.setItem('userProfile', JSON.stringify(profile));
      // --- NEW: Check for pendingProfile and send to backend ---
      if (pendingProfile) {
        const parsed = JSON.parse(pendingProfile);
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          // Send profile data to backend
          await fetch('/api/signup-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              full_name: parsed.full_name || parsed.fullName,
              phone: parsed.phone,
            }),
          });
          
          // Save password to user_passwords table if it exists
          if (parsed.password && parsed.id) {
            try {
              await fetch('/api/save-user-password', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  user_id: parsed.id, // Use parsed.id instead of parsed.user_id
                  password: parsed.password,
                }),
              });
              console.log('Password saved to user_passwords table');
            } catch (error) {
              console.error('Error saving password:', error);
            }
          }
          
          localStorage.removeItem('pendingProfile');
        }
      }
      // Remove any legacy localStorage keys with fullName
      try { localStorage.removeItem('fullName'); } catch (e) {}
      localStorage.setItem('userProfile', JSON.stringify(profile));
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-100 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-8 bg-white p-10 rounded-xl shadow-xl border border-gray-100">
        <div className="flex flex-col items-center mb-2">
          <Logo className="w-16 h-16 mb-2" />
          <h2 className="text-3xl font-bold mb-1 text-blue-900">Sign In to Your Account</h2>
          <p className="text-gray-500 text-sm">Welcome back to Becxus</p>
        </div>
        <div>
          <Label htmlFor="email" className="text-base font-medium">Email Address</Label>
          <Input id="email" type="email" placeholder="e.g. you@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="password" className="text-base font-medium">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="absolute right-2 top-2 text-gray-400" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Logging in...' : 'Login'}</Button>
        <div className="text-sm text-center mt-2 text-gray-600">
          Don't have an account? <a href="/signup" className="text-blue-600 underline">Sign up</a>
        </div>
      </form>
    </div>
  );
} 
