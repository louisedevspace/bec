import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCode } from "@/components/ui/qr-code";
import { Copy, CheckCircle, AlertTriangle, Upload, X } from "lucide-react";
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm sm:max-w-md max-h-[95vh] overflow-y-auto bg-[#111] border border-[#1e1e1e] text-white p-0">
        <DialogHeader className="p-4 md:p-6 border-b border-[#1e1e1e]">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base md:text-lg text-white">
              {step === 1 ? "Deposit" : "Deposit Address"}
            </DialogTitle>
            {step === 2 && (
              <Button
                onClick={refreshAddresses}
                size="sm"
                disabled={loadingAddresses}
                className="h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a] hover:text-white text-xs"
              >
                {loadingAddresses ? "Loading..." : "Refresh"}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="p-4 md:p-6">

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="crypto-select" className="text-gray-300">Select Cryptocurrency</Label>
              <Select
                value={selectedCrypto}
                onValueChange={(value) => {
                  setSelectedCrypto(value);
                }}
              >
                <SelectTrigger className="bg-[#161616] border-[#2a2a2a] text-white rounded-xl h-11">
                  <SelectValue placeholder="Select cryptocurrency" />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-[#2a2a2a]">
                  {Array.from(
                    new Set(
                      depositAddresses
                        .map((addr: any) => addr.asset_symbol)
                        .filter(Boolean)
                    )
                  ).map((symbol: any) => (
                    <SelectItem key={symbol} value={symbol} className="text-white hover:bg-[#1a1a1a] focus:bg-[#1a1a1a]">
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
              <Label htmlFor="network-select" className="text-gray-300">Network</Label>
              <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm h-11 flex items-center">
                {selectedNetwork}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Network is automatically selected for optimal performance
              </p>
            </div>

            <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4 text-sm">
              <div className="flex items-center space-x-2 text-blue-400 mb-3">
                <CheckCircle size={16} />
                <span className="font-medium">Network Information</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-500 text-xs mb-1">Minimum Deposit</div>
                  <div className="font-medium">{getMinimumDeposit(selectedCrypto)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Maximum Deposit</div>
                  <div className="font-medium">{getMaximumDeposit(selectedCrypto) || 'No limit'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Network Fee</div>
                  <div className="font-medium">{getNetworkFee(selectedCrypto, selectedNetwork)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Processing Time</div>
                  <div className="font-medium">{getProcessingTime(selectedCrypto, selectedNetwork)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Confirmations</div>
                  <div className="font-medium">1 required</div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleGenerateAddress}
              className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transition-transform duration-150 hover:translate-y-[1px]"
            >
              <Upload className="w-4 h-4" />
              <span>Get Deposit Address</span>
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                ← Back
              </Button>
            </div>

            <div className="text-center">
              <QRCode value={depositAddress} size={200} className="mx-auto mb-4" />
              <p className="text-sm text-gray-500 mb-4">
                Scan QR code or copy address below
              </p>
            </div>

            <div>
              <Label className="text-gray-300">Deposit Address</Label>
              <div className="flex items-center space-x-2 mt-2">
                <div 
                  className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm font-mono break-all cursor-pointer hover:bg-[#161616] transition-colors"
                  onClick={handleCopyAddress}
                  title="Click to copy address"
                >
                  {depositAddress}
                </div>
                <Button size="icon" onClick={handleCopyAddress} className="h-9 w-9 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a] hover:text-white">
                  {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                </Button>
              </div>
            </div>


            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-yellow-500 mt-0.5 flex-shrink-0" size={16} />
                <div className="text-sm">
                  <p className="font-medium text-yellow-400 mb-1">Important Notes:</p>
                  <ul className="space-y-1 text-gray-400">
                    <li>• Only send {selectedCrypto} to this address</li>
                    <li>• Minimum deposit: {getMinimumDeposit(selectedCrypto)}</li>
                    {getMaximumDeposit(selectedCrypto) && (
                      <li>• Maximum deposit: {getMaximumDeposit(selectedCrypto)}</li>
                    )}
                    <li>• Network: {selectedNetwork}</li>
                    <li>• Deposits will appear after 1 confirmation</li>
                    <li>• Sending other cryptocurrencies may result in permanent loss</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleClose} className="flex-1 h-11 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a] hover:text-white font-semibold">
                Done
              </Button>
              <Button 
                onClick={() => setStep(3)} 
                className="flex-1 h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all duration-150 hover:translate-y-[1px]"
              >
                Submit Request
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="flex items-center mb-2">
              <Button variant="ghost" size="sm" onClick={handleBack} className="text-gray-400 hover:text-white hover:bg-[#1a1a1a] rounded-lg -ml-2 h-8 px-2 text-xs">
                ← Back
              </Button>
            </div>

            <div className="text-center">
              <h3 className="text-base font-semibold text-white mb-1">Submit Deposit Request</h3>
              <p className="text-sm text-gray-500">
                Provide the amount and upload a transaction screenshot for admin approval.
              </p>
            </div>

            <form onSubmit={handleSubmitDepositRequest} className="space-y-4">
              <div>
                <Label htmlFor="amount" className="text-gray-300">Deposit Amount ({selectedCrypto})</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.00000001"
                  placeholder="0.00000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-[#161616] border-[#2a2a2a] text-white placeholder-gray-600 rounded-xl h-11"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the exact amount you sent to the deposit address
                </p>
              </div>

              <div>
                <Label htmlFor="screenshot" className="text-gray-300">Transaction Screenshot</Label>
                <div className="border-2 border-dashed border-[#2a2a2a] rounded-xl p-4 mt-2">
                  {screenshotPreview ? (
                    <div className="space-y-2">
                      <img 
                        src={screenshotPreview} 
                        alt="Screenshot preview" 
                        className="max-w-full h-32 object-contain rounded"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={removeScreenshot}
                        className="w-full h-9 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a] hover:text-white text-xs"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove Screenshot
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-400 mb-2">
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
                        className="h-9 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a] hover:text-white text-xs"
                      >
                        Choose File
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3.5">
                <p className="text-sm text-blue-400">
                  <strong>Important:</strong> Please ensure your screenshot clearly shows:
                </p>
                <ul className="text-sm text-blue-400/70 mt-2 space-y-1">
                  <li>• Transaction amount</li>
                  <li>• Destination address</li>
                  <li>• Transaction hash/ID</li>
                  <li>• Date and time</li>
                </ul>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="text-yellow-500 mt-0.5 flex-shrink-0" size={16} />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-400 mb-1">Deposit Address:</p>
                    <p className="text-gray-500 font-mono text-xs break-all">
                      {depositAddress}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" onClick={handleClose} disabled={submitDepositRequestMutation.isPending} className="flex-1 h-11 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a] hover:text-white font-semibold">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitDepositRequestMutation.isPending} className="flex-1 h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all duration-150 hover:translate-y-[1px] disabled:opacity-40 disabled:shadow-none">
                  {submitDepositRequestMutation.isPending ? (
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
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
