import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { CheckCircle, XCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';

interface FutureTrade {
  id: number;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  amount: number;
  duration: number;
  profit_ratio: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  entry_price?: number;
  exit_price?: number;
  profit_loss?: number;
  is_admin_approved: boolean;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  user_email?: string;
}

interface AdminFuturesTradesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminFuturesTradesModal({ isOpen, onClose }: AdminFuturesTradesModalProps) {
  const { toast } = useToast();
  const [trades, setTrades] = useState<FutureTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingTrade, setProcessingTrade] = useState<number | null>(null);

  const fetchTrades = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/future-trades', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch trades');
      }

      const data = await response.json();
      setTrades(data || []);
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch future trades.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTrades();
    }
  }, [isOpen]);

  const handleApprove = async (tradeId: number) => {
    setProcessingTrade(tradeId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/future-trade/approve/${tradeId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to approve trade');
      }

      toast({
        title: 'Success',
        description: 'Trade approved successfully!',
      });

      fetchTrades();
    } catch (error) {
      console.error('Error approving trade:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve trade.',
        variant: 'destructive',
      });
    } finally {
      setProcessingTrade(null);
    }
  };

  const handleReject = async (tradeId: number) => {
    setProcessingTrade(tradeId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/future-trade/reject/${tradeId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rejection_reason: 'Admin rejected the trade request'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reject trade');
      }

      toast({
        title: 'Success',
        description: 'Trade rejected successfully!',
      });

      fetchTrades();
    } catch (error) {
      console.error('Error rejecting trade:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reject trade.',
        variant: 'destructive',
      });
    } finally {
      setProcessingTrade(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const pendingTrades = trades.filter(trade => trade.status === 'pending');
  const otherTrades = trades.filter(trade => trade.status !== 'pending');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="admin-dialog max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Future Trade Requests</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8">Loading trades...</div>
        ) : (
          <div className="space-y-6">
            {/* Pending Trades */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-yellow-600">
                Pending Approval ({pendingTrades.length})
              </h3>
              {pendingTrades.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No pending trade requests
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingTrades.map((trade) => (
                    <Card key={trade.id} className="border-l-4 border-l-yellow-500">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="flex items-center space-x-2">
                              <span>{trade.symbol}</span>
                              {trade.side === 'long' ? (
                                <TrendingUp className="w-4 h-4 text-green-500" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-red-500" />
                              )}
                              {getStatusBadge(trade.status)}
                            </CardTitle>
                            <p className="text-sm text-gray-500">
                              User: {trade.user_email || trade.user_id}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{formatCurrency(trade.amount)}</div>
                            <div className="text-sm text-gray-500">
                              {formatDuration(trade.duration)} • {trade.profit_ratio}% profit
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <span className="text-sm text-gray-500">Side:</span>
                            <div className="font-medium">{trade.side.toUpperCase()}</div>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">Duration:</span>
                            <div className="font-medium">{formatDuration(trade.duration)}</div>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">Profit Ratio:</span>
                            <div className="font-medium text-green-600">{trade.profit_ratio}%</div>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">Created:</span>
                            <div className="font-medium">
                              {new Date(trade.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            onClick={() => handleApprove(trade.id)}
                            disabled={processingTrade === trade.id}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            {processingTrade === trade.id ? 'Processing...' : 'Approve'}
                          </Button>
                          <Button
                            onClick={() => handleReject(trade.id)}
                            disabled={processingTrade === trade.id}
                            variant="destructive"
                            className="flex-1"
                          >
                            {processingTrade === trade.id ? 'Processing...' : 'Reject'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Other Trades */}
            {otherTrades.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">All Trades ({otherTrades.length})</h3>
                <div className="space-y-4">
                  {otherTrades.map((trade) => (
                    <Card key={trade.id} className="border-l-4 border-l-gray-300">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="flex items-center space-x-2">
                              <span>{trade.symbol}</span>
                              {trade.side === 'long' ? (
                                <TrendingUp className="w-4 h-4 text-green-500" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-red-500" />
                              )}
                              {getStatusBadge(trade.status)}
                            </CardTitle>
                            <p className="text-sm text-gray-500">
                              User: {trade.user_email || trade.user_id}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{formatCurrency(trade.amount)}</div>
                            <div className="text-sm text-gray-500">
                              {formatDuration(trade.duration)} • {trade.profit_ratio}% profit
                            </div>
                            {trade.profit_loss !== undefined && (
                              <div className={`text-sm font-medium ${
                                trade.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {trade.profit_loss >= 0 ? '+' : ''}{formatCurrency(trade.profit_loss)}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-sm text-gray-500">Side:</span>
                            <div className="font-medium">{trade.side.toUpperCase()}</div>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">Duration:</span>
                            <div className="font-medium">{formatDuration(trade.duration)}</div>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">Profit Ratio:</span>
                            <div className="font-medium text-green-600">{trade.profit_ratio}%</div>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">Created:</span>
                            <div className="font-medium">
                              {new Date(trade.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          {trade.rejection_reason && (
                            <div className="col-span-2">
                              <span className="text-sm text-gray-500">Rejection Reason:</span>
                              <div className="font-medium text-red-600">{trade.rejection_reason}</div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

