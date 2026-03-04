import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useUserDataSync } from "@/hooks/use-data-sync";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cryptoApi } from "@/services/crypto-api";
import { FileText, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { Transaction } from "@/types/crypto";
import { formatCryptoNumber } from "@/utils/format-utils";

interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TransactionHistoryModal({ isOpen, onClose }: TransactionHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  // Use the comprehensive data sync hook
  useUserDataSync(userId || '', {
    enabled: !!userId && isOpen
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/transactions", userId, activeTab],
    queryFn: () => userId ? cryptoApi.getTransactions(userId, activeTab) : Promise.resolve([]),
    enabled: !!userId && isOpen,
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 text-green-500";
      case "pending":
        return "bg-yellow-500/20 text-yellow-500";
      case "failed":
        return "bg-red-500/20 text-red-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getStatusIcon = (type: string) => {
    return type === "deposit" ? (
      <ArrowDownToLine className="text-green-500" size={14} />
    ) : (
      <ArrowUpFromLine className="text-red-500" size={14} />
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatAmount = (amount: string, symbol: string) => {
    const num = parseFloat(amount);
    return `${formatCryptoNumber(num)} ${symbol}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction History</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex space-x-1 bg-muted rounded-lg p-1 mb-6">
          <Button
            variant={activeTab === "deposit" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("deposit")}
            className="flex-1"
          >
            Deposit record
          </Button>
          <Button
            variant={activeTab === "withdraw" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("withdraw")}
            className="flex-1"
          >
            Withdrawal record
          </Button>
        </div>

        {/* Transaction List */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <div className="text-right">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
            ))
          ) : transactions && transactions.length > 0 ? (
            transactions.map((transaction: Transaction) => (
              <div key={transaction.id} className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                      {getStatusIcon(transaction.type)}
                    </div>
                    <div>
                      <div className="font-medium flex items-center space-x-2">
                        <span>{transaction.symbol}</span>
                        <span className="text-muted-foreground">
                          {transaction.type === "deposit" ? "Deposit" : "Withdrawal"}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(transaction.createdAt)}
                      </div>
                      {transaction.txHash && (
                        <div className="text-xs text-muted-foreground font-mono">
                          TxHash: {transaction.txHash.slice(0, 8)}...{transaction.txHash.slice(-8)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="font-semibold">
                      {transaction.type === "deposit" ? "+" : "-"}
                      {formatAmount(transaction.amount, transaction.symbol)}
                    </div>
                    <div className="mt-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                        {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                      </span>
                    </div>
                    {transaction.address && (
                      <div className="text-xs text-muted-foreground font-mono mt-1">
                        {transaction.address.slice(0, 6)}...{transaction.address.slice(-6)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
                <FileText className="text-muted-foreground" size={24} />
              </div>
              <h3 className="text-lg font-medium mb-2">No data</h3>
              <p className="text-muted-foreground">
                Your {activeTab} history will appear here
              </p>
            </div>
          )}
        </div>

        {/* Load More Button */}
        {transactions && transactions.length > 0 && (
          <div className="text-center mt-6">
            <Button variant="outline">
              Load More
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
