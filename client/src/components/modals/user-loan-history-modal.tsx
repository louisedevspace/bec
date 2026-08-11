import React, { useState, useEffect } from 'react';
import { formatDate } from '@/lib/date-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  X, FileText, DollarSign, Calendar, Clock, CheckCircle, XCircle, AlertCircle, CreditCard, RefreshCw
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/use-toast';
import { formatUsdNumber } from '../../utils/format-utils';

interface LoanApplication {
  id: number;
  amount: number;
  purpose: string;
  duration: number;
  monthly_income?: number;
  status: 'pending' | 'approved' | 'rejected';
  loan_status?: 'active' | 'paid' | 'overdue';
  documents: any;
  created_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
  loan_pay_date?: string;
}

interface UserLoanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export const UserLoanHistoryModal: React.FC<UserLoanHistoryModalProps> = ({
  isOpen,
  onClose,
  userId
}) => {
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingLoan, setPayingLoan] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchLoanApplications();
    }
  }, [isOpen, userId]);

  const fetchLoanApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('loan_applications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLoanApplications(data || []);
    } catch (err: any) {
      console.error('Error fetching loan applications:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string, loanStatus?: string) => {
    if (status === 'pending') {
      return <Badge variant="secondary" className="bg-warning/20 text-warning">Pending</Badge>;
    }
    if (status === 'rejected') {
      return <Badge variant="secondary" className="bg-danger/20 text-danger">Rejected</Badge>;
    }
    if (status === 'approved') {
      switch (loanStatus) {
        case 'paid':
          return <Badge variant="secondary" className="bg-info/20 text-info">Paid</Badge>;
        case 'overdue':
          return <Badge variant="secondary" className="bg-danger/20 text-danger">Overdue</Badge>;
        case 'active':
        default:
          return <Badge variant="secondary" className="bg-success/20 text-success">Active</Badge>;
      }
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return `$${formatUsdNumber(amount)}`;
  };

  // formatDate imported from @/lib/date-utils

  const getDaysRemaining = (createdAt: string, duration: number) => {
    const createdDate = new Date(createdAt);
    const endDate = new Date(createdDate.getTime() + duration * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handlePayLoan = async (loanId: number, loanAmount: number) => {
    setPayingLoan(loanId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/loans/pay/${loanId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error === 'Insufficient balance') {
          toast({
            title: "Insufficient Balance",
            description: `You need ${result.required} USDT but only have ${result.available} USDT. Shortfall: ${result.shortfall} USDT`,
            variant: "destructive",
          });
        } else {
          throw new Error(result.error || 'Failed to pay loan');
        }
        return;
      }

      toast({
        title: "Payment Successful",
        description: `Loan payment of ${formatCurrency(loanAmount)} completed successfully!`,
        variant: "default",
      });

      // Refresh the loans list
      await fetchLoanApplications();

    } catch (error: any) {
      console.error('Error paying loan:', error);
      toast({
        title: "Payment Failed",
        description: error.message || 'Failed to pay loan. Please try again.',
        variant: "destructive",
      });
    } finally {
      setPayingLoan(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl" hideCloseButton>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5" />
              My Loan History
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLoanApplications}
              disabled={loading}
              className="bg-muted border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        {/* Error Display */}
        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8 text-muted-foreground">
            Loading loan applications...
          </div>
        )}

        {/* Loan Applications List */}
        {!loading && (
          <div className="space-y-4">
            {loanApplications.map((application) => {
              const daysRemaining = getDaysRemaining(application.created_at, application.duration);
              const isApproved = application.status === 'approved';
              const isPaid = application.loan_status === 'paid';
              const isOverdue = isApproved && !isPaid && daysRemaining < 0;
              const isNearDue = isApproved && !isPaid && daysRemaining <= 7 && daysRemaining >= 0;

              return (
                <Card key={application.id} className="bg-muted/50 border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            <span className="text-foreground font-medium tabular-nums">
                              {formatCurrency(application.amount)}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground max-w-64 truncate">
                            {application.purpose}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-sm text-muted-foreground mb-1">Duration</div>
                          <div className="text-foreground text-sm tabular-nums">
                            {application.duration} days
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="text-sm text-muted-foreground mb-1">Status</div>
                          {getStatusBadge(application.status, application.loan_status)}
                        </div>

                        <div className="text-center">
                          <div className="text-sm text-muted-foreground mb-1">Applied</div>
                          <div className="text-foreground text-sm">
                            {formatDate(application.created_at)}
                          </div>
                        </div>

                        {isApproved && (
                          <div className="text-center">
                            <div className="text-sm text-muted-foreground mb-1">Days Remaining</div>
                            <div className={`text-sm font-medium tabular-nums ${
                              isOverdue ? 'text-danger' :
                              isNearDue ? 'text-warning' :
                              'text-success'
                            }`}>
                              {isOverdue ? `${Math.abs(daysRemaining)} days overdue` :
                               isNearDue ? `${daysRemaining} days left` :
                               `${daysRemaining} days left`}
                            </div>
                          </div>
                        )}

                        {isOverdue && (
                          <div className="flex items-center gap-2 text-danger">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">Payment Overdue</span>
                          </div>
                        )}

                        {isNearDue && !isOverdue && (
                          <div className="flex items-center gap-2 text-warning">
                            <Clock className="w-4 h-4" />
                            <span className="text-sm">Payment Due Soon</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {application.rejection_reason && (
                      <div className="mt-3 p-3 bg-danger/10 border border-danger/30 rounded-xl">
                        <div className="text-sm text-danger font-medium mb-1">Rejection Reason:</div>
                        <div className="text-sm text-danger/80">{application.rejection_reason}</div>
                      </div>
                    )}

                    {isApproved && !isPaid && (isOverdue || isNearDue) && (
                      <div className="mt-3 p-3 bg-warning/10 border border-warning/30 rounded-xl">
                        <div className="text-sm text-warning font-medium mb-1 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {isOverdue ? 'Payment Overdue' : 'Payment Due Soon'}
                        </div>
                        <div className="text-sm text-warning/80">
                          {isOverdue
                            ? `Your loan payment is ${Math.abs(daysRemaining)} days overdue. Please make your payment as soon as possible.`
                            : `Your loan payment is due in ${daysRemaining} days. Please ensure you have sufficient funds.`
                          }
                        </div>
                        <Button
                          size="sm"
                          className="mt-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                          onClick={() => handlePayLoan(application.id, application.amount)}
                          disabled={payingLoan === application.id}
                        >
                          {payingLoan === application.id ? (
                            <>
                              <Clock className="w-4 h-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-4 h-4 mr-2" />
                              Pay My Loan
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {isPaid && (
                      <div className="mt-3 p-3 bg-success/10 border border-success/30 rounded-xl">
                        <div className="text-sm text-success font-medium mb-1 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Loan Paid
                        </div>
                        <div className="text-sm text-success/80">
                          This loan has been successfully paid. Thank you!
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* No Results */}
            {!loading && loanApplications.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No loan applications found.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={onClose} className="bg-muted border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


