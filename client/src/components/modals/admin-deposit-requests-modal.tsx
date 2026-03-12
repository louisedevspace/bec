import React, { useState } from 'react';
import { formatDateTime } from '@/lib/date-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import { CryptoIcon } from '@/components/crypto/crypto-icon';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildApiUrl } from '@/lib/config';
import { openImageViewer } from '@/lib/image';

interface DepositRequest {
  id: number;
  user_id: string;
  symbol: string;
  amount: string;
  screenshot_url: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  rejection_reason?: string;
  require_reverification: boolean;
  submitted_at: string;
  users?: {
    email: string;
    full_name?: string;
    display_id?: string;
  };
}

interface AdminDepositRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminDepositRequestsModal({ isOpen, onClose }: AdminDepositRequestsModalProps) {
  const [selectedRequest, setSelectedRequest] = useState<DepositRequest | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [requireReverification, setRequireReverification] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: depositRequests, isLoading, refetch } = useQuery({
    queryKey: ['/api/admin/deposit-requests'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token available');

      const response = await fetch(buildApiUrl('/admin/deposit-requests'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch deposit requests');
      return response.json();
    },
    enabled: isOpen
  });

  const handleReview = (request: DepositRequest, reviewAction: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setAction(reviewAction);
    setAdminNotes('');
    setRejectionReason('');
    setRequireReverification(false);
    setShowReviewModal(true);
  };

  const handleSubmitReview = async () => {
    if (!selectedRequest) return;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token available');

      const response = await fetch(buildApiUrl(`/admin/deposit-requests/${selectedRequest.id}/review`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action,
          adminNotes,
          rejectionReason: action === 'reject' ? rejectionReason : undefined,
          requireReverification: action === 'reject' ? requireReverification : undefined
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to review deposit request');

      toast({
        title: "Success",
        description: `Deposit request ${action}d successfully${action === 'reject' && requireReverification ? ' - User will be notified to re-verify' : ''}`,
        variant: "default",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/admin/deposit-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deposit-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });

      setShowReviewModal(false);
      setSelectedRequest(null);

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to review deposit request',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="admin-dialog max-w-4xl max-h-[90vh] overflow-y-auto bg-[#111] border-[#1e1e1e] text-white" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="text-white">Deposit Requests Management</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
              </div>
            ) : depositRequests?.filter((request: DepositRequest) => request.status === 'pending').length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No pending deposit requests found.</p>
              </div>
            ) : (
              depositRequests?.filter((request: DepositRequest) => request.status === 'pending').map((request: DepositRequest) => (
                <Card key={request.id} className="border-l-4 border-l-blue-500 bg-[#0a0a0a] border-[#1e1e1e]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="font-semibold text-white flex items-center gap-1.5">
                            <CryptoIcon symbol={request.symbol} size="xs" />
                            {parseFloat(request.amount).toFixed(8)} {request.symbol}
                          </h3>
                          {getStatusBadge(request.status)}
                        </div>
                        <p className="text-sm text-gray-400">
                          User: {request.users?.full_name || request.users?.email || (request.users?.display_id || request.user_id.substring(0, 8))} | 
                          Submitted: {formatDateTime(request.submitted_at)}
                        </p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openImageViewer(request.screenshot_url, `${request.symbol} deposit screenshot`)}
                          className="text-xs bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">View</span>
                          <span className="sm:hidden">View</span>
                        </Button>
                        
                        {request.status === 'pending' && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleReview(request, 'approve')}
                              className="text-xs bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Approve</span>
                              <span className="sm:hidden">✓</span>
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleReview(request, 'reject')}
                              className="text-xs bg-red-600 hover:bg-red-700"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Reject</span>
                              <span className="sm:hidden">✗</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={onClose} className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white">Close</Button>
            <Button onClick={() => refetch()} className="bg-blue-600 hover:bg-blue-700">Refresh</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Modal */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="admin-dialog max-w-md bg-[#111] border-[#1e1e1e] text-white" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="text-white">
              {action === 'approve' ? 'Approve' : 'Reject'} Deposit Request
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-[#0a0a0a] p-4 rounded-lg border border-[#1e1e1e]">
                <p className="text-base font-medium text-white mb-2 flex items-center gap-1.5">
                  <CryptoIcon symbol={selectedRequest.symbol} size="xs" />
                  Amount: {parseFloat(selectedRequest.amount).toFixed(8)} {selectedRequest.symbol}
                </p>
                <p className="text-base text-gray-400">
                  User: {selectedRequest.users?.full_name || selectedRequest.users?.email || selectedRequest.user_id}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminNotes" className="text-gray-300">Admin Notes (Optional)</Label>
                <Textarea
                  id="adminNotes"
                  placeholder="Add any notes about this decision..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="bg-[#0a0a0a] border-[#1e1e1e] text-white placeholder:text-gray-500"
                />
              </div>

              {action === 'reject' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="rejectionReason" className="text-gray-300">Rejection Reason *</Label>
                    <Textarea
                      id="rejectionReason"
                      placeholder="Please provide a reason for rejection..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      required
                      className="bg-[#0a0a0a] border-[#1e1e1e] text-white placeholder:text-gray-500"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requireReverification"
                      checked={requireReverification}
                      onCheckedChange={(checked) => setRequireReverification(checked as boolean)}
                    />
                    <Label htmlFor="requireReverification" className="text-sm text-gray-300">
                      Require re-verification from user
                    </Label>
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowReviewModal(false)} disabled={loading} className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white">
                  Cancel
                </Button>
                <Button 
                  variant={action === 'approve' ? 'default' : 'destructive'}
                  onClick={handleSubmitReview}
                  disabled={loading || (action === 'reject' && !rejectionReason.trim())}
                  className={action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                >
                  {loading ? 'Processing...' : (action === 'approve' ? 'Approve' : 'Reject')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
