import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCode } from "@/components/ui/qr-code";
import { Copy, CheckCircle, AlertTriangle, Upload, X, Check, Info, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cryptoApi } from "@/services/crypto-api";
import { supabase } from "@/lib/supabase";
import { buildApiUrl } from "@/lib/config";
import { compressUserImage } from "@/lib/image-compress";

const GENERIC_DEPOSIT_PLACEHOLDER = "0x000000000";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const [step, setStep] = useState(1);
  const [selectedCrypto, setSelectedCrypto] = useState("BTC");
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [depositAddress, setDepositAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [userDisabled, setUserDisabled] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<any[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const { toast } = useToast();
  const { copied, copyToClipboard } = useCopyToClipboard();

  const fetchDepositAddresses = async () => {
    setLoadingAddresses(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No auth token available');
        setDepositAddresses([]);
        setLoadingAddresses(false);
        return;
      }

      const response = await fetch('/api/deposit-addresses', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDepositAddresses(data.addresses || []);
        console.log('✅ Successfully fetched deposit addresses from API:', data.addresses);
      } else {
        console.error('Failed to fetch deposit addresses:', response.status, response.statusText);
        setDepositAddresses([]);
      }
    } catch (error) {
      console.error('Error fetching deposit addresses:', error);
      setDepositAddresses([]);
    } finally {
      setLoadingAddresses(false);
    }
  };

  const getDepositAddress = (crypto: string, network: string) => {
    const addressData = depositAddresses.find(addr => 
      addr.asset_symbol === crypto && 
      addr.network.toLowerCase() === network.toLowerCase()
    );
    
    if (addressData) {
      return addressData.address;
    }

    return GENERIC_DEPOSIT_PLACEHOLDER;
  };

  // Refresh deposit addresses
  const refreshAddresses = () => {
    fetchDepositAddresses();
  };

  // Check if user is disabled


  // Fetch deposit addresses when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDepositAddresses();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!depositAddresses.length) return;

    const symbols = Array.from(
      new Set(
        depositAddresses
          .map((addr: any) => addr.asset_symbol)
          .filter(Boolean)
      )
    );

    if (!symbols.length) return;

    setSelectedCrypto((current) => {
      if (current && symbols.includes(current)) return current;
      return symbols[0] as string;
    });
  }, [depositAddresses]);

  const getNetworkOptions = (crypto: string) => {
    const networks = depositAddresses
      .filter((addr: any) => addr.asset_symbol === crypto)
      .map((addr: any) => addr.network)
      .filter(Boolean);

    const uniqueNetworks = Array.from(new Set(networks));
    if (uniqueNetworks.length > 0) {
      return uniqueNetworks as string[];
    }

    switch (crypto) {
      case "USDT":
        return ["TRC20"];
      case "ETH":
        return ["ERC20"];
      case "BTC":
        return ["Bitcoin"];
      case "TRX":
        return ["TRC20"];
      default:
        return [];
    }
  };

  useEffect(() => {
    const options = getNetworkOptions(selectedCrypto);
    if (options.length > 0) {
      setSelectedNetwork(options[0]);
    } else {
      setSelectedNetwork("");
    }
  }, [selectedCrypto, depositAddresses]);

  const handleGenerateAddress = () => {
    const address = getDepositAddress(selectedCrypto, selectedNetwork);
    if (address) {
      setDepositAddress(address);
      setStep(2);
    } else {
      toast({
        title: "Error",
        description: "No deposit address available for selected cryptocurrency and network.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setStep(1);
    setDepositAddress("");
    setAmount("");
    setScreenshot(null);
    setScreenshotPreview(null);
    onClose();
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setDepositAddress("");
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleCopyAddress = async () => {
    await copyToClipboard(depositAddress, "Deposit address copied to clipboard.");
  };

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

  const submitDepositRequestMutation = useMutation({
    mutationFn: async () => {
      if (!screenshot) {
        throw new Error('Screenshot is required');
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available. Please log in again.');
      }

      const formData = new FormData();
      formData.append('symbol', selectedCrypto);
      formData.append('amount', amount);
      const compressedScreenshot = await compressUserImage(screenshot);
      formData.append('screenshot', compressedScreenshot);

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

      return result;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Deposit request submitted successfully.",
        variant: "default",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || 'Failed to submit deposit request',
        variant: "destructive",
      });
    },
  });

  const handleSubmitDepositRequest = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || !screenshot) {
      toast({
        title: "Missing Information",
        description: "Please fill in the amount and upload a screenshot.",
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

    // Validate against min/max deposit limits from database
    const addr = depositAddresses.find((a: any) => a.asset_symbol === selectedCrypto);
    if (addr?.min_deposit != null && amountNum < parseFloat(addr.min_deposit)) {
      toast({
        title: "Below Minimum",
        description: `Minimum deposit for ${selectedCrypto} is ${addr.min_deposit} ${selectedCrypto}.`,
        variant: "destructive",
      });
      return;
    }
    if (addr?.max_deposit != null && amountNum > parseFloat(addr.max_deposit)) {
      toast({
        title: "Exceeds Maximum",
        description: `Maximum deposit for ${selectedCrypto} is ${addr.max_deposit} ${selectedCrypto}.`,
        variant: "destructive",
      });
      return;
    }

    submitDepositRequestMutation.mutate();
  };

  const getMinimumDeposit = (crypto: string) => {
    // Use database-configured minimum if available
    const addr = depositAddresses.find((a: any) => a.asset_symbol === crypto);
    if (addr?.min_deposit != null) {
      return `${addr.min_deposit} ${crypto}`;
    }
    // Fallback defaults
    switch (crypto) {
      case "BTC":
        return "0.001 BTC";
      case "ETH":
        return "0.01 ETH";
      case "USDT":
        return "10 USDT";
      case "TRX":
        return "100 TRX";
      case "SOL":
        return "0.1 SOL";
      default:
        return "10 USDT";
    }
  };

  const getMaximumDeposit = (crypto: string) => {
    const addr = depositAddresses.find((a: any) => a.asset_symbol === crypto);
    if (addr?.max_deposit != null) {
      return `${addr.max_deposit} ${crypto}`;
    }
    return null; // No maximum configured
  };

  const getNetworkFee = (crypto: string, network: string) => {
    switch (crypto) {
      case "BTC":
        return "0.0001 BTC";
      case "ETH":
        return "0.001 ETH";
      case "USDT":
        return "1 USDT";
      case "TRX":
        return "1 TRX";
      case "SOL":
        return "0.001 SOL";
      default:
        return "1 USDT";
    }
  };

  const getProcessingTime = (crypto: string, network: string) => {
    switch (crypto) {
      case "BTC":
        return "10-30 minutes";
      case "ETH":
        return "5-15 minutes";
      case "USDT":
        return "1-3 minutes";
      case "TRX":
        return "1-3 minutes";
      case "SOL":
        return "1-3 minutes";
      default:
        return "5-15 minutes";
    }
  };

  const steps = [
    { n: 1, label: "Asset" },
    { n: 2, label: "Address" },
    { n: 3, label: "Confirm" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm sm:max-w-md p-0">
        <DialogHeader className="p-4 md:p-6 pb-0 border-b-0">
          <div className="flex items-center justify-between mb-4">
            <DialogTitle className="text-base md:text-lg text-foreground">
              Deposit Funds
            </DialogTitle>
            {step === 2 && (
              <Button
                onClick={refreshAddresses}
                size="sm"
                disabled={loadingAddresses}
                className="h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground text-xs"
              >
                {loadingAddresses ? "Loading..." : "Refresh"}
              </Button>
            )}
          </div>

          {/* Step indicator */}
          <div className="flex items-center pb-4">
            {steps.map((s, i) => (
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
                {i < steps.length - 1 && (
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
              <Select
                value={selectedCrypto}
                onValueChange={(value) => {
                  setSelectedCrypto(value);
                }}
              >
                <SelectTrigger className="bg-muted border-border text-foreground rounded-xl h-11 mt-1.5">
                  <SelectValue placeholder="Select cryptocurrency" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {Array.from(
                    new Set(
                      depositAddresses
                        .map((addr: any) => addr.asset_symbol)
                        .filter(Boolean)
                    )
                  ).map((symbol: any) => (
                    <SelectItem key={symbol} value={symbol} className="text-foreground hover:bg-muted focus:bg-muted">
                      <div className="flex items-center gap-2">
                        <CryptoIcon symbol={symbol} size="xs" />
                        <span>{symbol}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="network-select" className="text-muted-foreground">Network</Label>
              <div className="bg-muted border border-border rounded-xl px-3 py-2.5 text-sm h-11 flex items-center mt-1.5 text-foreground">
                {selectedNetwork}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Network is automatically selected for optimal performance
              </p>
            </div>

            <div className="bg-muted/50 border border-border rounded-xl p-4 text-sm">
              <div className="flex items-center gap-2 text-info mb-3">
                <Info size={16} />
                <span className="font-medium">Network Information</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Minimum Deposit</div>
                  <div className="font-medium tabular-nums text-foreground">{getMinimumDeposit(selectedCrypto)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Maximum Deposit</div>
                  <div className="font-medium tabular-nums text-foreground">{getMaximumDeposit(selectedCrypto) || 'No limit'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Network Fee</div>
                  <div className="font-medium tabular-nums text-foreground">{getNetworkFee(selectedCrypto, selectedNetwork)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Processing Time</div>
                  <div className="font-medium text-foreground">{getProcessingTime(selectedCrypto, selectedNetwork)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Confirmations</div>
                  <div className="font-medium tabular-nums text-foreground">1 required</div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleGenerateAddress}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Get Deposit Address</span>
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="text-center">
              <div className="inline-block p-3 bg-card border border-border rounded-xl">
                <QRCode value={depositAddress} size={180} className="mx-auto" />
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Scan QR code or copy address below
              </p>
            </div>

            <div>
              <Label className="text-muted-foreground">Deposit Address</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <div
                  className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm font-mono break-all cursor-pointer hover:bg-muted/70 transition-colors text-foreground"
                  onClick={handleCopyAddress}
                  title="Click to copy address"
                >
                  {depositAddress}
                </div>
                <Button size="icon" onClick={handleCopyAddress} className="h-9 w-9 shrink-0 rounded-xl bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground">
                  {copied ? <CheckCircle size={16} className="text-success" /> : <Copy size={16} />}
                </Button>
              </div>
            </div>

            <Alert className="bg-warning/10 border-warning/20 p-3.5">
              <AlertTriangle className="text-warning" size={16} />
              <AlertDescription className="text-sm">
                <p className="font-medium text-warning mb-1">Double-check before sending</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Only send {selectedCrypto} to this address</li>
                  <li>• Minimum deposit: <span className="tabular-nums">{getMinimumDeposit(selectedCrypto)}</span></li>
                  {getMaximumDeposit(selectedCrypto) && (
                    <li>• Maximum deposit: <span className="tabular-nums">{getMaximumDeposit(selectedCrypto)}</span></li>
                  )}
                  <li>• Network: {selectedNetwork}</li>
                  <li>• Deposits will appear after 1 confirmation</li>
                  <li className="text-warning/90">• Sending other cryptocurrencies may result in permanent loss of funds</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button onClick={handleClose} className="flex-1 h-11 rounded-xl bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground font-semibold">
                Done
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
              >
                Submit Request
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">Submit Deposit Request</h3>
              <p className="text-sm text-muted-foreground">
                Provide the amount and upload a transaction screenshot for admin approval.
              </p>
            </div>

            <form onSubmit={handleSubmitDepositRequest} className="space-y-4">
              <div>
                <Label htmlFor="amount" className="text-muted-foreground">Deposit Amount ({selectedCrypto})</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.00000001"
                  placeholder="0.00000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder-gray-600 rounded-xl h-11 mt-1.5 tabular-nums"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Enter the exact amount you sent to the deposit address
                </p>
              </div>

              <div>
                <Label htmlFor="screenshot" className="text-muted-foreground">Transaction Screenshot</Label>
                <div className="border-2 border-dashed border-border rounded-xl p-4 mt-1.5">
                  {screenshotPreview ? (
                    <div className="space-y-2">
                      <img
                        src={screenshotPreview}
                        alt="Screenshot preview"
                        className="max-w-full h-32 object-contain rounded-lg"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={removeScreenshot}
                        className="w-full h-9 rounded-xl bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground text-xs"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove Screenshot
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-2">
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
                        size="sm"
                        onClick={() => document.getElementById('screenshot')?.click()}
                        className="h-9 rounded-xl bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground text-xs"
                      >
                        Choose File
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Alert className="bg-info/10 border-info/20 p-3.5">
                <Info className="text-info" size={16} />
                <AlertDescription className="text-sm text-info">
                  <strong>Important:</strong> Please ensure your screenshot clearly shows:
                  <ul className="mt-2 space-y-1 text-info/80">
                    <li>• Transaction amount</li>
                    <li>• Destination address</li>
                    <li>• Transaction hash/ID</li>
                    <li>• Date and time</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Alert className="bg-warning/10 border-warning/20 p-3.5">
                <AlertTriangle className="text-warning" size={16} />
                <AlertDescription className="text-sm">
                  <p className="font-medium text-warning mb-1">Deposit Address:</p>
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {depositAddress}
                  </p>
                </AlertDescription>
              </Alert>

              <div className="flex gap-3 pt-4">
                <Button type="button" onClick={handleClose} disabled={submitDepositRequestMutation.isPending} className="flex-1 h-11 rounded-xl bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground font-semibold">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitDepositRequestMutation.isPending} className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm disabled:opacity-40">
                  {submitDepositRequestMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
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
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
