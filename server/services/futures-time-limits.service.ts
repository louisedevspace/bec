import { redisGetJSON, redisSetJSON } from "../utils/redis";

// ─── Futures Time Limits Types ──────────────────────────────────────────────

export interface FuturesTimeLimit {
  duration: number;      // in seconds (e.g., 60, 120, 180...)
  minAmount: number;     // minimum trade amount in USDT
  isActive: boolean;     // whether this duration is available for trading
}

export interface FuturesTimeLimitsConfig {
  limits: FuturesTimeLimit[];
  defaultMinAmount: number;  // fallback for durations not in the list
  enabled: boolean;          // master toggle for the feature
}

// ─── Redis Key ──────────────────────────────────────────────────────────────

const REDIS_KEY = "config:futures-time-limits";

// ─── Default Configuration ──────────────────────────────────────────────────

const DEFAULT_CONFIG: FuturesTimeLimitsConfig = {
  limits: [
    { duration: 60, minAmount: 10, isActive: true },
    { duration: 120, minAmount: 25, isActive: true },
    { duration: 180, minAmount: 50, isActive: true },
    { duration: 240, minAmount: 75, isActive: true },
    { duration: 360, minAmount: 100, isActive: true },
    { duration: 480, minAmount: 150, isActive: true },
    { duration: 600, minAmount: 200, isActive: true },
  ],
  defaultMinAmount: 50,
  enabled: true,
};

// ─── Futures Time Limits Service ────────────────────────────────────────────

class FuturesTimeLimitsService {
  private static instance: FuturesTimeLimitsService;
  private cachedConfig: FuturesTimeLimitsConfig | null = null;

  private constructor() {}

  static getInstance(): FuturesTimeLimitsService {
    if (!FuturesTimeLimitsService.instance) {
      FuturesTimeLimitsService.instance = new FuturesTimeLimitsService();
    }
    return FuturesTimeLimitsService.instance;
  }

  // ─── Get Config ─────────────────────────────────────────────────────────

  /**
   * Get current config from Redis, fallback to in-memory, then defaults
   */
  getConfig(): FuturesTimeLimitsConfig {
    // Return cached if available
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Async version that attempts to load from Redis first
   */
  async getConfigAsync(): Promise<FuturesTimeLimitsConfig> {
    // Try Redis first
    try {
      const cached = await redisGetJSON<FuturesTimeLimitsConfig>(REDIS_KEY);
      if (cached) {
        this.cachedConfig = cached;
        return cached;
      }
    } catch (err) {
      // Redis error, fall through to memory/defaults
      console.log("[FuturesTimeLimits] Redis error, using fallback");
    }

    // Return cached or defaults
    return this.cachedConfig || { ...DEFAULT_CONFIG };
  }

  // ─── Update Config ──────────────────────────────────────────────────────

  /**
   * Save config to Redis + in-memory
   */
  async updateConfig(config: FuturesTimeLimitsConfig): Promise<FuturesTimeLimitsConfig> {
    // Save to Redis (no TTL - persistent until changed)
    try {
      await redisSetJSON(REDIS_KEY, config);
      console.log("[FuturesTimeLimits] Config saved to Redis");
    } catch (err) {
      console.log("[FuturesTimeLimits] Redis unavailable, using in-memory only");
    }

    // Always update in-memory cache
    this.cachedConfig = config;
    return config;
  }

  // ─── Get Min Amount for Duration ────────────────────────────────────────

  /**
   * Get the minimum amount for a specific duration.
   * If the feature is disabled, return defaultMinAmount.
   * If duration not in list, return defaultMinAmount.
   */
  getMinAmountForDuration(duration: number): number {
    const config = this.getConfig();

    // If feature is disabled, return default
    if (!config.enabled) {
      return config.defaultMinAmount;
    }

    // Find the limit for this duration
    const limit = config.limits.find((l) => l.duration === duration);

    // If not found or not active, return default
    if (!limit) {
      return config.defaultMinAmount;
    }

    return limit.minAmount;
  }

  // ─── Check if Duration is Active ────────────────────────────────────────

  /**
   * Check if a duration is available for trading
   */
  isDurationActive(duration: number): boolean {
    const config = this.getConfig();

    // If feature is disabled, all durations are active (no restrictions)
    if (!config.enabled) {
      return true;
    }

    // Find the limit for this duration
    const limit = config.limits.find((l) => l.duration === duration);

    // If not in list, it's allowed (use default min amount)
    if (!limit) {
      return true;
    }

    return limit.isActive;
  }

  // ─── Get Active Durations ───────────────────────────────────────────────

  /**
   * Get list of active durations
   */
  getActiveDurations(): number[] {
    const config = this.getConfig();

    // If feature is disabled, return all standard durations
    if (!config.enabled) {
      return [60, 120, 180, 240, 360, 480, 600];
    }

    return config.limits
      .filter((l) => l.isActive)
      .map((l) => l.duration);
  }

  // ─── Initialize from Redis ──────────────────────────────────────────────

  /**
   * Load config from Redis on startup (call this during server init)
   */
  async initialize(): Promise<void> {
    try {
      const config = await redisGetJSON<FuturesTimeLimitsConfig>(REDIS_KEY);
      if (config) {
        this.cachedConfig = config;
        console.log("[FuturesTimeLimits] Loaded config from Redis");
      } else {
        console.log("[FuturesTimeLimits] No saved config, using defaults");
      }
    } catch (err) {
      console.log("[FuturesTimeLimits] Failed to load from Redis, using defaults");
    }
  }
}

// Export singleton instance
export const futuresTimeLimitsService = FuturesTimeLimitsService.getInstance();
