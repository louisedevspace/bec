import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { trackClientMetric } from "./perf";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const start =
    typeof performance !== "undefined" ? performance.now() : undefined;
  const {
    data: { session },
  } = await import("./supabaseClient").then((m) =>
    m.supabase.auth.getSession(),
  );
  const token = session?.access_token;

  const headers: Record<string, string> = {};
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (start !== undefined) {
    const end = performance.now();
    trackClientMetric("api_request", end - start);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const start =
      typeof performance !== "undefined" ? performance.now() : undefined;
    const {
      data: { session },
    } = await import("./supabaseClient").then((m) =>
      m.supabase.auth.getSession(),
    );
    const token = session?.access_token;
    
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    if (start !== undefined) {
      const end = performance.now();
      trackClientMetric("api_query", end - start);
    }
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      // Optimize cache times based on data type
      staleTime: 5 * 60 * 1000, // 5 minutes default
      gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
      retry: 1, // Retry once on failure
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Network mode optimizations
      networkMode: 'online',
      // Enable structural sharing for better performance
      structuralSharing: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
      networkMode: 'online',
    },
  },
});

// Custom query options for different data types
export const pricesQueryOptions = {
  staleTime: 30 * 1000, // 30 seconds for crypto prices
  gcTime: 2 * 60 * 1000, // 2 minutes cache
  refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
};

export const portfolioQueryOptions = {
  staleTime: 1 * 60 * 1000, // 1 minute
  gcTime: 5 * 60 * 1000, // 5 minutes cache
};

export const userDataQueryOptions = {
  staleTime: 10 * 60 * 1000, // 10 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes cache
};

export const transactionQueryOptions = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes cache
};
