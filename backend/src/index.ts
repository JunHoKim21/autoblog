import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import apiRouter from './routes/api';
import { processScheduledPosts } from './jobs/scheduler';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 로컬 이미지 서빙 엔드포인트
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API 라우터
app.use('/api', apiRouter);

// 서버 상태 체크
app.get('/health', (req, res) => res.send('Autoblog Server is running.'));

import { prisma } from './db';

let isPublishing = false;

app.listen(PORT, () => {
  console.log(`🚀 Autoblog Backend Server is running on port ${PORT}`);
  
  // 1분 단위 예약 게시물 폴링
  cron.schedule('* * * * *', async () => {
    if (isPublishing) {
      console.log(`[Scheduler] Skip: Previous publish job is still running.`);
      return;
    }
    
    console.log(`[Scheduler] Checking scheduled posts at ${new Date().toISOString()}`);
    isPublishing = true;
    
    try {
      await processScheduledPosts(prisma);
    } catch (error) {
      console.error(`[Scheduler] Error in processScheduledPosts:`, error);
    } finally {
      isPublishing = false;
    }
  });
});
