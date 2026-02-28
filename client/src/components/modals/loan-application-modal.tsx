import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '../../lib/supabaseClient';

interface LoanApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export const LoanApplicationModal: React.FC<LoanApplicationModalProps> = ({
  isOpen,
  onClose,
  userId
}) => {
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [duration, setDuration] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [userDisabled, setUserDisabled] = useState(false);
  const { toast } = useToast();



  const handleSubmit = async () => {
    if (!amount || !purpose || !duration) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    const amountNum = parseFloat(amount);
    const durationNum = parseInt(duration);
    const monthlyIncomeNum = monthlyIncome ? parseFloat(monthlyIncome) : undefined;

    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid loan amount",
        variant: "destructive"
      });
      return;
    }

    // Validate duration (7-90 days)
    if (isNaN(durationNum) || durationNum < 7 || durationNum > 90) {
      toast({
        title: "Error",
        description: "Loan duration must be between 7 and 90 days",
        variant: "destructive"
      });
      return;
    }

    // Validate file sizes (max 1MB each)
    for (const file of documents) {
      if (file.size > 1024 * 1024) { // 1MB in bytes
        toast({
          title: "Error",
          description: `File "${file.name}" is too large. Maximum size is 1MB.`,
          variant: "destructive"
        });
        return;
      }
    }

    setSubmitting(true);

    try {
      // Submit loan application via server API (including document uploads)
      const formData = new FormData();
      formData.append('amount', amountNum.toString());
      formData.append('purpose', purpose);
      formData.append('duration', durationNum.toString());
      if (monthlyIncomeNum) {
        formData.append('monthly_income', monthlyIncomeNum.toString());
      }
      
      // Add documents to form data (server expects 'documents' field)
      documents.forEach((file) => {
        formData.append('documents', file);
      });

      const response = await fetch('/api/loan/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit loan application');
      }

      toast({
        title: "Success",
        description: "Loan application submitted successfully. We'll review it and get back to you soon.",
      });

      // Reset form
      setAmount('');
      setPurpose('');
      setDuration('');
      setMonthlyIncome('');
      setDocuments([]);
      onClose();
    } catch (error: any) {
      console.error('Error submitting loan application:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit loan application",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Validate file sizes
    for (const file of files) {
      if (file.size > 1024 * 1024) { // 1MB in bytes
        toast({
          title: "File Too Large",
          description: `File "${file.name}" is too large. Maximum size is 1MB.`,
          variant: "destructive"
        });
        return;
      }
    }
    
    setDocuments(files);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#111] border border-[#1e1e1e] max-w-md max-h-[90vh] overflow-y-auto text-white" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="text-white">Apply for Loan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="amount" className="text-gray-400 text-xs">Loan Amount (USD)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter loan amount"
              className="mt-1 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
            />
          </div>

          <div>
            <Label htmlFor="purpose" className="text-gray-300 text-xs">Purpose</Label>
            <Textarea
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Describe the purpose of the loan"
              className="mt-1 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="duration" className="text-gray-400 text-xs">Duration (days) - 7 to 90 days</Label>
            <Input
              id="duration"
              type="number"
              min="7"
              max="90"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Enter loan duration (7-90 days)"
              className="mt-1 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum: 7 days, Maximum: 90 days
            </p>
          </div>

          <div>
            <Label htmlFor="monthlyIncome" className="text-gray-300 text-xs">Monthly Income (USD) - Optional</Label>
            <Input
              id="monthlyIncome"
              type="number"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(e.target.value)}
              placeholder="Enter your monthly income"
              className="mt-1 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
            />
          </div>

          <div>
            <Label htmlFor="documents" className="text-gray-300 text-xs">Supporting Documents - Optional</Label>
            <Input
              id="documents"
              type="file"
              multiple
              onChange={handleFileChange}
              className="mt-1 bg-[#0a0a0a] border-[#2a2a2a] text-white"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
            <p className="text-xs text-gray-500 mt-1">
              Accepted formats: PDF, DOC, DOCX, JPG, JPEG, PNG (Max 1MB each)
            </p>
          </div>

          {documents.length > 0 && (
            <div>
              <Label className="text-gray-300 text-xs">Selected Files:</Label>
              <div className="mt-1 space-y-1">
                {documents.map((file, index) => (
                  <div key={index} className="text-xs text-gray-300">
                    {file.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

