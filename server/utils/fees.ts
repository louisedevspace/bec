import { getServerConfig } from "../config";
import { supabaseAdmin } from "../routes/middleware";

export type FeeCategory = "spot" | "withdrawal" | "deposit";

export type FeeBreakdown = {
  rate: number;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
};

function roundFee(value: number): number {
  return Number(value.toFixed(8));
}

export function getConfiguredFeeRate(type: Exclude<FeeCategory, "spot">): number {
  const config = getServerConfig();
  if (type === "deposit") {
    return config.depositFeeRate;
  }

  return config.withdrawalFeeRate;
}

export function calculateFeeBreakdown(amount: number, rate: number): FeeBreakdown {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const feeAmount = roundFee(safeAmount * safeRate);
  const netAmount = roundFee(Math.max(0, safeAmount - feeAmount));

  return {
    rate: safeRate,
    grossAmount: roundFee(safeAmount),
    feeAmount,
    netAmount,
  };
}

export async function recordPlatformFee(params: {
  userId: string;
  type: FeeCategory;
  symbol: string;
  feeAmount: number;
  feeSymbol: string;
  feeRate: number;
  tradeId?: number | null;
}): Promise<void> {
  if (!Number.isFinite(params.feeAmount) || params.feeAmount <= 0) {
    return;
  }

  try {
    await supabaseAdmin.from("platform_fees").insert({
      user_id: params.userId,
      trade_id: params.tradeId ?? null,
      trade_type: params.type,
      symbol: params.symbol,
      fee_amount: params.feeAmount.toFixed(8),
      fee_symbol: params.feeSymbol,
      fee_rate: params.feeRate.toString(),
    });
  } catch (error) {
    console.error("Failed to log platform fee:", error);
  }
}