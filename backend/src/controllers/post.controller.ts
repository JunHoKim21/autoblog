import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

export const createPost = async (req: Request, res: Response) => {
  try {
    const { title, content, mediaPaths, scheduledAt, platforms } = req.body;
    
    // platforms: ['TISTORY', 'BLOGSPOT', 'NAVER']
    
    const status = scheduledAt ? 'SCHEDULED' : 'PUBLISHING';
    const parsedScheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const config = await prisma.platformConfig.findUnique({ where: { id: 1 } });
    const validPlatforms = [];
    if (config?.naverId && config?.naverPw) validPlatforms.push('NAVER');
    if (config?.kakaoId && config?.kakaoPw && config?.tistoryBlog) validPlatforms.push('TISTORY');
    if (config?.blogspotId) validPlatforms.push('BLOGSPOT'); // Or check googleRefreshToken if you prefer, but blogspotId is a good proxy.

    const finalPlatforms = (platforms || []).filter((p: string) => validPlatforms.includes(p.toUpperCase()));

    const newPost = await prisma.post.create({
      data: {
        title,
        content,
        mediaPaths: JSON.stringify(mediaPaths || []),
        scheduledAt: parsedScheduledAt,
        status,
        platformStatuses: {
          create: finalPlatforms.map((platform: string) => ({
            platform: platform.toUpperCase(),
            status: 'PENDING'
          }))
        }
      },
      include: { platformStatuses: true }
    });

    // 만약 scheduledAt이 없다면 여기서 즉시 발행(PUBLISHING) 로직을 비동기로 호출할 수 있습니다.
    if (!scheduledAt) {
      // TODO: 즉시 발행 로직 트리거
    }

    res.status(201).json({ success: true, post: newPost });
  } catch (error: any) {
    console.error('Create Post Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPostById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const post = await prisma.post.findUnique({
      where: { id: Number(id) }
    });
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, post });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, mediaPaths, scheduledAt } = req.body;

    const parsedScheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const updatedPost = await prisma.post.update({
      where: { id: Number(id) },
      data: {
        title,
        content,
        mediaPaths: JSON.stringify(mediaPaths || []),
        scheduledAt: parsedScheduledAt
      }
    });

    res.json({ success: true, post: updatedPost });
  } catch (error: any) {
    console.error('Update Post Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
