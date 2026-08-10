import React, { useState, useEffect } from 'react';
import { formatDate } from '../lib/date-utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { AlertTriangle, Clock, CheckCircle, XCircle, DollarSign, Calendar, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/use-toast';
import { formatUsdNumber } from '../utils/format-utils';

interface LoanStatus {
  id: number;
  amount: number;
  loan_pay_date: string;
  loan_status: 'active' | 'paid' | 'overdue';
  is_reminder_sent: boolean;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
}

interface LoanStatusCardProps {
  userId: string;
}

export const LoanStatusCard: React.FC<LoanStatusCardProps> = ({ userId }) => {
  const [loans, setLoans] = useState<LoanStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingLoan, setPayingLoan] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserLoans();
  }, [userId]);

  const fetchUserLoans = async () => {
    try {
      const { data, error } = await supabase
        .from('loan_applications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLoans(data || []);
    } catch (error) {
      console.error('Error fetching loans:', error);
    } finally {
      setLoading(false);
    }
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
      await fetchUserLoans();

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

  const getStatusBadge = (status: string, loanStatus?: string) => {
    if (status === 'pending') {
      return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>;
    }
    if (status === 'rejected') {
      return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
    }
    if (status === 'approved') {
      switch (loanStatus) {
        case 'active':
          return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
        case 'paid':
          return <Badge className="bg-blue-100 text-blue-800"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
        case 'overdue':
          return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Overdue</Badge>;
        default:
          return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      }
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return `$${formatUsdNumber(amount)}`;
  };

  // formatDate imported from @/lib/date-utils

  const getDaysUntilDue = (payDate: string) => {
    const today = new Date();
    const dueDate = new Date(payDate);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const isDueSoon = (payDate: string) => {
    const daysUntilDue = getDaysUntilDue(payDate);
    return daysUntilDue <= 1 && daysUntilDue >= 0;
  };

  const isOverdue = (payDate: string) => {
    const daysUntilDue = getDaysUntilDue(payDate);
    return daysUntilDue < 0;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Loan Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500">Loading loan information...</div>
        </CardContent>
      </Card>
    );
  }

  if (loans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Loan Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500">
            No loan applications found.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Loan Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loans.map((loan) => (
          <div key={loan.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">Loan #{loan.id}</span>
                {getStatusBadge(loan.status, loan.loan_status)}
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatCurrency(loan.amount)}</div>
              </div>
            </div>

            {loan.status === 'approved' && loan.loan_pay_date && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>Due: {formatDate(loan.loan_pay_date)}</span>
                </div>
                <div className="text-sm">
                  {isOverdue(loan.loan_pay_date) ? (
                    <span className="text-red-600 font-medium">
                      Overdue by {Math.abs(getDaysUntilDue(loan.loan_pay_date))} days
                    </span>
                  ) : isDueSoon(loan.loan_pay_date) ? (
                    <span className="text-yellow-600 font-medium">
                      Due tomorrow
                    </span>
                  ) : (
                    <span className="text-gray-600">
                      {getDaysUntilDue(loan.loan_pay_date)} days remaining
                    </span>
                  )}
                </div>
              </div>
            )}

            {loan.status === 'rejected' && loan.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="text-sm text-red-800">
                  <strong>Rejection Reason:</strong> {loan.rejection_reason}
                </div>
              </div>
            )}


            {isDueSoon(loan.loan_pay_date) && loan.status === 'approved' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <div className="flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Your loan payment is due tomorrow. Please ensure you have sufficient funds.
                  </span>
                </div>
              </div>
            )}

            {isOverdue(loan.loan_pay_date) && loan.status === 'approved' && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Your loan payment is overdue. Please contact support immediately.
                  </span>
                </div>
              </div>
            )}

            {loan.status === 'approved' && loan.loan_status !== 'paid' && (
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => handlePayLoan(loan.id, loan.amount)}
                  disabled={payingLoan === loan.id}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                >
                  {payingLoan === loan.id ? (
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
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
