import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { supabaseAdmin } from '../routes/middleware';
import { requireAdmin, requireAuth } from '../routes/middleware';
import type { Express } from 'express';
import { buildInternalAssetPath } from '../../shared/supabase-storage';
import { compressAdminImage } from '../utils/image-compress';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are allowed'));
      return;
    }
    cb(null, true);
  },
});

async function ensureNewsImagesBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) {
    throw new Error(`Unable to verify storage buckets: ${listError.message}`);
  }

  const existingBucket = buckets?.find((bucket) => bucket.name === 'news-images' || bucket.id === 'news-images');
  if (existingBucket) {
    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket('news-images', {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'],
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Failed to create news-images bucket: ${createError.message}`);
  }
}

async function saveNewsImageLocally(file: Express.Multer.File, fileName: string) {
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'news-images');
  await fs.mkdir(uploadsDir, { recursive: true });

  const localPath = path.join(uploadsDir, fileName);
  await fs.writeFile(localPath, file.buffer);

  return {
    publicUrl: `/uploads/news-images/${fileName}`,
    path: `news-images/${fileName}`,
    storage: 'local' as const,
  };
}

function createInlineNewsImage(file: Express.Multer.File, fileName: string) {
  const base64 = file.buffer.toString('base64');
  return {
    publicUrl: `data:${file.mimetype};base64,${base64}`,
    path: `inline/${fileName}`,
    storage: 'inline' as const,
  };
}

// ─── Upload news image (admin only) ────────────────────────
router.post('/upload-image', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Missing file' });
    }

    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const filePath = `uploads/${fileName}`;
    const { buffer: compressedBuffer, mimeType: compressedMime } =
      await compressAdminImage(file.buffer, file.mimetype);

    try {
      await ensureNewsImagesBucket();

      const { error: uploadError } = await supabaseAdmin.storage
        .from('news-images')
        .upload(filePath, compressedBuffer, {
          contentType: compressedMime,
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return res.json({ publicUrl: buildInternalAssetPath('news-images', filePath), path: filePath, storage: 'supabase' });
    } catch (storageError) {
      try {
        const localUpload = await saveNewsImageLocally(file, fileName);
        return res.json(localUpload);
      } catch (_localError) {
        return res.json(createInlineNewsImage(file, fileName));
      }
    }
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload image' });
  }
});

// ─── Stats dashboard (admin only) ──────────────────────────
router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [newsRes, seenRes, eventsRes, categoriesRes] = await Promise.all([
      supabaseAdmin.from('news').select('id, is_active, priority, type, category, view_count, click_count, dismiss_count, created_at, start_date, end_date'),
      supabaseAdmin.from('user_news_seen').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('news_events').select('event_type'),
      supabaseAdmin.from('news_categories').select('slug, name'),
    ]);

    const allNews = newsRes.data || [];
    const totalNews = allNews.length;
    const activeNews = allNews.filter(n => n.is_active).length;
    const scheduledNews = allNews.filter(n => n.is_active && n.start_date && new Date(n.start_date) > new Date()).length;
    const expiredNews = allNews.filter(n => n.end_date && new Date(n.end_date) < new Date()).length;

    const totalViews = allNews.reduce((s, n) => s + (n.view_count || 0), 0);
    const totalClicks = allNews.reduce((s, n) => s + (n.click_count || 0), 0);
    const totalDismissals = allNews.reduce((s, n) => s + (n.dismiss_count || 0), 0);
    const totalSeen = seenRes.count || 0;

    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const n of allNews) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
      const cat = n.category || 'general';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    const events = eventsRes.data || [];
    const eventCounts: Record<string, number> = {};
    for (const e of events) {
      eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
    }

    const avgCtr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0';

    res.json({
      totalNews,
      activeNews,
      scheduledNews,
      expiredNews,
      totalViews,
      totalClicks,
      totalDismissals,
      totalSeen,
      avgCtr,
      byType,
      byPriority,
      byCategory,
      eventCounts,
      categories: categoriesRes.data || [],
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── Get all news (admin only) ─────────────────────────────
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { search, type, priority, category, status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const offset = (pageNum - 1) * pageSize;

    let query = supabaseAdmin.from('news').select('*', { count: 'exact' });

    if (search && typeof search === 'string' && search.trim()) {
      query = query.ilike('title', `%${search.trim()}%`);
    }
    if (type && type !== 'all') {
      query = query.eq('type', type);
    }
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    } else if (status === 'scheduled') {
      query = query.eq('is_active', true).gt('start_date', new Date().toISOString());
    } else if (status === 'expired') {
      query = query.lt('end_date', new Date().toISOString());
    }

    query = query.order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      news: data || [],
      total: count || 0,
      page: pageNum,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// ─── Get active news for users (public) ────────────────────
router.get('/active', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('news')
      .select('*')
      .eq('is_active', true)
      .or('end_date.is.null,end_date.gt.now()')
      .order('is_pinned', { ascending: false })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch active news' });
  }
});

// ─── Get news by ID (admin only) ───────────────────────────
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent matching route keywords
    if (['stats', 'active', 'categories', 'templates', 'bulk', 'user'].includes(id)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { data, error } = await supabaseAdmin
      .from('news')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'News not found' });

    // Also get seen count for this news
    const { count: seenCount } = await supabaseAdmin
      .from('user_news_seen')
      .select('id', { count: 'exact', head: true })
      .eq('news_id', id);

    res.json({ ...data, seen_count: seenCount || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// ─── Create news (admin only) ──────────────────────────────
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const newsData = {
      ...req.body,
      tags: req.body.tags || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('news')
      .insert([newsData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create news' });
  }
});

// ─── Update news (admin only) ──────────────────────────────
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('news')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'News not found' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update news' });
  }
});

// ─── Delete news (admin only) ──────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete related records first
    await supabaseAdmin.from('news_events').delete().eq('news_id', parseInt(id, 10));
    await supabaseAdmin.from('user_news_seen').delete().eq('news_id', parseInt(id, 10));

    const { error } = await supabaseAdmin
      .from('news')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'News deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete news' });
  }
});

// ─── Toggle news active status (admin only) ────────────────
router.patch('/:id/toggle', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const { data, error } = await supabaseAdmin
      .from('news')
      .update({
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'News not found' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle news' });
  }
});

// ─── Toggle pin status (admin only) ────────────────────────
router.patch('/:id/pin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pinned } = req.body;

    const { data, error } = await supabaseAdmin
      .from('news')
      .update({ is_pinned, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'News not found' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update pin status' });
  }
});

// ─── Duplicate news (admin only) ───────────────────────────
router.post('/:id/duplicate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: original, error: fetchError } = await supabaseAdmin
      .from('news')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !original) {
      return res.status(404).json({ error: 'News not found' });
    }

    const { id: _id, created_at: _ca, updated_at: _ua, view_count: _vc, click_count: _cc, dismiss_count: _dc, ...rest } = original;
    const duplicateData = {
      ...rest,
      title: `${original.title} (Copy)`,
      is_active: false,
      view_count: 0,
      click_count: 0,
      dismiss_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('news')
      .insert([duplicateData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate news' });
  }
});

// ─── Bulk operations (admin only) ──────────────────────────
router.post('/bulk', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { action, ids } = req.body as { action: string; ids: number[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    let affected = 0;

    switch (action) {
      case 'activate': {
        const { error } = await supabaseAdmin.from('news').update({ is_active: true, updated_at: new Date().toISOString() }).in('id', ids);
        if (error) throw error;
        affected = ids.length;
        break;
      }
      case 'deactivate': {
        const { error } = await supabaseAdmin.from('news').update({ is_active: false, updated_at: new Date().toISOString() }).in('id', ids);
        if (error) throw error;
        affected = ids.length;
        break;
      }
      case 'delete': {
        await supabaseAdmin.from('news_events').delete().in('news_id', ids);
        await supabaseAdmin.from('user_news_seen').delete().in('news_id', ids);
        const { error } = await supabaseAdmin.from('news').delete().in('id', ids);
        if (error) throw error;
        affected = ids.length;
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    res.json({ success: true, affected });
  } catch (error) {
    res.status(500).json({ error: 'Bulk operation failed' });
  }
});

// ─── Analytics for a specific news item (admin only) ───────
router.get('/:id/analytics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [newsRes, seenRes, eventsRes] = await Promise.all([
      supabaseAdmin.from('news').select('id, title, view_count, click_count, dismiss_count, created_at').eq('id', id).single(),
      supabaseAdmin.from('user_news_seen').select('id', { count: 'exact', head: true }).eq('news_id', id),
      supabaseAdmin.from('news_events').select('event_type, created_at').eq('news_id', id).order('created_at', { ascending: true }),
    ]);

    if (newsRes.error || !newsRes.data) {
      return res.status(404).json({ error: 'News not found' });
    }

    const events = eventsRes.data || [];
    const eventsByType: Record<string, number> = {};
    for (const e of events) {
      eventsByType[e.event_type] = (eventsByType[e.event_type] || 0) + 1;
    }

    // Daily breakdown for last 30 days
    const daily: Record<string, Record<string, number>> = {};
    for (const e of events) {
      const day = e.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = {};
      daily[day][e.event_type] = (daily[day][e.event_type] || 0) + 1;
    }

    res.json({
      news: newsRes.data,
      seenCount: seenRes.count || 0,
      eventsByType,
      daily,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── Categories CRUD (admin only) ──────────────────────────
router.get('/categories/list', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('news_categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, color, sort_order } = req.body;
    const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const { data, error } = await supabaseAdmin
      .from('news_categories')
      .insert([{ name, slug, description, color, sort_order: sort_order || 0 }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, sort_order } = req.body;
    const slug = name ? (name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : undefined;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) { updateData.name = name; updateData.slug = slug; }
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    const { data, error } = await supabaseAdmin
      .from('news_categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('news_categories').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ─── Templates CRUD (admin only) ───────────────────────────
router.get('/templates/list', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('news_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('news_templates')
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/templates/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('news_templates')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('news_templates').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ─── Record news event (authenticated) ─────────────────────
router.post('/event', requireAuth, async (req, res) => {
  try {
    const { news_id, event_type } = req.body;
    const user_id = (req as any).user?.id;

    if (!news_id || !event_type) {
      return res.status(400).json({ error: 'Missing news_id or event_type' });
    }

    const validTypes = ['view', 'click', 'dismiss', 'auto_close'];
    if (!validTypes.includes(event_type)) {
      return res.status(400).json({ error: 'Invalid event_type' });
    }

    // Insert event
    await supabaseAdmin.from('news_events').insert([{ news_id, user_id, event_type }]);

    // Update counter on news row
    const counterField = event_type === 'view' ? 'view_count' : event_type === 'click' ? 'click_count' : event_type === 'dismiss' ? 'dismiss_count' : null;
    if (counterField) {
      const { data: current } = await supabaseAdmin.from('news').select(counterField).eq('id', news_id).single();
      if (current) {
        await supabaseAdmin.from('news').update({ [counterField]: (current[counterField] || 0) + 1 }).eq('id', news_id);
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// ─── Get user's seen news ──────────────────────────────────
router.get('/user/:userId/seen', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('user_news_seen')
      .select('news_id')
      .eq('user_id', userId);

    if (error) throw error;

    const seenIds = data?.map((item: any) => item.news_id) || [];
    res.json(seenIds);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seen news' });
  }
});

// ─── Mark news as seen by user ─────────────────────────────
router.post('/user/:userId/seen/:newsId', async (req, res) => {
  try {
    const { userId, newsId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('user_news_seen')
      .insert({
        user_id: userId,
        news_id: parseInt(newsId),
        seen_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(200).json({ message: 'News already marked as seen' });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark news as seen' });
  }
});

export function registerNewsRoutes(app: Express) {
  app.use('/api/news', router);
}
