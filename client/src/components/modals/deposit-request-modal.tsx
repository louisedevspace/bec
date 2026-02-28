import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { buildApiUrl } from '@/lib/config';

interface DepositRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DepositRequestModal({ isOpen, onClose, onSuccess }: DepositRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setScreenshot(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setScreenshotPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setScreenshotPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!symbol || !amount || !screenshot) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields and upload a screenshot.",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available. Please log in again.');
      }

      const formData = new FormData();
      formData.append('symbol', symbol);
      formData.append('amount', amount);
      formData.append('screenshot', screenshot);

      const response = await fetch(buildApiUrl('/deposit-requests'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to submit deposit request');
      }

      toast({
        title: "Success",
        description: "Deposit request submitted successfully. It will be reviewed by admin.",
        variant: "default",
      });

      // Reset form
      setSymbol('');
      setAmount('');
      setScreenshot(null);
      setScreenshotPreview(null);
      
      onSuccess();
      onClose();

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to submit deposit request',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5 text-blue-600" />
            <span>Submit Deposit Request</span>
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Submit your deposit for admin approval. Please provide the amount and screenshot of your transaction.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="symbol">Cryptocurrency</Label>
            <Select value={symbol} onValueChange={setSymbol} required>
              <SelectTrigger>
                <SelectValue placeholder="Select cryptocurrency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BTC">Bitcoin (BTC)</SelectItem>
                <SelectItem value="ETH">Ethereum (ETH)</SelectItem>
                <SelectItem value="USDT">Tether (USDT)</SelectItem>
                <SelectItem value="TRX">TRON (TRX)</SelectItem>
                <SelectItem value="SOL">Solana (SOL)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.00000001"
              placeholder="0.00000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="screenshot">Transaction Screenshot</Label>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
              {screenshotPreview ? (
                <div className="space-y-2">
                  <img 
                    src={screenshotPreview} 
                    alt="Screenshot preview" 
                    className="max-w-full h-32 object-contain rounded"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeScreenshot}
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove Screenshot
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Click to upload or drag and drop
                  </p>
                  <Input
                    id="screenshot"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('screenshot')?.click()}
                  >
                    Choose File
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Important:</strong> Please ensure your screenshot clearly shows:
            </p>
            <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
              <li>• Transaction amount</li>
              <li>• Destination address</li>
              <li>• Transaction hash/ID</li>
              <li>• Date and time</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Submit Request
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


