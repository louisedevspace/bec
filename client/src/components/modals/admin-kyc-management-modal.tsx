import React, { useState, useEffect } from 'react';
import { formatDateTime as formatDate } from '@/lib/date-utils';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  AlertTriangle, 
  Eye, 
  FileText,
  Camera,
  User,
  Clock,
  Calendar
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/lib/config';
import { buildImageViewerPath, getImageDisplayUrl } from '@/lib/image';

interface KYCVerification {
  id: number;
  user_id: string;
  full_name: string;
  ssn: string;
  address: string;
  front_id_url: string | null;
  back_id_url: string | null;
  selfie_with_id_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason?: string;
  user?: {
    email: string;
    full_name: string;
  };
}

interface AdminKYCManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminKYCManagementModal({ isOpen, onClose }: AdminKYCManagementModalProps) {
  const [kycRequests, setKycRequests] = useState<KYCVerification[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedKYC, setSelectedKYC] = useState<KYCVerification | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchKYCRequests();
    }
  }, [isOpen]);

  const fetchKYCRequests = async () => {
    setLoading(true);
    try {
      console.log('🔍 Fetching KYC requests...');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      console.log('🔍 Session:', session ? 'Found' : 'Not found');
      console.log('🔍 Token:', token ? 'Present' : 'Missing');
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      console.log('🔍 Making API request to /api/admin/kyc-requests...');
      const response = await fetch(buildApiUrl('/admin/kyc-requests'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('🔍 Response status:', response.status);
      console.log('🔍 Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('🔍 Error response:', errorText);
        throw new Error(`Failed to fetch KYC requests: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('🔍 KYC requests received:', data.length);
      setKycRequests(data);
    } catch (error: any) {
      console.error('🔍 Error in fetchKYCRequests:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to fetch KYC requests',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKYCReview = async (kycId: number, action: 'approve' | 'reject', reason?: string) => {
    console.log('handleKYCReview called with:', { kycId, action, reason });
    console.log('kycId type:', typeof kycId, 'value:', kycId);
    setActionLoading(`${action}-${kycId}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(buildApiUrl('/admin/kyc-review'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          kycId,
          action,
          reason
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Action failed');
      }

      toast({
        title: "Success",
        description: result.message,
        variant: "default",
      });

      // Refresh the list
      fetchKYCRequests();
      setShowRejectionDialog(false);
      setRejectionReason('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Action failed',
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = (kyc: KYCVerification) => {
    setSelectedKYC(kyc);
    setShowRejectionDialog(true);
  };

  const confirmRejection = () => {
    if (selectedKYC && rejectionReason.trim()) {
      handleKYCReview(selectedKYC.id, 'reject', rejectionReason.trim());
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case 'approved':
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <div className="w-3 h-3 flex items-center justify-center">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L4 6V12C4 16.5 7.5 20.5 12 22C16.5 20.5 20 16.5 20 12V6L12 2Z" fill="#10b981"/>
                <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            Approved
          </Badge>
        );
      case 'rejected':
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // formatDateTime imported from @/lib/date-utils as formatDate

  const pendingRequests = kycRequests.filter(k => k.status === 'pending');
  const approvedRequests = kycRequests.filter(k => k.status === 'approved');
  const rejectedRequests = kycRequests.filter(k => k.status === 'rejected');

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="admin-dialog max-w-6xl max-h-[90vh] overflow-y-auto pr-2 bg-[#111] border-[#1e1e1e] text-white" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-white">
              <Shield className="h-5 w-5 text-blue-400" />
              <span>KYC Verification Management</span>
            </DialogTitle>
            <p className="text-sm text-gray-400">
              Review and manage KYC verification requests from users.
            </p>
          </DialogHeader>

          <div className="space-y-6">
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#0a0a0a] border-[#1e1e1e]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-400">Pending</p>
                      <p className="text-2xl font-bold text-orange-400">{pendingRequests.length}</p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-400" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#0a0a0a] border-[#1e1e1e]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-400">Approved</p>
                      <p className="text-2xl font-bold text-green-400">{approvedRequests.length}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#0a0a0a] border-[#1e1e1e]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-400">Rejected</p>
                      <p className="text-2xl font-bold text-red-400">{rejectedRequests.length}</p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* KYC Requests Tabs */}
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-[#0a0a0a] border border-[#1e1e1e]">
                <TabsTrigger value="pending" className="flex items-center gap-2 data-[state=active]:bg-[#111] data-[state=active]:text-orange-400">
                  <Clock className="h-4 w-4" />
                  Pending ({pendingRequests.length})
                </TabsTrigger>
                <TabsTrigger value="approved" className="flex items-center gap-2 data-[state=active]:bg-[#111] data-[state=active]:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  Approved ({approvedRequests.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="flex items-center gap-2 data-[state=active]:bg-[#111] data-[state=active]:text-red-400">
                  <XCircle className="h-4 w-4" />
                  Rejected ({rejectedRequests.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
                    <span className="ml-2 text-gray-400">Loading KYC requests...</span>
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No pending KYC requests
                  </div>
                ) : (
                  pendingRequests.map((kyc) => (
                    <Card key={kyc.id} className="border-l-4 border-l-orange-500 bg-[#0a0a0a] border-[#1e1e1e]">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg text-white">{kyc.full_name}</CardTitle>
                            <p className="text-sm text-gray-400">
                              Submitted: {formatDate(kyc.submitted_at)}
                            </p>
                          </div>
                          {getStatusBadge(kyc.status)}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* User Information */}
                          <div className="space-y-3">
                            <h4 className="font-semibold text-white">User Information</h4>
                            <div className="space-y-2 text-sm text-gray-300">
                              <div><strong className="text-gray-400">Email:</strong> {kyc.user?.email || 'N/A'}</div>
                              <div><strong className="text-gray-400">SSN:</strong> {kyc.ssn}</div>
                              <div><strong className="text-gray-400">Address:</strong> {kyc.address}</div>
                            </div>
                          </div>

                          {/* Documents */}
                          <div className="space-y-3">
                            <h4 className="font-semibold text-white">Documents</h4>
                            <div className="grid grid-cols-3 gap-2">
                              <DocThumbnail url={kyc.front_id_url} label="Front ID" />
                              <DocThumbnail url={kyc.back_id_url} label="Back ID" />
                              <DocThumbnail url={kyc.selfie_with_id_url} label="Selfie" />
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-[#1e1e1e]">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReject(kyc)}
                            disabled={actionLoading !== null}
                            className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              handleKYCReview(kyc.id, 'approve');
                            }}
                            disabled={actionLoading !== null}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="approved" className="space-y-4">
                {approvedRequests.map((kyc) => (
                  <Card key={kyc.id} className="border-l-4 border-l-green-500 bg-[#0a0a0a] border-[#1e1e1e]">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg text-white">{kyc.full_name}</CardTitle>
                          <p className="text-sm text-gray-400">
                            Approved: {kyc.reviewed_at ? formatDate(kyc.reviewed_at) : 'N/A'}
                          </p>
                        </div>
                        {getStatusBadge(kyc.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-white">User Information</h4>
                          <div className="space-y-2 text-sm text-gray-300">
                            <div><strong className="text-gray-400">Email:</strong> {kyc.user?.email || 'N/A'}</div>
                            <div><strong className="text-gray-400">SSN:</strong> {kyc.ssn}</div>
                            <div><strong className="text-gray-400">Address:</strong> {kyc.address}</div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-semibold text-white">Documents</h4>
                          <div className="grid grid-cols-3 gap-2">
                            <DocThumbnail url={kyc.front_id_url} label="Front ID" />
                            <DocThumbnail url={kyc.back_id_url} label="Back ID" />
                            <DocThumbnail url={kyc.selfie_with_id_url} label="Selfie" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="rejected" className="space-y-4">
                {rejectedRequests.map((kyc) => (
                  <Card key={kyc.id} className="border-l-4 border-l-red-500 bg-[#0a0a0a] border-[#1e1e1e]">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg text-white">{kyc.full_name}</CardTitle>
                          <p className="text-sm text-gray-400">
                            Rejected: {kyc.reviewed_at ? formatDate(kyc.reviewed_at) : 'N/A'}
                          </p>
                        </div>
                        {getStatusBadge(kyc.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-white">User Information</h4>
                          <div className="space-y-2 text-sm text-gray-300">
                            <div><strong className="text-gray-400">Email:</strong> {kyc.user?.email || 'N/A'}</div>
                            <div><strong className="text-gray-400">SSN:</strong> {kyc.ssn}</div>
                            <div><strong className="text-gray-400">Address:</strong> {kyc.address}</div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-semibold text-white">Documents</h4>
                          <div className="grid grid-cols-3 gap-2">
                            <DocThumbnail url={kyc.front_id_url} label="Front ID" />
                            <DocThumbnail url={kyc.back_id_url} label="Back ID" />
                            <DocThumbnail url={kyc.selfie_with_id_url} label="Selfie" />
                          </div>
                        </div>
                      </div>
                      {kyc.rejection_reason && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                          <h5 className="font-semibold text-red-300 mb-1">Rejection Reason:</h5>
                          <p className="text-sm text-red-400">{kyc.rejection_reason}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>

            {/* Close Button */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={onClose} disabled={loading} className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <DialogContent className="admin-dialog max-w-md bg-[#111] border-[#1e1e1e] text-white" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="text-white">Reject KYC Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason" className="text-gray-300">Rejection Reason</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Please provide a reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[100px] bg-[#0a0a0a] border-[#1e1e1e] text-white placeholder:text-gray-500"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowRejectionDialog(false)} className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmRejection}
                disabled={!rejectionReason.trim()}
                className="bg-red-600 hover:bg-red-700"
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DocThumbnail({ url, label }: { url: string | null; label: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (!url) return null;
  return (
    <a
      href={buildImageViewerPath(url, label)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center p-2 border border-[#1e1e1e] rounded-lg hover:bg-[#1a1a1a] bg-[#111] transition-colors group"
    >
      <div className="w-full h-16 bg-[#0a0a0a] rounded overflow-hidden mb-1 flex items-center justify-center">
        {!imgFailed ? (
          <img
            src={getImageDisplayUrl(url)}
            alt={label}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <FileText className="h-5 w-5 text-blue-400" />
        )}
      </div>
      <span className="text-xs text-gray-400 group-hover:text-gray-300">{label}</span>
    </a>
  );
}

