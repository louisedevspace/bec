import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Megaphone, Bell, AlertTriangle, Info } from 'lucide-react';
import { getImageDisplayUrl } from '@/lib/image';
import { supabase } from '@/lib/supabaseClient';
import { LinkPreview, extractUrls } from '@/components/ui/link-preview';

interface NewsItem {
  id: number;
  title: string;
  content: string;
  type: 'announcement' | 'update' | 'maintenance' | 'feature';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  image_url?: string;
  background_color: string;
  text_color: string;
  button_text: string;
  button_color: string;
  popup_delay: number;
  auto_close: number;
  show_popup: boolean;
  target_users?: 'all' | 'verified' | 'unverified' | 'traders' | 'inactive';
}

interface NewsPopupProps {
  news: NewsItem;
  onClose: () => void;
  onMarkSeen: (newsId: number) => void;
}

export default function NewsPopup({ news, onClose, onMarkSeen }: NewsPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [autoCloseTimer, setAutoCloseTimer] = useState<NodeJS.Timeout | null>(null);

  // Extract URLs from news content for link previews (max 3)
  const contentUrls = useMemo(() => {
    return extractUrls(news.content || '').slice(0, 3);
  }, [news.content]);

  useEffect(() => {
    if (!news.show_popup) {
      onClose();
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(true);
      
      if (news.auto_close > 0) {
        const closeTimer = setTimeout(() => {
          handleClose();
        }, news.auto_close * 1000);
        setAutoCloseTimer(closeTimer);
      }
    }, news.popup_delay);

    return () => {
      clearTimeout(timer);
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
      }
    };
  }, [news]);

  const handleClose = () => {
    setIsVisible(false);
    onMarkSeen(news.id);
    setTimeout(onClose, 300);
  };

  const getPriorityClasses = () => {
    switch (news.priority) {
      case 'urgent':
        return 'bg-red-500/15 text-red-300 border border-red-500/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-300 border border-orange-500/30';
      case 'normal':
        return 'bg-blue-500/15 text-blue-300 border border-blue-500/30';
      case 'low':
        return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      default:
        return 'bg-slate-500/10 text-slate-200 border border-slate-500/20';
    }
  };

  const getIcon = () => {
    switch (news.type) {
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

  if (!isVisible) return null;

  return (
    <Dialog open={isVisible} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent 
        className="max-w-md mx-auto border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_0_60px_rgba(15,23,42,0.8)] rounded-2xl p-0 overflow-hidden backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        style={{ 
          backgroundColor: news.background_color || '#111111',
          color: news.text_color || '#ffffff'
        }}
        hideCloseButton
      >
        <div className="relative">
          <DialogTitle className="sr-only">{news.title}</DialogTitle>
          <DialogDescription className="sr-only">{news.content}</DialogDescription>

          <button
            onClick={handleClose}
            className="absolute right-2 top-2 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
            style={{ color: news.text_color || '#ffffff' }}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-6 pt-6 pb-5 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getPriorityClasses()}`}>
                {getIcon()}
                <span className="uppercase tracking-wide">
                  {news.type}
                </span>
              </div>
            </div>

            <div className="flex justify-center">
              <div 
                className="p-3 rounded-full shadow-inner"
                style={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: news.text_color || '#ffffff' 
                }}
              >
                {getIcon()}
              </div>
            </div>

            {news.image_url && (
              <div className="mb-4">
                <img
                  src={getImageDisplayUrl(news.image_url)}
                  alt={news.title}
                  className="w-full h-52 object-cover rounded-xl border border-white/10 shadow-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            <h2 className="text-xl font-semibold tracking-tight leading-tight" style={{ color: news.text_color || '#ffffff' }}>
              {news.title}
            </h2>

            <p className="text-sm leading-relaxed mt-2 text-white/80" style={{ color: news.text_color || '#ffffff' }}>
              {news.content}
            </p>

            {/* Link previews for URLs in content */}
            {contentUrls.length > 0 && (
              <div className="space-y-2 mt-3">
                {contentUrls.map((url) => (
                  <LinkPreview key={url} url={url} />
                ))}
              </div>
            )}

            <div className="h-px bg-white/10 my-4" />

            <Button
              onClick={handleClose}
              className="w-full h-11 font-semibold transition-all hover:scale-[1.02] active:scale-[0.99] rounded-xl shadow-lg shadow-blue-500/30"
              style={{ 
                backgroundColor: news.button_color || '#3b82f6',
                color: '#ffffff',
                border: 'none'
              }}
            >
              {news.button_text}
            </Button>

            {news.auto_close > 0 && (
              <p className="text-xs opacity-70 mt-3 text-center" style={{ color: news.text_color || '#ffffff' }}>
                This message will automatically close in {news.auto_close} seconds
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// News Popup Manager Component
interface NewsPopupManagerProps {
  userId: string;
  userRole?: string;
  isVerified?: boolean;
}

// LocalStorage key for tracking seen news
const SEEN_NEWS_STORAGE_KEY = 'becxus_seen_news';
// Polling interval for checking new news (30 seconds)
const NEWS_POLL_INTERVAL = 30000;

function getLocalSeenNewsArray(): number[] {
  try {
    const stored = localStorage.getItem(SEEN_NEWS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

function saveLocalSeenNewsArray(ids: number[]) {
  try {
    localStorage.setItem(SEEN_NEWS_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

export function NewsPopupManager({ userId, userRole, isVerified }: NewsPopupManagerProps) {
  const [activeNews, setActiveNews] = useState<NewsItem[]>([]);
  const [currentNews, setCurrentNews] = useState<NewsItem | null>(null);
  const [seenNewsIds, setSeenNewsIds] = useState<number[]>(() => getLocalSeenNewsArray());
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isShowingNews, setIsShowingNews] = useState(false);
  const lastFetchedNewsIds = useRef<Set<number>>(new Set());

  const isNewsSeen = useCallback((newsId: number) => seenNewsIds.includes(newsId), [seenNewsIds]);

  // Fetch user profile
  useEffect(() => {
    if (!userId) return;
    
    const fetchUserProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('role, is_verified')
          .eq('id', userId)
          .single();

        if (!error && data) {
          setUserProfile({
            role: data.role,
            isVerified: data.is_verified
          });
        } else {
          setUserProfile({
            role: userRole || 'user',
            isVerified: isVerified || false
          });
        }
      } catch {
        setUserProfile({
          role: userRole || 'user',
          isVerified: isVerified || false
        });
      }
    };

    fetchUserProfile();
  }, [userId, userRole, isVerified]);

  // Fetch seen news from DB
  useEffect(() => {
    if (!userId) return;

    const fetchSeenNews = async () => {
      try {
        const { data, error } = await supabase
          .from('user_news_seen')
          .select('news_id')
          .eq('user_id', userId);

        if (!error && data) {
          const dbSeenIds = data.map(item => item.news_id);
          const localSeen = getLocalSeenNewsArray();
          const merged = Array.from(new Set([...dbSeenIds, ...localSeen]));
          setSeenNewsIds(merged);
          saveLocalSeenNewsArray(merged);
        }
      } catch {}
    };

    fetchSeenNews();
  }, [userId]);

  // Fetch active news with polling
  const fetchActiveNews = useCallback(async () => {
    try {
      console.log('[News] Fetching active news...');
      const response = await fetch('/api/news/active');
      if (!response.ok) {
        console.error('[News] API error:', response.status);
        return;
      }

      const data: NewsItem[] = await response.json();
      console.log('[News] Received news items:', data.length, data);
      
      const role = userProfile?.role || userRole;
      const verified = userProfile?.isVerified !== undefined ? userProfile.isVerified : isVerified;
      
      const filteredNews = data.filter((news) => {
        switch (news.target_users) {
          case 'all':
            return true;
          case 'verified':
            return verified === true;
          case 'unverified':
            return verified === false;
          case 'traders':
            return role === 'trader' || role === 'premium';
          case 'inactive':
            return false;
          default:
            return true;
        }
      });

      console.log('[News] Filtered for user (role:', role, ', verified:', verified, '):', filteredNews.length);
      setActiveNews(filteredNews);

      // Check for NEW news items that weren't in the previous fetch
      const currentIds = new Set(filteredNews.map(n => n.id));
      const hasNewNews = filteredNews.some(n => !lastFetchedNewsIds.current.has(n.id));
      lastFetchedNewsIds.current = currentIds;

      return hasNewNews;
    } catch (err) {
      console.error('[News] Fetch error:', err);
      return false;
    }
  }, [userProfile, userRole, isVerified]);

  // Initial fetch and polling
  useEffect(() => {
    if (!userId || !userProfile) return;

    // Initial fetch
    fetchActiveNews();

    // Set up polling for new news
    const pollInterval = setInterval(() => {
      fetchActiveNews();
    }, NEWS_POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [userId, userProfile, fetchActiveNews]);

  // Show next unseen news
  useEffect(() => {
    if (isShowingNews || currentNews) return;

    const unseenNews = activeNews.filter(news => !isNewsSeen(news.id) && news.show_popup);
    console.log('[News] Checking for unseen news. Active:', activeNews.length, ', Seen IDs:', seenNewsIds, ', Unseen with popup:', unseenNews.length);
    
    if (unseenNews.length > 0) {
      // Prioritize by priority level: urgent > high > normal > low
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      unseenNews.sort((a, b) => {
        const aPriority = priorityOrder[a.priority || 'normal'] ?? 2;
        const bPriority = priorityOrder[b.priority || 'normal'] ?? 2;
        return aPriority - bPriority;
      });

      console.log('[News] Will show news:', unseenNews[0].id, unseenNews[0].title);
      
      // Small delay to prevent rapid popup spam
      const timer = setTimeout(() => {
        setIsShowingNews(true);
        setCurrentNews(unseenNews[0]);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [activeNews, seenNewsIds, isShowingNews, currentNews, isNewsSeen]);

  const markNewsAsSeen = useCallback(async (newsId: number) => {
    if (isNewsSeen(newsId)) return;

    const updatedSeen = [...seenNewsIds, newsId];
    setSeenNewsIds(updatedSeen);
    saveLocalSeenNewsArray(updatedSeen);

    try {
      await supabase
        .from('user_news_seen')
        .upsert(
          { user_id: userId, news_id: newsId },
          { onConflict: 'user_id,news_id' }
        );
    } catch {}
  }, [userId, seenNewsIds, isNewsSeen]);

  const handleClose = useCallback(() => {
    setCurrentNews(null);
    setIsShowingNews(false);
  }, []);

  if (!currentNews) return null;

  return (
    <NewsPopup
      news={currentNews}
      onClose={handleClose}
      onMarkSeen={markNewsAsSeen}
    />
  );
}
