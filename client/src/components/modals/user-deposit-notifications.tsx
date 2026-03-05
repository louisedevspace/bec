import React, { useEffect, useState } from 'react';
import { formatDate } from '@/lib/date-utils';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { CryptoIcon } from '@/components/crypto/crypto-icon';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/lib/config';

interface DepositRequest {
  id: string;
  user_id: string;
  symbol: string;
  amount: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  rejection_reason?: string;
  require_reverification?: boolean;
  submitted_at: string;
  reviewed_at?: string;
}

interface UserDepositNotificationsProps {
  userId: string;
  onClose?: () => void;
}

export function UserDepositNotifications({ userId, onClose }: UserDepositNotificationsProps) {
  const { toast } = useToast();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    };
    getSession();
  }, []);

  const { data: depositRequests, isLoading, error, refetch } = useQuery({
    queryKey: ['user-deposit-requests', userId],
    queryFn: async () => {
      if (!session?.access_token) throw new Error('No session');
      
      console.log('🔍 Fetching deposit requests for user:', userId);
      
      const response = await fetch(buildApiUrl(`/deposit-requests/${userId}`), {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`Failed to fetch deposit requests: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('📦 Received data:', data);
      return data || [];
    },
    enabled: !!session?.access_token && !!userId,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const handleResubmit = (request: DepositRequest) => {
    // This would typically open the deposit modal again
    toast({
      title: "Resubmit Deposit",
      description: "Please use the deposit button to submit a new deposit request.",
      variant: "default",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Clock className="h-6 w-6 animate-spin mr-2" />
            Loading deposit requests...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Error loading deposit requests: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!depositRequests || depositRequests.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            No deposit requests found.
          </div>
          <div className="text-xs text-gray-400 mt-2">
            Debug: userId={userId}, session={session ? 'exists' : 'none'}, data={JSON.stringify(depositRequests)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const rejectedRequests = depositRequests.filter((req: DepositRequest) => 
    req.status === 'rejected' && req.require_reverification
  );

  const pendingRequests = depositRequests.filter((req: DepositRequest) => 
    req.status === 'pending'
  );

  const approvedRequests = depositRequests.filter((req: DepositRequest) => 
    req.status === 'approved'
  );

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      {onClose && (
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Deposit Request Notifications</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Rejected requests requiring re-verification */}
      {rejectedRequests.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-md font-medium text-red-600 dark:text-red-400">
            Rejected Requests Requiring Re-verification
          </h4>
          {rejectedRequests.map((request: DepositRequest) => (
            <Card key={request.id} className="border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="destructive">Rejected</Badge>
                      <span className="text-sm text-gray-500">
                        {formatDate(request.reviewed_at)}
                      </span>
                    </div>
                    <p className="font-medium flex items-center gap-1.5">
                      <CryptoIcon symbol={request.symbol} size="xs" />
                      {parseFloat(request.amount).toFixed(8)} {request.symbol}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleResubmit(request)}
                  >
                    Resubmit
                  </Button>
                </div>
                
                {request.rejection_reason && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Reason:</strong> {request.rejection_reason}
                    </AlertDescription>
                  </Alert>
                )}
                
                {request.admin_notes && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    <strong>Admin Notes:</strong> {request.admin_notes}
                  </div>
                )}
                
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Action Required:</strong> Please resubmit your deposit request with the requested verification.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-md font-medium text-yellow-600 dark:text-yellow-400">
            Pending Requests
          </h4>
          {pendingRequests.map((request: DepositRequest) => (
            <Card key={request.id} className="border-yellow-200 dark:border-yellow-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">Pending</Badge>
                  <span className="text-sm text-gray-500">
                    {formatDate(request.submitted_at)}
                  </span>
                </div>
                <p className="font-medium flex items-center gap-1.5">
                  <CryptoIcon symbol={request.symbol} size="xs" />
                  {parseFloat(request.amount).toFixed(8)} {request.symbol}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Waiting for admin approval...
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approved requests */}
      {approvedRequests.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-md font-medium text-green-600 dark:text-green-400">
            Approved Requests
          </h4>
          {approvedRequests.map((request: DepositRequest) => (
            <Card key={request.id} className="border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default" className="bg-green-600">Approved</Badge>
                  <span className="text-sm text-gray-500">
                    {formatDate(request.reviewed_at)}
                  </span>
                </div>
                <p className="font-medium flex items-center gap-1.5">
                  <CryptoIcon symbol={request.symbol} size="xs" />
                  {parseFloat(request.amount).toFixed(8)} {request.symbol}
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  ✓ Amount added to your balance
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
