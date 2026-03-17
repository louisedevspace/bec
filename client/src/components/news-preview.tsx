import { useMemo, useEffect } from 'react';
import { X, Megaphone, Bell, AlertTriangle, Info } from 'lucide-react';
import { getImageDisplayUrl } from '@/lib/image';
import { LinkPreview, extractUrls, prefetchUrls } from '@/components/ui/link-preview';

interface NewsPreviewProps {
  title: string;
  content: string;
  type: 'announcement' | 'update' | 'maintenance' | 'feature';
  image_url?: string;
  background_color: string;
  text_color: string;
  button_text: string;
  button_color: string;
}

export default function NewsPreview({
  title,
  content,
  type,
  image_url,
  background_color,
  text_color,
  button_text,
  button_color
}: NewsPreviewProps) {
  // Extract URLs from content for link previews (max 3)
  const contentUrls = useMemo(() => {
    return extractUrls(content || '').slice(0, 3);
  }, [content]);

  // Eagerly prefetch link preview data when URLs are detected
  useEffect(() => {
    if (contentUrls.length > 0) {
      prefetchUrls(contentUrls);
    }
  }, [contentUrls]);

  const getIcon = () => {
    switch (type) {
      case 'announcement':
        return <Megaphone className="w-8 h-8" />;
      case 'update':
        return <Bell className="w-8 h-8" />;
      case 'maintenance':
        return <AlertTriangle className="w-8 h-8" />;
      case 'feature':
        return <Info className="w-8 h-8" />;
      default:
        return <Megaphone className="w-8 h-8" />;
    }
  };

  return (
    <div className="relative">
      <div 
        className="w-full max-w-md mx-auto border border-[#1e1e1e] rounded-lg shadow-2xl overflow-hidden"
        style={{ 
          backgroundColor: background_color || '#111111',
          color: text_color || '#ffffff'
        }}
      >
        {/* Close button */}
        <button
          className="absolute right-2 top-2 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
          style={{ color: text_color || '#ffffff' }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="text-center space-y-4 p-6">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div 
              className="p-3 rounded-full"
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: text_color || '#ffffff' 
              }}
            >
              {getIcon()}
            </div>
          </div>

          {/* Image */}
          {image_url && (
            <div className="mb-4">
              <img
                src={getImageDisplayUrl(image_url)}
                alt={title}
                className="w-full h-48 object-cover rounded-lg border border-[#1e1e1e]"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Title */}
          <h2 className="text-xl font-bold mb-2" style={{ color: text_color || '#ffffff' }}>
            {title || 'News Title Preview'}
          </h2>

          {/* Content */}
          <p className="text-sm leading-relaxed mb-6" style={{ color: text_color || '#ffffff' }}>
            {content || 'This is a preview of how your news will appear to users. The content will be displayed here...'}
          </p>

          {/* Link previews for URLs in content */}
          {contentUrls.length > 0 && (
            <div className="space-y-2 mb-6">
              {contentUrls.map((url) => (
                <LinkPreview key={url} url={url} />
              ))}
            </div>
          )}

          {/* Action Button */}
          <button
            className="w-full font-semibold transition-all hover:scale-105 border border-[#1e1e1e] py-2 px-4 rounded"
            style={{ 
              backgroundColor: button_color || '#3b82f6',
              color: '#ffffff',
              border: 'none'
            }}
          >
            {button_text || 'Got it'}
          </button>
        </div>
      </div>
      
      <div className="text-center mt-4 text-sm text-gray-400">
        Preview - This is how users will see your news
      </div>
    </div>
  );
}
