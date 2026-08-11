import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, XCircle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCryptoNumber } from "@/utils/format-utils";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { supabase } from "@/lib/supabaseClient";
import { buildApiUrl } from "@/lib/config";
import { useExchangeName } from "@/hooks/use-exchange-name";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const exchangeName = useExchangeName();
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
    queryKey: ["/api/portfolio", userId],
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
      <DialogContent className="max-w-sm sm:max-w-md p-0">
        <DialogHeader className="p-4 md:p-6 pb-0 border-b-0">
          <DialogTitle className="text-base md:text-lg text-foreground mb-4">
            {step === 1 ? "Withdraw Funds" : "Confirm Withdrawal"}
          </DialogTitle>

          {/* Step indicator */}
          <div className="flex items-center pb-4">
            {[{ n: 1, label: "Details" }, { n: 2, label: "Confirm" }].map((s, i, arr) => (
              <div key={s.n} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                      step === s.n
                        ? "bg-primary text-primary-foreground"
                        : step > s.n
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.n ? <Check className="w-3.5 h-3.5" /> : s.n}
                  </div>
                  <span className={`text-[10px] ${step === s.n ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className={`flex-1 h-px mx-2 mb-4 ${step > s.n ? "bg-success" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="p-4 md:p-6 pt-4 border-t border-border">

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="crypto-select" className="text-muted-foreground">Select Cryptocurrency</Label>
              <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                <SelectTrigger className="bg-muted border-border text-foreground rounded-xl h-11 mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="BTC" className="text-foreground hover:bg-muted focus:bg-muted">
                    <div className="flex items-center gap-2"><CryptoIcon symbol="BTC" size="xs" /><span>Bitcoin (BTC)</span></div>
                  </SelectItem>
                  <SelectItem value="ETH" className="text-foreground hover:bg-muted focus:bg-muted">
                    <div className="flex items-center gap-2"><CryptoIcon symbol="ETH" size="xs" /><span>Ethereum (ETH)</span></div>
                  </SelectItem>
                  <SelectItem value="USDT" className="text-foreground hover:bg-muted focus:bg-muted">
                    <div className="flex items-center gap-2"><CryptoIcon symbol="USDT" size="xs" /><span>Tether (USDT)</span></div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amount" className="text-muted-foreground">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.00000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-muted border-border text-foreground placeholder-gray-600 rounded-xl h-11 mt-1.5 tabular-nums"
              />
              <div className="text-xs text-muted-foreground mt-1.5">
                Available: <span className="text-success font-medium tabular-nums">{formatCryptoNumber(getAvailableBalance())} {selectedCrypto}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="wallet-address" className="text-muted-foreground">Wallet Address</Label>
              <Input
                id="wallet-address"
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder={`Enter your ${selectedCrypto} wallet address`}
                className="bg-muted border-border text-foreground placeholder-gray-600 rounded-xl h-11 mt-1.5 font-mono"
              />
              <div className="text-xs text-muted-foreground mt-1.5">
                Please double-check your wallet address before submitting
              </div>
            </div>

            <Alert className="bg-warning/10 border-warning/20 p-3.5">
              <AlertTriangle className="text-warning" size={16} />
              <AlertDescription className="text-sm text-warning">
                Withdrawals are irreversible once approved. Sending to the wrong address or network will result in permanent loss of funds.
              </AlertDescription>
            </Alert>

            <Button onClick={handleNext} className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm flex items-center justify-center gap-2 disabled:opacity-40">
              Next
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
              <div className="p-4">
                <p className="font-medium text-info text-xs uppercase tracking-wider mb-3">Withdrawal Details</p>
                <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cryptocurrency:</span>
                  <span className="font-medium text-foreground">{selectedCrypto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium text-foreground tabular-nums">{amount} {selectedCrypto}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Wallet Address:</span>
                  <span className="font-medium text-xs break-all text-foreground font-mono text-right">{walletAddress}</span>
                </div>
                <div className="border-t border-border pt-2.5 flex justify-between">
                  <span className="text-muted-foreground">Available Balance:</span>
                  <span className="font-medium text-foreground tabular-nums">{getAvailableBalance().toFixed(8)} {selectedCrypto}</span>
                </div>
              </div>
              </div>
            </div>

            <Alert className="bg-warning/10 border-warning/20 p-3.5">
              <AlertTriangle className="text-warning" size={16} />
              <AlertDescription className="text-sm">
                <p className="font-medium text-warning mb-1">This action cannot be undone</p>
                <p className="text-muted-foreground">
                  Confirm the wallet address and network are correct. {exchangeName} cannot recover funds sent to an incorrect or unsupported address.
                </p>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button onClick={handleBack} className="flex-1 h-11 rounded-xl bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground font-semibold">
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold shadow-sm disabled:opacity-40"
                disabled={withdrawMutation.isPending}
              >
                {withdrawMutation.isPending ? "Submitting..." : "Confirm Withdrawal"}
              </Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
