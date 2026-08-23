import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Landmark, Copy, CheckCircle, Loader2, Building2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface BankDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MerchantAccount {
  id: number;
  country: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  routing_info: string | null;
  instructions: string | null;
}

export function BankDepositModal({ isOpen, onClose }: BankDepositModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { copied, copyToClipboard } = useCopyToClipboard();

  const [country, setCountry] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [bankName, setBankName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data } = useQuery<{ accounts: MerchantAccount[] }>({
    queryKey: ["/api/bank-deposits/merchant-accounts"],
    enabled: isOpen,
  });
  const accounts = data?.accounts || [];

  const countries = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.country))),
    [accounts]
  );
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.country === country) || null,
    [accounts, country]
  );

  const reset = () => {
    setCountry("");
    setAmountUsd("");
    setBankName("");
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const amountNum = parseFloat(amountUsd);
    if (!country || !selectedAccount) {
      toast({ title: "Select a country", variant: "destructive" });
      return;
    }
    if (!bankName.trim()) {
      toast({ title: "Enter your bank name", variant: "destructive" });
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/bank-deposits/submit", {
        country,
        amountUsd: amountNum,
        bankName: bankName.trim(),
        merchantAccountId: selectedAccount.id,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit request");
      }
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/bank-deposits/my-requests"] });
    } catch (error: any) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Bank Transfer Deposit
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <h3 className="font-semibold text-foreground">Request submitted</h3>
            <p className="text-sm text-muted-foreground">
              We've received your bank deposit request. Our team will review it and credit your balance once your transfer is confirmed.
            </p>
            <Button onClick={handleClose} className="mt-2 w-full">Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="bank-deposit-country" className="text-muted-foreground">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="bank-deposit-country">
                  <SelectValue placeholder={countries.length ? "Select your country" : "No countries available yet"} />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAccount && (
              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Building2 className="h-4 w-4 text-primary" />
                  Deposit to this account
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="text-foreground font-medium">{selectedAccount.bank_name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Account Name</span>
                    <span className="text-foreground font-medium">{selectedAccount.account_name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Account Number</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedAccount.account_number)}
                      className="flex items-center gap-1.5 text-foreground font-medium tabular-nums hover:text-primary transition-colors"
                    >
                      {selectedAccount.account_number}
                      {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {selectedAccount.routing_info && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">IBAN / SWIFT</span>
                      <span className="text-foreground font-medium">{selectedAccount.routing_info}</span>
                    </div>
                  )}
                </div>
                {selectedAccount.instructions && (
                  <p className="text-xs text-muted-foreground pt-1 border-t border-border">{selectedAccount.instructions}</p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="bank-deposit-amount" className="text-muted-foreground">Amount (USD)</Label>
              <Input
                id="bank-deposit-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 500"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="bank-deposit-bank-name" className="text-muted-foreground">Your Bank Name</Label>
              <Input
                id="bank-deposit-bank-name"
                placeholder="The bank you're sending from"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                After you send the transfer, submit this form. Your balance is credited once an admin confirms the funds arrived — this can take some time for bank transfers.
              </AlertDescription>
            </Alert>

            <Button onClick={handleSubmit} disabled={submitting || !selectedAccount} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit Deposit Request
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
