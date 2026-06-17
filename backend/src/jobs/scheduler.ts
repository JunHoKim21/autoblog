import { PrismaClient } from '@prisma/client';
import { NaverPublisher } from '../services/publishers/NaverPublisher';
import { TistoryPublisher } from '../services/publishers/TistoryPublisher';
import { BlogspotPublisher } from '../services/publishers/BlogspotPublisher';

export const processScheduledPosts = async (prisma: PrismaClient) => {
  // 1. Deadlock Recovery: 상태가 PUBLISHING인 채로 10분이 지난 트랜잭션 복구
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const stuckPlatforms = await prisma.platformStatus.findMany({
    where: {
      status: 'PUBLISHING',
      updatedAt: { lte: tenMinutesAgo }
    }
  });

  for (const stuck of stuckPlatforms) {
    console.log(`[QA Recovery] Recovering stuck post ${stuck.postId} platform ${stuck.platformName}`);
    await prisma.platformStatus.update({
      where: { id: stuck.id },
      data: { status: 'FAILED', errorMsg: 'Timeout Recovery: 서버 재시작으로 인한 비정상 종료 복구' }
    });
  }

  // 2. 발행 대기 중인(PENDING) 플랫폼 조회
  const pendingPlatforms = await prisma.platformStatus.findMany({
    where: { status: 'PENDING' },
    include: { post: true }
  });

  if (pendingPlatforms.length === 0) return;

  const config = await prisma.platformConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    console.error('[Scheduler] PlatformConfig is missing.');
    return;
  }

  const publishers: any = {
    naver: new NaverPublisher(config),
    tistory: new TistoryPublisher(config),
    blogspot: new BlogspotPublisher(config)
  };

  for (const plat of pendingPlatforms) {
    // 예약 발행 시간이 미래인 경우 건너뜀
    if (plat.post.scheduledAt && new Date(plat.post.scheduledAt) > new Date()) {
      continue;
    }

    const publisher = publishers[plat.platformName.toLowerCase()];
    if (!publisher) continue;

    // PUBLISHING 상태로 변경
    await prisma.platformStatus.update({
      where: { id: plat.id },
      data: { status: 'PUBLISHING' }
    });

    try {
      console.log(`[Scheduler] Publishing to ${plat.platformName} for post ${plat.postId}...`);
      
      const result = await publisher.publish({
        title: plat.post.title,
        content: plat.post.content,
        mediaPaths: JSON.parse(plat.post.mediaPaths || '[]')
      });

      if (result.success) {
        await prisma.platformStatus.update({
          where: { id: plat.id },
          data: { status: 'SUCCESS', externalUrl: result.externalUrl }
        });
      } else {
        await prisma.platformStatus.update({
          where: { id: plat.id },
          data: { status: 'FAILED', errorMsg: result.error || 'Unknown Error' }
        });
      }
    } catch (err: any) {
      console.error(`[Scheduler] Unexpected error publishing to ${plat.platformName}:`, err);
      await prisma.platformStatus.update({
        where: { id: plat.id },
        data: { status: 'FAILED', errorMsg: `Exception: ${err.message}` }
      });
    }
  }
};
