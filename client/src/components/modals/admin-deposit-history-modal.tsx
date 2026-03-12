import { useState } from "react";
import { formatDateTime as formatDate } from '@/lib/date-utils';
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, History } from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { supabase } from "@/lib/supabaseClient";
import { buildApiUrl } from "@/lib/config";
import { openImageViewer } from "@/lib/image";

interface DepositRequest {
  id: number;
  user_id: string;
  symbol: string;
  amount: string;
  status: 'pending' | 'approved' | 'rejected';
  screenshot_url?: string;
  admin_notes?: string;
  rejection_reason?: string;
  require_reverification: boolean;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  users?: {
    email: string;
    full_name?: string;
    display_id?: string;
  };
}

interface AdminDepositHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminDepositHistoryModal({ isOpen, onClose }: AdminDepositHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<'approved' | 'rejected'>('approved');

  const { data: depositRequests, isLoading, error } = useQuery({
    queryKey: ['admin-deposit-requests'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const response = await fetch(buildApiUrl('/admin/deposit-requests'), {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch deposit requests');
      }

      const data = await response.json();
      return data || [];
    },
    enabled: isOpen,
    refetchInterval: 10000,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/20">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/20">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="border-[#1e1e1e] text-gray-400">{status}</Badge>;
    }
  };

  // formatDateTime imported from @/lib/date-utils as formatDate

  const filteredRequests = depositRequests?.filter((request: DepositRequest) => 
    request.status === activeTab
  ) || [];

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="admin-dialog sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-[#111] border-[#1e1e1e] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Deposit History</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-center text-gray-400">Loading deposit history...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="admin-dialog sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-[#111] border-[#1e1e1e] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Deposit History</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-center text-red-400">Error loading deposit history</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="admin-dialog sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-[#111] border-[#1e1e1e] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <History className="h-5 w-5 text-blue-400" />
            Deposit History
          </DialogTitle>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-[#0a0a0a] p-1 rounded-lg border border-[#1e1e1e]">
          <Button
            variant={activeTab === 'approved' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('approved')}
            className={`flex-1 ${activeTab === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'hover:bg-[#1a1a1a] text-gray-400'}`}
          >
            Approved ({depositRequests?.filter((r: DepositRequest) => r.status === 'approved').length || 0})
          </Button>
          <Button
            variant={activeTab === 'rejected' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('rejected')}
            className={`flex-1 ${activeTab === 'rejected' ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-[#1a1a1a] text-gray-400'}`}
          >
            Rejected ({depositRequests?.filter((r: DepositRequest) => r.status === 'rejected').length || 0})
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No {activeTab} deposit requests found
            </div>
          ) : (
            filteredRequests.map((request: DepositRequest) => (
              <div key={request.id} className="border border-[#1e1e1e] bg-[#0a0a0a] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(request.status)}
                    <CryptoIcon symbol={request.symbol} size="xs" />
                    <span className="font-medium text-white">
                      {parseFloat(request.amount).toFixed(8)} {request.symbol}
                    </span>
                  </div>
                                     <div className="flex items-center space-x-2">
                     {request.screenshot_url && (
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={() => openImageViewer(request.screenshot_url, `${request.symbol} deposit screenshot`)}
                         className="text-xs bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                       >
                         <Eye className="h-3 w-3 mr-1" />
                         <span className="hidden sm:inline">View Screenshot</span>
                         <span className="sm:hidden">View</span>
                       </Button>
                     )}
                   </div>
                </div>

                <div className="text-sm text-gray-400 space-y-1">
                  <div>User: {request.users?.full_name || request.users?.email || (request.users?.display_id || request.user_id.substring(0, 8))}</div>
                  <div>Submitted: {formatDate(request.submitted_at)}</div>
                  {request.reviewed_at && (
                    <div>Reviewed: {formatDate(request.reviewed_at)}</div>
                  )}
                  {request.reviewed_by && (
                    <div>Reviewed by: {request.reviewed_by}</div>
                  )}
                  {request.admin_notes && (
                    <div>Admin Notes: {request.admin_notes}</div>
                  )}
                  {request.rejection_reason && (
                    <div className="text-red-400">Rejection Reason: {request.rejection_reason}</div>
                  )}
                  {request.require_reverification && (
                    <div className="text-orange-400 font-medium">Requires Re-verification</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
