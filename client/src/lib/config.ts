// Centralized configuration for app metadata, API and WebSocket URLs
// Handles development and production environments with validation

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production' || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');

// Get the current protocol and host (host includes port if present)
const currentProtocol = window.location.protocol;
const currentHost = window.location.host;

// App metadata and URLs (Vite envs)
const appName = import.meta.env.VITE_APP_NAME || 'Becxus Exchange';
const publicUrl = (import.meta.env.VITE_PUBLIC_URL || `${currentProtocol}//${currentHost}`).replace(/\/+$/, '');
const forceHttps = (import.meta.env.VITE_FORCE_HTTPS || 'false').toLowerCase() === 'true';
const authRedirectUrl = `${publicUrl}/login`;

// Determine the API and WebSocket base URLs (env overrides supported)
let apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL || `${currentProtocol}//${currentHost}`;
let wsBaseUrl: string = import.meta.env.VITE_WS_BASE_URL || (currentProtocol === 'https:' ? `wss://${currentHost}` : `ws://${currentHost}`);

// Basic validation
function validateConfig() {
  const required = [
    ['appName', appName],
    ['apiBaseUrl', apiBaseUrl],
    ['wsBaseUrl', wsBaseUrl],
    ['publicUrl', publicUrl],
    ['authRedirectUrl', authRedirectUrl],
  ] as const;
  const missing = required.filter(([, v]) => !v || String(v).includes('undefined')).map(([k]) => k);
  if (missing.length && isDevelopment) {
    console.error('Missing/invalid configuration values:', missing);
  }
}
validateConfig();

// Export configuration
export const config = {
  appName,
  publicUrl,
  authRedirectUrl,
  forceHttps,
  apiBaseUrl,
  wsBaseUrl,
  isDevelopment,
  isProduction,
  currentHost,
  currentProtocol,
};

// Helper function to build API URLs
export const buildApiUrl = (endpoint: string): string => {
  return `${apiBaseUrl}/api${endpoint}`;
};

// Helper function to build WebSocket URLs
export const buildWsUrl = (endpoint: string): string => {
  const url = `${wsBaseUrl}${endpoint}`;
  if (url.includes('undefined')) {
    console.error('buildWsUrl: undefined detected in URL:', { wsBaseUrl, endpoint, url });
  }
  return url;
};

if (import.meta.env.DEV) {
  console.log('🔧 Environment Configuration:', {
    environment: isDevelopment ? 'development' : 'production',
    appName,
    publicUrl,
    authRedirectUrl,
    apiBaseUrl,
    wsBaseUrl,
    currentHost,
    currentProtocol,
    importMetaEnv: {
      DEV: import.meta.env.DEV,
      PROD: import.meta.env.PROD,
      MODE: import.meta.env.MODE,
      VITE_NODE_ENV: import.meta.env.VITE_NODE_ENV,
      VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
      VITE_PUBLIC_URL: import.meta.env.VITE_PUBLIC_URL,
      VITE_AUTH_REDIRECT_URL: import.meta.env.VITE_AUTH_REDIRECT_URL,
      VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
      VITE_WS_BASE_URL: import.meta.env.VITE_WS_BASE_URL,
      VITE_FORCE_HTTPS: import.meta.env.VITE_FORCE_HTTPS,
    }
  });
}
