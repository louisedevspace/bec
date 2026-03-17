import { useState, useEffect } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface LinkPreviewProps {
  url: string;
  className?: string;
}

interface LinkPreviewData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  url: string;
}

// Module-level cache to avoid re-fetching the same URL
const previewCache = new Map<string, LinkPreviewData | null>();

/**
 * Extracts URLs from text content using a regex.
 * Matches http/https URLs.
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = text.match(urlRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

export function LinkPreview({ url, className = '' }: LinkPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<LinkPreviewData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchPreview() {
      // Check cache first
      if (previewCache.has(url)) {
        const cached = previewCache.get(url);
        setPreviewData(cached ?? null);
        setLoading(false);
        setError(!cached);
        return;
      }

      setLoading(true);
      setError(false);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to fetch preview');
        }

        const json = await res.json();

        if (cancelled) return;

        if (json.success && json.data) {
          previewCache.set(url, json.data);
          setPreviewData(json.data);
        } else {
          previewCache.set(url, null);
          setError(true);
        }
      } catch (err) {
        if (cancelled) return;
        previewCache.set(url, null);
        setError(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPreview();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Extract domain from URL for display
  const getDomain = (urlString: string): string => {
    try {
      const parsed = new URL(urlString);
      return parsed.hostname.replace('www.', '');
    } catch {
      return urlString;
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div
        className={`bg-[#111] border border-[#1e1e1e] rounded-xl p-3 flex gap-3 ${className}`}
      >
        <div className="w-20 h-20 rounded-lg bg-[#1e1e1e] animate-pulse flex-shrink-0" />
        <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
          <div className="h-4 bg-[#1e1e1e] rounded animate-pulse w-3/4" />
          <div className="h-3 bg-[#1e1e1e] rounded animate-pulse w-full" />
          <div className="h-3 bg-[#1e1e1e] rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  // Fallback - no metadata or error
  if (error || !previewData || (!previewData.title && !previewData.description)) {
    return (
      <div
        onClick={handleClick}
        className={`bg-[#111] border border-[#1e1e1e] hover:border-[#2a2a2a] rounded-xl p-3 flex items-center gap-3 cursor-pointer transition-colors ${className}`}
      >
        <Globe className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <span className="text-blue-400 text-sm truncate flex-1 min-w-0">
          {url}
        </span>
        <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0" />
      </div>
    );
  }

  // Full preview card
  const imageUrl = previewData.image || previewData.favicon;
  const domain = getDomain(previewData.url || url);

  return (
    <div
      onClick={handleClick}
      className={`bg-[#111] border border-[#1e1e1e] hover:border-[#2a2a2a] rounded-xl p-3 flex gap-3 cursor-pointer transition-colors relative ${className}`}
    >
      {/* Image thumbnail */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
          onError={(e) => {
            // Hide image on error
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-20 h-20 rounded-lg bg-[#1e1e1e] flex items-center justify-center flex-shrink-0">
          <Globe className="w-8 h-8 text-gray-500" />
        </div>
      )}

      {/* Text content */}
      <div className="flex-1 flex flex-col justify-center min-w-0 pr-6">
        {previewData.title && (
          <h4 className="text-white text-sm font-semibold truncate">
            {previewData.title}
          </h4>
        )}
        {previewData.description && (
          <p className="text-gray-400 text-xs line-clamp-2 mt-1">
            {previewData.description}
          </p>
        )}
        <span className="text-blue-400 text-[10px] mt-1.5">
          {domain}
        </span>
      </div>

      {/* External link icon */}
      <ExternalLink className="w-4 h-4 text-gray-500 absolute top-3 right-3" />
    </div>
  );
}

export default LinkPreview;
