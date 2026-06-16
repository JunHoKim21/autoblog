import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import * as postController from '../controllers/post.controller';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const router = Router();
const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// 이미지 업로드 API
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  const localPath = path.join(__dirname, '../../uploads', req.file.filename);
  res.json({ imageUrl, localPath });
});

// 게시글 API
router.post('/posts', postController.createPost);
router.get('/posts', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      include: { platformStatuses: true }
    });
    res.json({ success: true, posts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 설정 API
router.get('/config', async (req, res) => {
  try {
    let config = await prisma.platformConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      config = await prisma.platformConfig.create({ data: { id: 1 } });
    }
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const { id, updatedAt, ...data } = req.body;
    const config = await prisma.platformConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data }
    });
    res.json({ success: true, config });
  } catch (err: any) {
    console.error('Config update error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
