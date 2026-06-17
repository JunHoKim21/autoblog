import { BasePublisher, PublishParams, PublishResult } from './Publisher.interface';
import { chromium } from 'rebrowser-playwright';
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
    // QA Edge Case: 티스토리/카카오 무한 대기 방지 (30초 타임아웃)
    page.setDefaultTimeout(30000);

    try {
      // 티스토리 관리자 페이지 이동 (로그인 체크)
      await page.goto(`https://${tistoryBlog}.tistory.com/manage/post`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      if (page.url().includes('tistory.com/auth/login')) {
        console.log('[TistoryPublisher] 티스토리 로그인 페이지 감지, 카카오 로그인 버튼을 클릭합니다.');
        await page.click('text="카카오계정으로 로그인"');
        await page.waitForNavigation({ waitUntil: 'networkidle' });
      }

      if (page.url().includes('accounts.kakao.com/login')) {
        console.log('[TistoryPublisher] 카카오 로그인을 진행합니다...');
        
        await page.waitForSelector('input[name="loginId"]', { state: 'visible' });
        await page.click('input[name="loginId"]');
        
        clipboardy.writeSync(kakaoId);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        await page.waitForTimeout(Math.random() * 500 + 300);
        
        await page.click('input[name="password"]');
        
        clipboardy.writeSync(kakaoPw);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        await page.waitForTimeout(Math.random() * 500 + 500);
        
        clipboardy.writeSync('');

        await page.click('[type="submit"]');
      
      // 2단계 인증(2FA) 방어 로직: 카카오 로그인을 벗어날 때까지 최대 60초 대기
      console.log('[TistoryPublisher] 로그인 제출 완료. 2단계 인증이 뜰 경우 60초 안에 브라우저에서 수동으로 인증 번호를 입력해주세요!');
      try {
        await page.waitForURL((url) => !url.href.includes('accounts.kakao.com/login'), { timeout: 60000 });
      } catch (e) {
        console.log('[TistoryPublisher] 2단계 인증 대기 시간(60초) 초과 또는 이미 넘어갔습니다.');
      }
      
      await page.goto(`https://${tistoryBlog}.tistory.com/manage/post`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      }

      // --- 에디터 자동화 로직 ---
      console.log('[TistoryPublisher] 제목과 본문을 입력합니다.');
      
      // 임시저장 팝업 무시
      try {
        const cancelBtn = page.locator('text="취소"').first();
        if (await cancelBtn.isVisible({ timeout: 2000 })) {
          console.log('[TistoryPublisher] 임시저장 팝업을 닫습니다.');
          await cancelBtn.click();
          await page.waitForTimeout(500);
        }
      } catch (e) {
        // 무시
      }

      // 제목 입력
      await page.waitForSelector('#post-title-inp', { state: 'visible' });
      await page.locator('#post-title-inp').fill(title);
      await page.waitForTimeout(500);

      // 본문 입력 (ProseMirror 에디터 대응)
      try {
        const editorSelector = '.ProseMirror';
        await page.waitForSelector(editorSelector, { state: 'visible', timeout: 5000 });
        await page.click(editorSelector);
        
        await page.evaluate((htmlContent) => {
          const editorDiv = document.querySelector('.ProseMirror') as HTMLElement;
          if (editorDiv) {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/html', htmlContent);
            dataTransfer.setData('text/plain', htmlContent);
            
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            });
            editorDiv.dispatchEvent(pasteEvent);
          }
        }, content);
        await page.waitForTimeout(1000);
      } catch (e) {
        console.log('[TistoryPublisher] ProseMirror를 찾을 수 없어 iframe 폴백을 시도합니다.');
        await page.evaluate((htmlContent) => {
          const iframe = document.querySelector('#tx_canvas_source') as HTMLIFrameElement;
          if (iframe && iframe.contentDocument) {
            iframe.contentDocument.body.innerHTML = htmlContent;
          }
        }, content);
      }

      // 하단 완료 버튼 클릭
      const publishLayerBtn = await page.$('#publish-layer-btn');
      if (publishLayerBtn) {
        await page.click('#publish-layer-btn');
        await page.waitForTimeout(1500);
        
        // 공개 발행 선택 (기본값이 공개일 수 있지만 명시적 클릭)
        const publicRadio = await page.$('input[value="PUBLIC"]');
        if (publicRadio) {
          await page.evaluate(() => {
            const radio = document.querySelector('input[value="PUBLIC"]') as HTMLElement;
            if (radio) radio.click();
          });
        }
        
        // 최종 발행 버튼 클릭
        const publishBtn = await page.$('#publish-btn');
        if (publishBtn) {
          await page.click('#publish-btn');
          await page.waitForNavigation({ waitUntil: 'networkidle' });
          console.log('[TistoryPublisher] 발행 완료!');
        }
      }

      await context.close();
      return { success: true, externalUrl: `https://${tistoryBlog}.tistory.com/` };
    } catch (error: any) {
      console.error('[TistoryPublisher] Error:', error);
      await context.close();
      return { success: false, error: error.message };
    }
  }
}
