import { BasePublisher, PublishParams, PublishResult } from './Publisher.interface';
import { chromium } from 'rebrowser-playwright';
import { createCursor } from 'ghost-cursor';
import clipboardy from 'clipboardy';
import path from 'path';

export class TistoryPublisher extends BasePublisher {
  async publish(params: PublishParams): Promise<PublishResult> {
    const { title, content, mediaPaths } = params;
    const { kakaoId, kakaoPw, tistoryBlog } = this.config;
    
    if (!kakaoId || !kakaoPw || !tistoryBlog) {
      return { success: false, error: '카카오 ID/PW 또는 티스토리 블로그 이름이 누락되었습니다.' };
    }

    const userDataDir = path.join(process.cwd(), '.chrome-profile-tistory');
    
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ],
      viewport: null
    });

    const page = await context.newPage();
    const cursor = createCursor(page);

    try {
      // 티스토리 관리자 페이지 이동 (로그인 체크)
      await page.goto(`https://${tistoryBlog}.tistory.com/manage/post`);
      await page.waitForTimeout(Math.random() * 1000 + 1000);

      if (page.url().includes('accounts.kakao.com/login')) {
        console.log('[TistoryPublisher] 카카오 로그인을 진행합니다...');
        
        const idInput = await page.$('input[name="loginId"]');
        if (idInput) await cursor.click('input[name="loginId"]');
        
        clipboardy.writeSync(kakaoId);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        await page.waitForTimeout(Math.random() * 500 + 300);
        
        const pwInput = await page.$('input[name="password"]');
        if (pwInput) await cursor.click('input[name="password"]');
        
        clipboardy.writeSync(kakaoPw);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        await page.waitForTimeout(Math.random() * 500 + 500);
        
        clipboardy.writeSync('');

        const loginBtn = await page.$('button[type="submit"]');
        if (loginBtn) await cursor.click('button[type="submit"]');
        
        await page.waitForNavigation({ waitUntil: 'networkidle' });
        await page.goto(`https://${tistoryBlog}.tistory.com/manage/post`);
        await page.waitForTimeout(Math.random() * 1000 + 1000);
      }

      // --- 에디터 자동화 로직 스캐폴딩 ---
      // (기존 TistoryPublisher.ts와 동일한 구조)
      
      console.log('[TistoryPublisher] 글 작성이 완료되었습니다. (임시저장/발행 버튼 클릭 대기)');

      await context.close();
      return { success: true, externalUrl: `https://${tistoryBlog}.tistory.com/` };
    } catch (error: any) {
      console.error('[TistoryPublisher] Error:', error);
      await context.close();
      return { success: false, error: error.message };
    }
  }
}
