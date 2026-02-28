import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { buildApiUrl } from "@/lib/config";

interface WithdrawRequest {
  id: number;
  user_id: string;
  symbol: string;
  amount: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_screenshot_url?: string;
  admin_notes?: string;
  rejection_reason?: string;
  require_reverification: boolean;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

interface UserWithdrawNotificationsProps {
  userId: string;
  onClose: () => void;
}

export function UserWithdrawNotifications({ userId, onClose }: UserWithdrawNotificationsProps) {
  const { data: withdrawRequests, isLoading, error, refetch } = useQuery({
    queryKey: ['user-withdraw-requests', userId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const response = await fetch(buildApiUrl(`/withdraw-requests/${userId}`), {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch withdraw requests');
      }

      const data = await response.json();
      return data || [];
    },
    enabled: !!userId,
    refetchInterval: 10000,
  });

  const rejectedRequests = withdrawRequests?.filter((req: WithdrawRequest) => 
    req.status === 'rejected' && req.require_reverification
  ) || [];

  const pendingRequests = withdrawRequests?.filter((req: WithdrawRequest) => 
    req.status === 'pending'
  ) || [];

  const approvedRequests = withdrawRequests?.filter((req: WithdrawRequest) => 
    req.status === 'approved'
  ) || [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-500">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Withdraw Request Notifications</h3>
        <div className="text-center py-4">Loading withdraw requests...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Withdraw Request Notifications</h3>
        <div className="text-center py-4 text-red-500">Error loading withdraw requests</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <h3 className="text-lg font-semibold">Withdraw Request Notifications</h3>

      {/* Rejected Requests Requiring Re-verification */}
      {rejectedRequests.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-700 dark:text-red-300">
              <XCircle className="h-5 w-5" />
              <span>Rejected Requests (Require Re-verification)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rejectedRequests.map((request: WithdrawRequest) => (
              <div key={request.id} className="border border-red-200 dark:border-red-800 rounded-lg p-3 bg-white dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(request.status)}
                    <span className="font-medium">
                      {parseFloat(request.amount).toFixed(8)} {request.symbol}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.href = '/withdraw'}
                  >
                    Resubmit
                  </Button>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>Submitted: {formatDate(request.submitted_at)}</div>
                  <div>Reviewed: {formatDate(request.reviewed_at || '')}</div>
                  {request.rejection_reason && (
                    <div className="text-red-600 dark:text-red-400">
                      <strong>Rejection Reason:</strong> {request.rejection_reason}
                    </div>
                  )}
                  {request.admin_notes && (
                    <div>
                      <strong>Admin Notes:</strong> {request.admin_notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-yellow-700 dark:text-yellow-300">
              <Clock className="h-5 w-5" />
              <span>Pending Requests</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((request: WithdrawRequest) => (
              <div key={request.id} className="border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 bg-white dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(request.status)}
                    <span className="font-medium">
                      {parseFloat(request.amount).toFixed(8)} {request.symbol}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <div>Submitted: {formatDate(request.submitted_at)}</div>
                  <div>Status: Awaiting admin approval</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Approved Requests */}
      {approvedRequests.length > 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-green-700 dark:text-green-300">
              <CheckCircle className="h-5 w-5" />
              <span>Approved Requests</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvedRequests.map((request: WithdrawRequest) => (
              <div key={request.id} className="border border-green-200 dark:border-green-800 rounded-lg p-3 bg-white dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(request.status)}
                    <span className="font-medium">
                      {parseFloat(request.amount).toFixed(8)} {request.symbol}
                    </span>
                  </div>
                  {request.admin_screenshot_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(request.admin_screenshot_url, '_blank')}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Screenshot
                    </Button>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>Submitted: {formatDate(request.submitted_at)}</div>
                  <div>Approved: {formatDate(request.reviewed_at || '')}</div>
                  {request.admin_notes && (
                    <div>
                      <strong>Admin Notes:</strong> {request.admin_notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No Requests */}
      {withdrawRequests?.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <div className="text-muted-foreground">No withdraw requests found</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

