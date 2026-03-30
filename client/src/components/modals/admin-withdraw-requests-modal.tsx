import { useState } from "react";
import { formatDateTime as formatDate } from '@/lib/date-utils';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, XCircle, Eye } from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { buildApiUrl } from "@/lib/config";
import { openImageViewer } from "@/lib/image";
import { compressAdminImage } from "@/lib/image-compress";

interface WithdrawRequest {
  id: number;
  user_id: string;
  symbol: string;
  amount: number;
  wallet_address: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_screenshot_url?: string;
  admin_notes?: string;
  rejection_reason?: string;
  require_reverification: boolean;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  users?: {
    email: string;
    full_name?: string;
  };
}

interface AdminWithdrawRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminWithdrawRequestsModal({ isOpen, onClose }: AdminWithdrawRequestsModalProps) {
  const [selectedRequest, setSelectedRequest] = useState<WithdrawRequest | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [requireReverification, setRequireReverification] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: withdrawRequests, isLoading, error } = useQuery({
    queryKey: ['admin-withdraw-requests'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const response = await fetch(buildApiUrl('/admin/withdraw-requests'), {
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
    enabled: isOpen,
    refetchInterval: 10000,
  });

  const reviewMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const response = await fetch(buildApiUrl(`/admin/withdraw-requests/${selectedRequest?.id}/review`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          // Don't set Content-Type for FormData, let the browser set it with boundary
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to review withdraw request');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Withdraw request ${action}d successfully${action === 'reject' && requireReverification ? ' - User will be notified to re-verify' : ''}`,
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ['admin-withdraw-requests'] });
      queryClient.invalidateQueries({ queryKey: ['user-withdraw-requests'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setShowReviewModal(false);
      setSelectedRequest(null);
      setAdminNotes('');
      setRejectionReason('');
      setRequireReverification(false);
      setScreenshotFile(null);
      setScreenshotPreview('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to review withdraw request",
        variant: "destructive",
      });
    },
  });

  const handleReview = (request: WithdrawRequest, reviewAction: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setAction(reviewAction);
    setAdminNotes('');
    setRejectionReason('');
    setRequireReverification(false);
    setScreenshotFile(null);
    setScreenshotPreview('');
    setShowReviewModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshotFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setScreenshotPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview('');
  };

  const handleSubmitReview = async () => {
    if (!selectedRequest) return;

    const formData = new FormData();
    formData.append('action', action);
    formData.append('adminNotes', adminNotes);
    if (action === 'reject') {
      formData.append('rejectionReason', rejectionReason);
    }
    formData.append('requireReverification', requireReverification.toString());
    
    if (screenshotFile) {
      const compressedScreenshot = await compressAdminImage(screenshotFile);
      formData.append('screenshot', compressedScreenshot);
    }

    reviewMutation.mutate(formData);
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

  // formatDateTime imported from @/lib/date-utils as formatDate

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Withdraw Requests</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-center text-gray-400">Loading withdraw requests...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Withdraw Requests</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-center text-red-400">Error loading withdraw requests</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Withdraw Requests</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
            {withdrawRequests?.filter((request: WithdrawRequest) => request.status === 'pending').length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No pending withdraw requests found
              </div>
            ) : (
              withdrawRequests?.filter((request: WithdrawRequest) => request.status === 'pending').map((request: WithdrawRequest) => (
                <div key={request.id} className="border border-[#1e1e1e] bg-[#0a0a0a] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusBadge(request.status)}
                      <CryptoIcon symbol={request.symbol} size="xs" />
                      <span className="font-medium text-white">
                        {request.amount.toFixed(8)} {request.symbol}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {request.admin_screenshot_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openImageViewer(request.admin_screenshot_url, `${request.symbol} withdrawal screenshot`)}
                          className="text-xs bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">View Screenshot</span>
                          <span className="sm:hidden">View</span>
                        </Button>
                      )}
                      {request.status === 'pending' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReview(request, 'approve')}
                            className="text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20 hover:text-green-300 text-xs"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            <span className="hidden sm:inline">Approve</span>
                            <span className="sm:hidden">✓</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReview(request, 'reject')}
                            className="text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300 text-xs"
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            <span className="hidden sm:inline">Reject</span>
                            <span className="sm:hidden">✗</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-gray-400">
                    <div>User: {request.users?.full_name || request.users?.email || request.user_id}</div>
                    <div>Submitted: {formatDate(request.submitted_at)}</div>
                    {request.reviewed_at && (
                      <div>Reviewed: {formatDate(request.reviewed_at)}</div>
                    )}
                    {request.admin_notes && (
                      <div>Admin Notes: {request.admin_notes}</div>
                    )}
                    {request.rejection_reason && (
                      <div>Rejection Reason: {request.rejection_reason}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Modal */}
      {showReviewModal && selectedRequest && (
        <Dialog open={showReviewModal} onOpenChange={() => setShowReviewModal(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">
                {action === 'approve' ? 'Approve' : 'Reject'} Withdraw Request
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-[#0a0a0a] p-4 rounded-lg border border-[#1e1e1e]">
                <p className="text-base font-medium text-white mb-2 flex items-center gap-1.5">
                  <CryptoIcon symbol={selectedRequest.symbol} size="xs" />
                  Amount: {selectedRequest.amount.toFixed(8)} {selectedRequest.symbol}
                </p>
                <p className="text-base text-gray-400">
                  User: {selectedRequest.users?.full_name || selectedRequest.users?.email || selectedRequest.user_id}
                </p>
              </div>

              {action === 'approve' && (
                <div>
                  <Label htmlFor="screenshot" className="text-gray-300">Upload Withdrawal Screenshot</Label>
                  <Input
                    id="screenshot"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="mt-1 bg-[#0a0a0a] border-[#1e1e1e] text-white"
                  />
                  {screenshotPreview && (
                    <div className="mt-2">
                      <img src={screenshotPreview} alt="Screenshot preview" className="max-w-full h-32 object-contain border border-[#1e1e1e] rounded" />
                      <Button variant="outline" size="sm" onClick={removeScreenshot} className="mt-1 bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white">
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="adminNotes" className="text-gray-300">Admin Notes</Label>
                <Textarea
                  id="adminNotes"
                  placeholder="Add any notes about this request..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="mt-1 bg-[#0a0a0a] border-[#1e1e1e] text-white placeholder:text-gray-500"
                />
              </div>

              {action === 'reject' && (
                <>
                  <div>
                    <Label htmlFor="rejectionReason" className="text-gray-300">Rejection Reason</Label>
                    <Textarea
                      id="rejectionReason"
                      placeholder="Reason for rejection..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="mt-1 bg-[#0a0a0a] border-[#1e1e1e] text-white placeholder:text-gray-500"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requireReverification"
                      checked={requireReverification}
                      onCheckedChange={(checked) => setRequireReverification(checked as boolean)}
                    />
                    <Label htmlFor="requireReverification" className="text-gray-300">
                      Require re-verification from user
                    </Label>
                  </div>
                </>
              )}

              <div className="flex space-x-2">
                <Button
                  onClick={handleSubmitReview}
                  disabled={reviewMutation.isPending || (action === 'reject' && !rejectionReason.trim())}
                  className={action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                >
                  {reviewMutation.isPending ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
                </Button>
                <Button variant="outline" onClick={() => setShowReviewModal(false)} className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
