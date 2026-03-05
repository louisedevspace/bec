import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCryptoNumber } from "@/utils/format-utils";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { supabase } from "@/lib/supabaseClient";
import { buildApiUrl } from "@/lib/config";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const [step, setStep] = useState(1);
  const [selectedCrypto, setSelectedCrypto] = useState("BTC");
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisabled, setUserDisabled] = useState(false);
  const { toast } = useToast();

  // Get current user ID and check if disabled
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        

      }
    };
    getCurrentUser();
  }, [onClose, toast]);

  // Get user's portfolio balance
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');
      
      const response = await fetch(buildApiUrl(`/portfolio/${userId}`), {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch portfolio');
      }

      const data = await response.json();
      return data || [];
    },
    enabled: !!userId,
  });

  const getAvailableBalance = () => {
    if (!portfolio) return 0;
    const asset = portfolio.find((p: any) => p.symbol === selectedCrypto);
    return asset ? parseFloat(asset.available) : 0;
  };

  const withdrawMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');
      
      console.log('🔍 Submitting withdraw request with data:', data);
      console.log('🔍 Using token:', session.access_token.substring(0, 20) + '...');
      
      const response = await fetch(buildApiUrl('/withdraw-requests'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      console.log('🔍 Response status:', response.status);
      console.log('🔍 Response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json();
        console.log('🔍 Error data:', errorData);
        throw new Error(errorData.message || 'Failed to submit withdraw request');
      }

      const result = await response.json();
      console.log('🔍 Success result:', result);
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Withdraw Request Submitted",
        description: "Your withdraw request has been sent to admin for approval.",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Withdraw Request Failed",
        description: error.message || "Failed to submit withdraw request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (!amount || !walletAddress.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in both amount and wallet address.",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount.",
        variant: "destructive",
      });
      return;
    }

    const availableBalance = getAvailableBalance();
    if (amountNum > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You have ${formatCryptoNumber(availableBalance)} ${selectedCrypto} available but trying to withdraw ${formatCryptoNumber(amountNum)} ${selectedCrypto}.`,
        variant: "destructive",
      });
      return;
    }

    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleClose = () => {
    setStep(1);
    setAmount("");
    setWalletAddress("");
    onClose();
  };

  const handleSubmit = () => {
    if (!amount || !walletAddress.trim() || !userId) {
      toast({
        title: "Invalid Data",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount.",
        variant: "destructive",
      });
      return;
    }

    const availableBalance = getAvailableBalance();
    if (amountNum > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You have ${formatCryptoNumber(availableBalance)} ${selectedCrypto} available but trying to withdraw ${formatCryptoNumber(amountNum)} ${selectedCrypto}.`,
        variant: "destructive",
      });
      return;
    }

    withdrawMutation.mutate({
      userId,
      symbol: selectedCrypto,
      amount: amount,
      walletAddress: walletAddress.trim(),
    });
  };

  if (userDisabled) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm sm:max-w-md max-h-[95vh] overflow-y-auto bg-[#111] border border-[#1e1e1e] text-white">
        <DialogHeader className="p-4 md:p-6">
          <DialogTitle className="text-base md:text-lg">
            {step === 1 ? "Withdraw" : "Withdrawal Details"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="crypto-select" className="text-gray-300">Select Cryptocurrency</Label>
              <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-[#2a2a2a]">
                  <SelectItem value="BTC" className="text-white">
                    <div className="flex items-center gap-2"><CryptoIcon symbol="BTC" size="xs" /><span>Bitcoin (BTC)</span></div>
                  </SelectItem>
                  <SelectItem value="ETH" className="text-white">
                    <div className="flex items-center gap-2"><CryptoIcon symbol="ETH" size="xs" /><span>Ethereum (ETH)</span></div>
                  </SelectItem>
                  <SelectItem value="USDT" className="text-white">
                    <div className="flex items-center gap-2"><CryptoIcon symbol="USDT" size="xs" /><span>Tether (USDT)</span></div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amount" className="text-gray-300">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.00000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
              />
              <div className="text-sm text-gray-500 mt-1">
                Available: {formatCryptoNumber(getAvailableBalance())} {selectedCrypto}
              </div>
            </div>

            <div>
              <Label htmlFor="wallet-address" className="text-gray-300">Wallet Address</Label>
              <Input
                id="wallet-address"
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder={`Enter your ${selectedCrypto} wallet address`}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
              />
              <div className="text-sm text-gray-500 mt-1">
                Please double-check your wallet address before submitting
              </div>
            </div>

            <Button onClick={handleNext} className="w-full bg-blue-500 hover:bg-blue-600 text-white">
              Next
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 rounded-lg">
              <p className="font-medium text-blue-500 mb-2">Withdraw Request Information</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Cryptocurrency:</span>
                  <span className="font-medium text-white">{selectedCrypto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount:</span>
                  <span className="font-medium text-white">{amount} {selectedCrypto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Wallet Address:</span>
                  <span className="font-medium text-xs break-all text-white">{walletAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Available Balance:</span>
                  <span className="font-medium text-white">{getAvailableBalance().toFixed(8)} {selectedCrypto}</span>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <Button onClick={handleBack} variant="outline" className="flex-1 bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]">
                Back
              </Button>
              <Button 
                onClick={handleSubmit} 
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                disabled={withdrawMutation.isPending}
              >
                {withdrawMutation.isPending ? "Submitting..." : "Confirm Withdrawal"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
