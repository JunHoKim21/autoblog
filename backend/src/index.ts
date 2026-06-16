import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import apiRouter from './routes/api';
// import { processScheduledPosts } from './jobs/scheduler';

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
    // console.log(`[Scheduler] Checking scheduled posts at ${new Date().toISOString()}`);
    // await processScheduledPosts(prisma);
  });
});
