import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';

interface AdminFuturesSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  userName: string;
  currentTradeResult?: string | null;
}

export const AdminFuturesSettingsModal: React.FC<AdminFuturesSettingsModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  userName,
  currentTradeResult,
}) => {
  const { toast } = useToast();
  const [tradeResult, setTradeResult] = useState<string>('auto');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen, userId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const response = await fetch(`/api/admin/user-futures-settings/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTradeResult(data.futures_trade_result || 'auto');
      } else {
        // Use props as fallback
        setTradeResult(currentTradeResult || 'auto');
      }
    } catch {
      setTradeResult(currentTradeResult || 'auto');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No token');

      const response = await fetch('/api/admin/user-futures-settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          futuresTradeResult: tradeResult === 'auto' ? null : tradeResult,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to save');
      }

      toast({
        title: 'Success',
        description: `Futures settings updated for ${userName || userEmail}`,
      });
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update futures settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'win':
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/20"><TrendingUp className="h-3 w-3 mr-1" />Always Win</Badge>;
      case 'loss':
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/20"><TrendingDown className="h-3 w-3 mr-1" />Always Lose</Badge>;
      default:
        return <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20"><Minus className="h-3 w-3 mr-1" />Auto (is_active)</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="admin-dialog max-w-md bg-[#111] border-[#1e1e1e] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-white">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <span>Futures Trade Settings</span>
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure futures trading parameters for this user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* User Info */}
          <Card className="bg-[#0a0a0a] border-[#1e1e1e]">
            <CardContent className="p-3">
              <div className="text-sm text-white">
                <span className="font-medium">User:</span> {userName || userEmail}
              </div>
              <div className="text-xs text-gray-500">{userEmail}</div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading settings...</p>
            </div>
          ) : (
            <>
              {/* Trade Outcome Control */}
              <div className="space-y-2">
                <Label className="flex items-center space-x-2 text-gray-300">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  <span>Trade Outcome Control</span>
                </Label>
                <Select value={tradeResult} onValueChange={setTradeResult}>
                  <SelectTrigger className="bg-[#0a0a0a] border-[#1e1e1e] text-white">
                    <SelectValue placeholder="Select outcome" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-[#1e1e1e]">
                    <SelectItem value="auto" className="text-white hover:bg-[#1a1a1a]">
                      Auto (based on is_active flag)
                    </SelectItem>
                    <SelectItem value="win" className="text-white hover:bg-[#1a1a1a]">
                      Always Win
                    </SelectItem>
                    <SelectItem value="loss" className="text-white hover:bg-[#1a1a1a]">
                      Always Lose
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Controls whether this user's futures trades result in a win or loss.
                  "Auto" uses the default is_active logic.
                </p>
              </div>

              {/* Current Status Preview */}
              <Card className="bg-blue-500/10 border-blue-500/20">
                <CardContent className="p-3">
                  <div className="text-sm font-medium text-blue-400 mb-2">Current Settings Preview</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-blue-300">Trade Outcome:</span>
                      {getResultBadge(tradeResult)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Futures Settings'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
