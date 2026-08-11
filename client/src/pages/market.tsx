import { CryptoList } from "@/components/crypto/crypto-list";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, TrendingUp, BarChart3, Globe, Activity } from "lucide-react";

export default function MarketPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-5">
        <div className="max-w-[1200px] mx-auto">
          <h1 className="text-lg font-bold text-foreground mb-1">Market Rates</h1>
          <p className="text-muted-foreground text-xs">Real-time cryptocurrency prices and market data</p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-5 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder="Search cryptocurrencies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 bg-card border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Market Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCell icon={Activity} label="Total Assets" value="20" />
          <StatCell icon={Globe} label="Market Cap" value="$2.1T" />
          <StatCell icon={BarChart3} label="24h Volume" value="$89B" />
          <StatCell icon={TrendingUp} label="BTC Dominance" value="47.3%" />
        </div>

        {/* Crypto List */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">All Cryptocurrencies</span>
          </div>
          <CryptoList showVolume={true} />
        </div>
      </div>
    </div>
  );
}

interface StatCellProps {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  value: string;
}

function StatCell({ icon: Icon, label, value }: StatCellProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 bg-muted rounded-md flex items-center justify-center">
          <Icon size={12} className="text-muted-foreground" />
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
