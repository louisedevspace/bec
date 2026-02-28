type ApiMetricKey = string;

type ApiMetricRecord = {
  path: string;
  method: string;
  count: number;
  errorCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  lastStatusCode: number;
  durations: number[];
};

type ClientMetricRecord = {
  event: string;
  path: string;
  durationMs: number;
  timestamp: number;
};

const apiMetrics = new Map<ApiMetricKey, ApiMetricRecord>();
const clientMetrics: ClientMetricRecord[] = [];

const MAX_CLIENT_METRICS = 500;
const MAX_API_DURATIONS = 100;

export function recordApiMetric(options: {
  path: string;
  method: string;
  statusCode: number;
  durationMs: number;
}): void {
  const key = `${options.method} ${options.path}`;
  const existing = apiMetrics.get(key);

  if (!existing) {
    apiMetrics.set(key, {
      path: options.path,
      method: options.method,
      count: 1,
      errorCount: options.statusCode >= 500 ? 1 : 0,
      totalDurationMs: options.durationMs,
      maxDurationMs: options.durationMs,
      lastDurationMs: options.durationMs,
      lastStatusCode: options.statusCode,
      durations: [options.durationMs],
    });
    return;
  }

  existing.count += 1;
  if (options.statusCode >= 500) {
    existing.errorCount += 1;
  }
  existing.totalDurationMs += options.durationMs;
  existing.maxDurationMs = Math.max(existing.maxDurationMs, options.durationMs);
  existing.lastDurationMs = options.durationMs;
  existing.lastStatusCode = options.statusCode;
  existing.durations.push(options.durationMs);
  if (existing.durations.length > MAX_API_DURATIONS) {
    existing.durations.splice(0, existing.durations.length - MAX_API_DURATIONS);
  }
}

export function getApiMetricsSummary() {
  const entries = Array.from(apiMetrics.values()).map((metric) => {
    const avgDurationMs =
      metric.count > 0 ? metric.totalDurationMs / metric.count : 0;
    const sortedDurations = [...metric.durations].sort((a, b) => a - b);
    const p95Index =
      sortedDurations.length > 0
        ? Math.floor(sortedDurations.length * 0.95) - 1
        : 0;
    const p95DurationMs =
      sortedDurations.length > 0
        ? sortedDurations[Math.max(0, p95Index)]
        : 0;

    return {
      path: metric.path,
      method: metric.method,
      count: metric.count,
      errorCount: metric.errorCount,
      avgDurationMs,
      maxDurationMs: metric.maxDurationMs,
      p95DurationMs,
      lastDurationMs: metric.lastDurationMs,
      lastStatusCode: metric.lastStatusCode,
    };
  });

  entries.sort((a, b) => b.avgDurationMs - a.avgDurationMs);

  return {
    generatedAt: Date.now(),
    routes: entries,
  };
}

export function recordClientMetric(metric: {
  event: string;
  path: string;
  durationMs: number;
}): void {
  clientMetrics.push({
    event: metric.event,
    path: metric.path,
    durationMs: metric.durationMs,
    timestamp: Date.now(),
  });

  if (clientMetrics.length > MAX_CLIENT_METRICS) {
    clientMetrics.splice(0, clientMetrics.length - MAX_CLIENT_METRICS);
  }
}

export function getClientMetricsSummary() {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const recent = clientMetrics.filter(
    (m) => now - m.timestamp <= windowMs,
  );

  const byEvent = new Map<string, { count: number; avgDurationMs: number }>();

  for (const metric of recent) {
    const existing = byEvent.get(metric.event) || {
      count: 0,
      avgDurationMs: 0,
    };
    const newCount = existing.count + 1;
    const newAvg =
      (existing.avgDurationMs * existing.count + metric.durationMs) / newCount;
    byEvent.set(metric.event, {
      count: newCount,
      avgDurationMs: newAvg,
    });
  }

  const events = Array.from(byEvent.entries()).map(
    ([event, value]) => ({
      event,
      count: value.count,
      avgDurationMs: value.avgDurationMs,
    }),
  );

  events.sort((a, b) => b.avgDurationMs - a.avgDurationMs);

  return {
    generatedAt: now,
    windowMs,
    events,
  };
}

