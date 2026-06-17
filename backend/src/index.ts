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

app.listen(PORT, () => {
  console.log(`🚀 Autoblog Backend Server is running on port ${PORT}`);
  
  // 1분 단위 예약 게시물 폴링
  cron.schedule('* * * * *', async () => {
    console.log(`[Scheduler] Checking scheduled posts at ${new Date().toISOString()}`);
    
    // index.ts에서 prismaClient를 가져올 수 없으므로, 여기서 임시 생성하거나 postController의 prisma를 쓸 수 있습니다.
    // 하지만 각 모듈에서 PrismaClient를 중복 호출하면 문제 생길 수 있음.
    // 안전하게 새 인스턴스 만들어서 전달.
    const { PrismaClient } = require('@prisma/client');
    const { PrismaLibSql } = require('@prisma/adapter-libsql');
    const { createClient } = require('@libsql/client');
    const libsql = createClient({ url: process.env.DATABASE_URL || 'file:./dev.db' });
    const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || 'file:./dev.db' });
    const prisma = new PrismaClient({ adapter });
    
    await processScheduledPosts(prisma).finally(() => prisma.$disconnect());
  });
});
