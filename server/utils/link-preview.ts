import axios from 'axios';
import * as cheerio from 'cheerio';

export interface LinkPreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  url: string;
}

// List of private/internal IP ranges to block
const PRIVATE_IP_PATTERNS = [
  /^127\./,                    // Localhost
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local
  /^0\./,                      // Current network
  /^::1$/,                     // IPv6 localhost
  /^fc00:/i,                   // IPv6 private
  /^fe80:/i,                   // IPv6 link-local
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
];

/**
 * Validates that a URL is safe to fetch (not internal/private)
 */
function isValidUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }

    // Check for blocked hostnames
    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { valid: false, error: 'Internal URLs are not allowed' };
    }

    // Check for private IP addresses
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { valid: false, error: 'Private network URLs are not allowed' };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Resolves a relative URL to an absolute URL
 */
function resolveUrl(baseUrl: string, relativeUrl: string | undefined): string | null {
  if (!relativeUrl) return null;
  
  try {
    // If already absolute, return as-is
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }
    
    // Handle protocol-relative URLs
    if (relativeUrl.startsWith('//')) {
      const base = new URL(baseUrl);
      return `${base.protocol}${relativeUrl}`;
    }
    
    // Resolve relative URLs
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Fetches and extracts metadata from a URL for link previews
 */
export async function fetchLinkPreview(urlString: string): Promise<LinkPreviewData> {
  // Validate URL
  const validation = isValidUrl(urlString);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Normalize URL
  const normalizedUrl = new URL(urlString).href;

  try {
    // Fetch the HTML with timeout and size limit
    const response = await axios.get(normalizedUrl, {
      timeout: 5000,
      maxContentLength: 1024 * 1024, // 1MB max
      maxBodyLength: 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Helper to get meta content
    const getMeta = (selectors: string[]): string | null => {
      for (const selector of selectors) {
        const content = $(selector).attr('content');
        if (content && content.trim()) {
          return content.trim();
        }
      }
      return null;
    };

    // Extract title: og:title → twitter:title → <title>
    const title = getMeta([
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) || $('title').first().text()?.trim() || null;

    // Extract description: og:description → twitter:description → meta description
    const description = getMeta([
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]);

    // Extract image: og:image → twitter:image:src → twitter:image
    const imageRaw = getMeta([
      'meta[property="og:image"]',
      'meta[name="twitter:image:src"]',
      'meta[name="twitter:image"]',
    ]);
    const image = resolveUrl(normalizedUrl, imageRaw || undefined);

    // Extract site name
    const siteName = getMeta(['meta[property="og:site_name"]']);

    // Extract favicon: link rel="icon" or rel="shortcut icon"
    let faviconRaw: string | null = null;
    const iconLink = $('link[rel="icon"], link[rel="shortcut icon"]').first();
    if (iconLink.length) {
      faviconRaw = iconLink.attr('href') || null;
    }
    // Fallback to /favicon.ico
    const favicon = resolveUrl(normalizedUrl, faviconRaw || undefined) || 
      resolveUrl(normalizedUrl, '/favicon.ico');

    // Extract canonical URL: og:url or original
    const canonicalUrl = getMeta(['meta[property="og:url"]']) || normalizedUrl;

    return {
      title,
      description,
      image,
      siteName,
      favicon,
      url: canonicalUrl,
    };
  } catch (error: any) {
    // Handle specific axios errors
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out');
      }
      if (error.response) {
        throw new Error(`Failed to fetch URL: HTTP ${error.response.status}`);
      }
      if (error.code === 'ENOTFOUND') {
        throw new Error('URL not found or DNS resolution failed');
      }
    }
    throw new Error(`Failed to fetch link preview: ${error.message || 'Unknown error'}`);
  }
}
