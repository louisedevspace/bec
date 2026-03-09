import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { supabaseAdmin } from '../routes/middleware';
import { requireAdmin, requireAuth } from '../routes/middleware';
import type { Express } from 'express';

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

// Upload news image (admin only)
router.post('/upload-image', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Missing file' });
    }

    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const filePath = `uploads/${fileName}`;

    try {
      await ensureNewsImagesBucket();

      const { error: uploadError } = await supabaseAdmin.storage
        .from('news-images')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabaseAdmin.storage.from('news-images').getPublicUrl(filePath);
      return res.json({ publicUrl: data.publicUrl, path: filePath, storage: 'supabase' });
    } catch (storageError) {
      console.error('Supabase news image upload failed, using local fallback:', storageError);
      try {
        const localUpload = await saveNewsImageLocally(file, fileName);
        return res.json(localUpload);
      } catch (localError) {
        console.error('Local news image save failed, using inline fallback:', localError);
        return res.json(createInlineNewsImage(file, fileName));
      }
    }
  } catch (error) {
    console.error('Error uploading news image:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload image' });
  }
});

// Get all news (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('news')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Get active news for users
router.get('/active', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('news')
      .select('*')
      .eq('is_active', true)
      .or('end_date.is.null,end_date.gt.now()')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching active news:', error);
    res.status(500).json({ error: 'Failed to fetch active news' });
  }
});

// Get news by ID (admin only)
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('news')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Create news (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const newsData = {
      ...req.body,
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
    console.error('Error creating news:', error);
    res.status(500).json({ error: 'Failed to create news' });
  }
});

// Update news (admin only)
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

    if (!data) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating news:', error);
    res.status(500).json({ error: 'Failed to update news' });
  }
});

// Delete news (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error: seenError } = await supabaseAdmin
      .from('user_news_seen')
      .delete()
      .eq('news_id', parseInt(id, 10));

    if (seenError) {
      console.warn('Warning: Could not delete user seen records for news', id, seenError.message);
    }

    const { error } = await supabaseAdmin
      .from('news')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'News deleted successfully' });
  } catch (error) {
    console.error('Error deleting news:', error);
    res.status(500).json({ error: 'Failed to delete news' });
  }
});

// Toggle news active status (admin only)
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

    if (!data) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error toggling news:', error);
    res.status(500).json({ error: 'Failed to toggle news' });
  }
});

// Get user's seen news
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
    console.error('Error fetching seen news:', error);
    res.status(500).json({ error: 'Failed to fetch seen news' });
  }
});

// Mark news as seen by user
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
      // Handle duplicate entries
      if (error.code === '23505') {
        return res.status(200).json({ message: 'News already marked as seen' });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error marking news as seen:', error);
    res.status(500).json({ error: 'Failed to mark news as seen' });
  }
});

export function registerNewsRoutes(app: Express) {
  app.use('/api/news', router);
}
