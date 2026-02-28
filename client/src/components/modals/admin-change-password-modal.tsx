import { useState } from 'react';
import { X, Eye, EyeOff, AlertCircle, CheckCircle, Shield } from 'lucide-react';
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
        const responseText = await response.text();
        console.log('Response text:', responseText);
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
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
      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 3000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2d3842] rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Change User Password</h2>
            <p className="text-sm text-gray-300 mt-1">Updating password for: {user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[#3b4652] border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                placeholder="Enter new password (min 6 characters)"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[#3b4652] border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                placeholder="Confirm new password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-center space-x-2 p-3 bg-yellow-900/20 border border-yellow-500 rounded-md">
            <Shield size={20} className="text-yellow-400" />
            <span className="text-yellow-400 text-sm">
              This will update the password for {user.email}. The user will be able to login with the new password immediately.
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-900/20 border border-red-500 rounded-md">
              <AlertCircle size={20} className="text-red-400" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center space-x-2 p-3 bg-green-900/20 border border-green-500 rounded-md">
              <CheckCircle size={20} className="text-green-400" />
              <span className="text-green-400 text-sm">{success}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 