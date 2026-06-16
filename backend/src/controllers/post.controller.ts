import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createPost = async (req: Request, res: Response) => {
  try {
    const { title, content, mediaPaths, scheduledAt, platforms } = req.body;
    
    // platforms: ['TISTORY', 'BLOGSPOT', 'NAVER']
    
    const status = scheduledAt ? 'SCHEDULED' : 'PUBLISHING';
    const parsedScheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const newPost = await prisma.post.create({
      data: {
        title,
        content,
        mediaPaths: JSON.stringify(mediaPaths || []),
        scheduledAt: parsedScheduledAt,
        status,
        platformStatuses: {
          create: (platforms || []).map((platform: string) => ({
            platform,
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
