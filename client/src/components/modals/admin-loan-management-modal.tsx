import React, { useState, useEffect } from 'react';
import { formatDate } from '@/lib/date-utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, X, User, Mail, Shield, CheckCircle, XCircle,
  Eye, AlertTriangle, Settings, FileText, DollarSign, Calendar, Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { buildImageViewerPath, buildStorageImageUrl } from '@/lib/image';

interface LoanApplication {
  id: number;
  user_id: string;
  amount: number;
  purpose: string;
  duration: number;
  monthly_income?: number;
  status: 'pending' | 'approved' | 'rejected';
  documents: any;
  created_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
  reviewed_by?: string;
  loan_pay_date?: string;
  is_reminder_sent?: boolean;
  loan_status?: 'active' | 'paid' | 'overdue';
  user?: {
    email: string;
    full_name: string;
  };
}

interface AdminLoanManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminLoanManagementModal: React.FC<AdminLoanManagementModalProps> = ({
  isOpen,
  onClose
}) => {
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>([]);
  const [filteredApplications, setFilteredApplications] = useState<LoanApplication[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<LoanApplication | null>(null);
  const [showApplicationDetails, setShowApplicationDetails] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionModal, setShowRejectionModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchLoanApplications();
    }
  }, [isOpen]);

  useEffect(() => {
    const filtered = loanApplications.filter(app =>
      app.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.user?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.status.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredApplications(filtered);
  }, [loanApplications, searchTerm]);

  const fetchLoanApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      // First fetch loan applications
      const { data: applications, error: applicationsError } = await supabase
        .from('loan_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (applicationsError) throw applicationsError;

      // Then fetch user data for each application
      const applicationsWithUsers = await Promise.all(
        (applications || []).map(async (application) => {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('email, full_name')
            .eq('id', application.user_id)
            .single();

          return {
            ...application,
            user: userError ? null : userData
          };
        })
      );

      setLoanApplications(applicationsWithUsers);
    } catch (err: any) {
      console.error('Error fetching loan applications:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewApplicationDetails = (application: LoanApplication) => {
    setSelectedApplication(application);
    setShowApplicationDetails(true);
  };

  const handleApproveLoan = async (application: LoanApplication) => {
    try {
      if (!window.confirm(`Are you sure you want to approve the loan application for ${application.user?.email}? This will add ${application.amount} to their account.`)) {
        return;
      }

      // Get current user (admin) for reviewed_by
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Admin user not found');

      // Calculate pay date (duration in days from now)
      const payDate = new Date();
      payDate.setDate(payDate.getDate() + application.duration);

      // Update loan application status with timestamps
      const { error: updateError } = await supabase
        .from('loan_applications')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          loan_pay_date: payDate.toISOString()
        })
        .eq('id', application.id);

      if (updateError) throw updateError;

      // Add loan amount to user's portfolio (USDT)
      // First check if user already has a USDT portfolio
      const { data: existingPortfolio, error: checkError } = await supabase
        .from('portfolios')
        .select('available')
        .eq('user_id', application.user_id)
        .eq('symbol', 'USDT')
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw checkError;
      }

      if (existingPortfolio) {
        // Update existing portfolio
        const newAmount = (parseFloat(existingPortfolio.available) + parseFloat(application.amount.toString())).toString();
        const { error: portfolioError } = await supabase
          .from('portfolios')
          .update({
            available: newAmount
          })
          .eq('user_id', application.user_id)
          .eq('symbol', 'USDT');

        if (portfolioError) throw portfolioError;
      } else {
        // Create new portfolio entry
        const { error: portfolioError } = await supabase
          .from('portfolios')
          .insert({
            user_id: application.user_id,
            symbol: 'USDT',
            available: application.amount.toString()
          });

        if (portfolioError) throw portfolioError;
      }

      // Refresh the list
      await fetchLoanApplications();
      setError(null);
    } catch (err: any) {
      console.error('Error approving loan:', err);
      setError(`Failed to approve loan: ${err.message}`);
    }
  };

  const handleRejectLoan = async (application: LoanApplication) => {
    try {
      if (!rejectionReason.trim()) {
        setError('Please provide a rejection reason');
        return;
      }

      if (!window.confirm(`Are you sure you want to reject the loan application for ${application.user?.email}?`)) {
        return;
      }

      // Get current user (admin) for reviewed_by
      const { data: { user } } = await supabase.auth.getUser();

      const updateData: {
        status: string;
        rejection_reason: string;
        reviewed_at: string;
        rejected_at: string;
        reviewed_by?: string;
      } = {
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
        reviewed_at: new Date().toISOString(),
        rejected_at: new Date().toISOString()
      };

      // Only add reviewed_by if user is found
      if (user) {
        updateData.reviewed_by = user.id;
      }

      const { error } = await supabase
        .from('loan_applications')
        .update(updateData)
        .eq('id', application.id);

      if (error) throw error;

      // Refresh the list
      await fetchLoanApplications();
      setRejectionReason('');
      setShowRejectionModal(false);
      setError(null);
    } catch (err: any) {
      console.error('Error rejecting loan:', err);
      setError(`Failed to reject loan: ${err.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-warning/15 text-warning">Pending</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-success/15 text-success">Approved</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="bg-danger/15 text-danger">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // formatDate imported from @/lib/date-utils

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <DollarSign className="w-5 h-5 text-primary" />
            Loan Management
          </DialogTitle>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search by email, name, purpose, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger p-3 rounded-lg">
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
            {filteredApplications.map((application) => (
              <Card key={application.id} className="bg-muted/30 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground font-medium">
                            {application.user?.full_name || 'Unknown User'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {application.user?.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-foreground font-medium tabular-nums">
                          {formatCurrency(application.amount)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {application.duration} days
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-sm text-muted-foreground mb-1">Purpose</div>
                        <div className="text-foreground text-sm max-w-32 truncate">
                          {application.purpose}
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-sm text-muted-foreground mb-1">Status</div>
                        {getStatusBadge(application.status)}
                      </div>

                      <div className="text-center">
                        <div className="text-sm text-muted-foreground mb-1">Applied</div>
                        <div className="text-foreground text-sm">
                          {formatDate(application.created_at)}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewApplicationDetails(application)}
                          className="text-xs bg-transparent border-border text-foreground/90 hover:bg-muted hover:text-foreground"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View Details
                        </Button>

                        {application.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApproveLoan(application)}
                              className="text-xs text-success border-success/30 bg-success/10 hover:bg-success/20"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedApplication(application);
                                setRejectionReason('');
                                setShowRejectionModal(true);
                              }}
                              className="text-xs text-danger border-danger/30 bg-danger/10 hover:bg-danger/20"
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* No Results */}
            {!loading && filteredApplications.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No loan applications found matching your search.' : 'No loan applications found.'}
              </div>
            )}
          </div>
        )}

        {/* Application Details Modal */}
        <Dialog open={showApplicationDetails} onOpenChange={(open) => !open && setShowApplicationDetails(false)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Loan Application Details
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Review the applicant details and attached documents.
              </DialogDescription>
            </DialogHeader>

            {selectedApplication && (
              <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Applicant</Label>
                  <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                    {selectedApplication.user?.full_name || 'Unknown User'}
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Email</Label>
                  <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                    {selectedApplication.user?.email}
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Loan Amount</Label>
                  <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1 tabular-nums">
                    {formatCurrency(selectedApplication.amount)}
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Duration</Label>
                  <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                    {selectedApplication.duration} days
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Purpose</Label>
                  <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                    {selectedApplication.purpose}
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Monthly Income</Label>
                  <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1 tabular-nums">
                    {selectedApplication.monthly_income ? formatCurrency(selectedApplication.monthly_income) : 'Not provided'}
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(selectedApplication.status)}
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Applied Date</Label>
                  <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                    {formatDate(selectedApplication.created_at)}
                  </div>
                </div>

                {selectedApplication.rejection_reason && (
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground text-xs">Rejection Reason</Label>
                    <div className="text-danger text-sm bg-danger/10 border border-danger/20 p-2 rounded-lg mt-1">
                      {selectedApplication.rejection_reason}
                    </div>
                  </div>
                )}

                {selectedApplication.reviewed_at && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Reviewed At</Label>
                    <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                      {formatDate(selectedApplication.reviewed_at)}
                    </div>
                  </div>
                )}

                {selectedApplication.loan_pay_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Loan Pay Date</Label>
                    <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                      {formatDate(selectedApplication.loan_pay_date)}
                    </div>
                  </div>
                )}


                {selectedApplication.documents && (
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground text-xs">Documents</Label>
                    <div className="text-foreground text-sm bg-muted/30 border border-border p-2 rounded-lg mt-1">
                      {selectedApplication.documents.urls && selectedApplication.documents.urls.length > 0 ? (
                        <div className="space-y-2">
                          {selectedApplication.documents.urls.map((url: string, index: number) => (
                            <div key={index} className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-primary" />
                              <a
                                href={buildImageViewerPath(buildStorageImageUrl('loan-documents', url), `Loan document ${index + 1}`)}
                                className="text-primary hover:text-primary/80 underline text-xs"
                              >
                                Document {index + 1} - {url.split('/').pop()}
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-xs">No documents uploaded</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 mt-6">
                {selectedApplication.status === 'pending' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRejectionReason('');
                        setShowRejectionModal(true);
                      }}
                      className="border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleApproveLoan(selectedApplication)}
                      className="bg-success text-success-foreground hover:opacity-90"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowApplicationDetails(false)}
                  className="bg-transparent border-border text-foreground/90 hover:bg-muted hover:text-foreground"
                >
                  Close
                </Button>
              </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rejection Modal */}
        <Dialog open={showRejectionModal} onOpenChange={(open) => !open && setShowRejectionModal(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-danger" />
                Reject Loan Application
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Provide a clear rejection reason for the user.
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label className="text-muted-foreground text-xs">Rejection Reason</Label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="mt-1 bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectionReason('');
                  setShowRejectionModal(false);
                }}
                className="bg-transparent border-border text-foreground/90 hover:bg-muted hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={() => selectedApplication && handleRejectLoan(selectedApplication)}
                className="bg-danger text-danger-foreground hover:opacity-90"
                disabled={!rejectionReason.trim() || !selectedApplication || selectedApplication.status !== 'pending'}
              >
                Reject
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

