type ClientMetricPayload = {
  event: string;
  path: string;
  durationMs: number;
};

function postMetric(payload: ClientMetricPayload) {
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/metrics/client", blob);
    } else {
      fetch("/api/metrics/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {
  }
}

export function trackClientMetric(event: string, durationMs: number) {
  if (typeof window === "undefined") {
    return;
  }

  const path = window.location.pathname;

  postMetric({
    event,
    path,
    durationMs,
  });
}

