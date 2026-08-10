import { useState, useEffect } from 'react';
import { formatDateTime as formatDate } from '@/lib/date-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, XCircle, Clock, AlertCircle, Eye, 
  ArrowUpRight, ArrowDownLeft, DollarSign, Calendar,
  Check, X, RefreshCw, History
} from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { supabase } from '../../lib/supabaseClient';
import { formatCryptoNumber } from '@/utils/format-utils';
import { openImageViewer } from '@/lib/image';

interface UnifiedTransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw';
  symbol: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at?: string;
  admin_notes?: string;
  reason?: string;
  screenshot_url?: string;
  isNew?: boolean;
}

export function UnifiedTransactionHistoryModal({ 
  isOpen, 
  onClose, 
  userId 
}: UnifiedTransactionHistoryModalProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchTransactions();
    }
  }, [isOpen, userId]);

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch deposit requests
      const { data: depositRequests, error: depositError } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false });

      if (depositError) throw depositError;

      // Fetch withdraw requests
      const { data: withdrawRequests, error: withdrawError } = await supabase
        .from('withdraw_requests')
        .select('*')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false });

      if (withdrawError) throw withdrawError;

      // Exclude hidden transactions if the column exists; tolerate absence
      const visibleDeposits = (depositRequests || []).filter((req: any) => {
        // If hidden_for_user column doesn't exist, show all transactions
        if (req.hidden_for_user === undefined) return true;
        // If hidden_for_user is true, hide the transaction
        return req.hidden_for_user !== true;
      });
      // Combine and format transactions
      const depositTransactions: Transaction[] = (visibleDeposits || []).map(req => ({
        id: req.id,
        type: 'deposit' as const,
        symbol: req.symbol,
        amount: req.amount,
        status: req.status,
        created_at: req.submitted_at,
        updated_at: req.reviewed_at,
        admin_notes: req.admin_notes,
        reason: req.rejection_reason,
        screenshot_url: req.screenshot_url,
        isNew: req.is_new || false
      }));

      const visibleWithdrawals = (withdrawRequests || []).filter((req: any) => {
        // If hidden_for_user column doesn't exist, show all transactions
        if (req.hidden_for_user === undefined) return true;
        // If hidden_for_user is true, hide the transaction
        return req.hidden_for_user !== true;
      });
      const withdrawTransactions: Transaction[] = (visibleWithdrawals || []).map(req => ({
        id: req.id,
        type: 'withdraw' as const,
        symbol: req.symbol,
        amount: req.amount,
        status: req.status,
        created_at: req.submitted_at,
        updated_at: req.reviewed_at,
        admin_notes: req.admin_notes,
        reason: req.rejection_reason,
        screenshot_url: req.admin_screenshot_url,
        isNew: req.is_new || false
      }));

      // Combine all transactions and sort by date
      const allTransactions = [...depositTransactions, ...withdrawTransactions]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTransactions(allTransactions);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeTransaction = async (transactionId: string, type: 'deposit' | 'withdraw') => {
    setAcknowledging(transactionId);
    
    try {
      const tableName = type === 'deposit' ? 'deposit_requests' : 'withdraw_requests';
      
      const { error } = await supabase
        .from(tableName)
        .update({ is_new: false })
        .eq('id', transactionId);

      if (error) throw error;

      // Update local state
      setTransactions(prev => 
        prev.map(t => 
          t.id === transactionId ? { ...t, isNew: false } : t
        )
      );
      
      console.log(`Transaction ${transactionId} acknowledged successfully`);
    } catch (err: any) {
      console.error('Error acknowledging transaction:', err);
      setError(err.message || 'Failed to acknowledge transaction');
    } finally {
      setAcknowledging(null);
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'approved':
        return {
          icon: CheckCircle,
          color: 'text-green-400',
          bgColor: 'bg-green-900/20',
          text: 'Approved'
        };
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-red-400',
          bgColor: 'bg-red-900/20',
          text: 'Rejected'
        };
      case 'pending':
      default:
        return {
          icon: Clock,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-900/20',
          text: 'Pending'
        };
    }
  };

  // formatDate imported from @/lib/date-utils

  const newTransactions = transactions.filter(t => t.isNew);
  const historyTransactions = transactions.filter(t => !t.isNew);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            Transaction History
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="new" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" className="flex items-center space-x-2">
              <AlertCircle size={16} />
              <span>New Notifications ({newTransactions.length})</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <RefreshCw size={16} />
              <span>History ({historyTransactions.length})</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="new" className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                <p>Loading transactions...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-400">
                <AlertCircle className="mx-auto mb-2" size={24} />
                <p>{error}</p>
              </div>
            ) : newTransactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle className="mx-auto mb-2" size={24} />
                <p>No new notifications</p>
              </div>
            ) : (
              <div className="space-y-4">
                {newTransactions.map((transaction) => {
                  const statusDisplay = getStatusDisplay(transaction.status);
                  const StatusIcon = statusDisplay.icon;
                  
                  return (
                    <div 
                      key={`${transaction.type}-${transaction.id}`}
                      className={`border rounded-lg p-4 ${statusDisplay.bgColor} border-l-4 border-l-current`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          {transaction.type === 'deposit' ? (
                            <ArrowDownLeft className="text-green-400" size={20} />
                          ) : (
                            <ArrowUpRight className="text-red-400" size={20} />
                          )}
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <CryptoIcon symbol={transaction.symbol} size="xs" />
                              {transaction.type === 'deposit' ? 'Deposit' : 'Withdraw'} - {transaction.symbol}
                            </div>
                            <div className="text-sm text-gray-300">
                              {transaction.amount.toFixed(8)} {transaction.symbol}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <StatusIcon size={20} className={statusDisplay.color} />
                          <span className={`text-sm font-medium ${statusDisplay.color}`}>
                            {statusDisplay.text}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-300 mb-3">
                        <div className="flex items-center space-x-2">
                          <Calendar size={14} />
                          <span>Created: {formatDate(transaction.created_at)}</span>
                        </div>
                        {transaction.updated_at && (
                          <div className="flex items-center space-x-2">
                            <Calendar size={14} />
                            <span>Updated: {formatDate(transaction.updated_at)}</span>
                          </div>
                        )}
                      </div>

                      {transaction.reason && (
                        <div className="mb-3 p-3 bg-red-900/30 rounded">
                          <div className="text-sm text-red-200 font-medium">Reason:</div>
                          <div className="text-sm text-red-100">{transaction.reason}</div>
                        </div>
                      )}

                      {transaction.admin_notes && (
                        <div className="mb-3 p-3 bg-blue-900/30 rounded">
                          <div className="text-sm text-blue-200 font-medium">Becxus Team:</div>
                          <div className="text-sm text-blue-100">{transaction.admin_notes}</div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex space-x-2">
                          {transaction.screenshot_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openImageViewer(transaction.screenshot_url, `${transaction.symbol} ${transaction.type} screenshot`)}
                              className="flex items-center space-x-1"
                            >
                              <Eye size={14} />
                              <span>View Screenshot</span>
                            </Button>
                          )}
                        </div>
                        
                        <Button
                          onClick={() => acknowledgeTransaction(transaction.id, transaction.type)}
                          disabled={acknowledging === transaction.id}
                          className="flex items-center space-x-1"
                        >
                          {acknowledging === transaction.id ? (
                            <RefreshCw className="animate-spin" size={14} />
                          ) : (
                            <Check size={14} />
                          )}
                          <span>OK</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="history" className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                <p>Loading history...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-400">
                <AlertCircle className="mx-auto mb-2" size={24} />
                <p>{error}</p>
              </div>
            ) : historyTransactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <History className="mx-auto mb-2" size={24} />
                <p>No transaction history</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyTransactions.map((transaction) => {
                  const statusDisplay = getStatusDisplay(transaction.status);
                  const StatusIcon = statusDisplay.icon;
                  
                  return (
                    <div 
                      key={`${transaction.type}-${transaction.id}`}
                      className="border border-[#1e1e1e] rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          {transaction.type === 'deposit' ? (
                            <ArrowDownLeft className="text-green-400" size={20} />
                          ) : (
                            <ArrowUpRight className="text-red-400" size={20} />
                          )}
                          <div>
                            <div className="font-semibold text-white">
                              {transaction.type === 'deposit' ? 'Deposit' : 'Withdraw'} - {transaction.symbol}
                            </div>
                            <div className="text-sm text-gray-300">
                              {formatCryptoNumber(transaction.amount)} {transaction.symbol}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <StatusIcon size={20} className={statusDisplay.color} />
                          <span className={`text-sm font-medium ${statusDisplay.color}`}>
                            {statusDisplay.text}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-300 mb-3">
                        <div className="flex items-center space-x-2">
                          <Calendar size={14} />
                          <span>Created: {formatDate(transaction.created_at)}</span>
                        </div>
                        {transaction.updated_at && (
                          <div className="flex items-center space-x-2">
                            <Calendar size={14} />
                            <span>Updated: {formatDate(transaction.updated_at)}</span>
                          </div>
                        )}
                      </div>

                      {transaction.reason && (
                        <div className="mb-3 p-3 bg-red-900/30 rounded">
                          <div className="text-sm text-red-200 font-medium">Reason:</div>
                          <div className="text-sm text-red-100">{transaction.reason}</div>
                        </div>
                      )}

                      {transaction.admin_notes && (
                        <div className="mb-3 p-3 bg-blue-900/30 rounded">
                          <div className="text-sm text-blue-200 font-medium">Becxus Team:</div>
                          <div className="text-sm text-blue-100">{transaction.admin_notes}</div>
                        </div>
                      )}

                      {transaction.screenshot_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openImageViewer(transaction.screenshot_url, `${transaction.symbol} ${transaction.type} screenshot`)}
                          className="flex items-center space-x-1"
                        >
                          <Eye size={14} />
                          <span>View Screenshot</span>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose} variant="outline" className="bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
