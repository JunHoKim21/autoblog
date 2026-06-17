import { BasePublisher, PublishParams, PublishResult } from './Publisher.interface';
import { chromium } from 'rebrowser-playwright';
import clipboardy from 'clipboardy';
import path from 'path';

export class BlogspotPublisher extends BasePublisher {
  async publish(params: PublishParams): Promise<PublishResult> {
    const { title, content } = params;
    // 프론트엔드에서 편의상 googleClientId를 이메일로, googleClientSecret을 비밀번호로 재사용했습니다.
    const { googleClientId: googleEmail, googleClientSecret: googlePw, blogspotId } = this.config;
    
    if (!googleEmail || !googlePw || !blogspotId) {
      return { success: false, error: '구글 아이디/비밀번호 또는 Blogspot ID가 누락되었습니다.' };
    }

    const userDataDir = path.join(process.cwd(), '.chrome-profile-blogspot');
    
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ],
      viewport: null
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    try {
      // 블로그스팟 새 글 쓰기 페이지로 바로 이동
      await page.goto(`https://www.blogger.com/blog/posts/${blogspotId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // 구글 로그인 감지
      if (page.url().includes('accounts.google.com')) {
        console.log('[BlogspotPublisher] 구글 로그인을 진행합니다...');
        
        // 이메일 입력 (다양한 Selector 대응)
        const emailSelector = 'input[type="email"], input[name="identifier"], #identifierId, input[autocomplete="username"]';
        await page.waitForSelector(emailSelector, { state: 'visible', timeout: 15000 });
        await page.locator(emailSelector).first().click();
        clipboardy.writeSync(googleEmail);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        await page.keyboard.press('Enter');
        
        await page.waitForTimeout(3000);
        
        // 비밀번호 입력
        const pwSelector = 'input[type="password"], input[name="Passwd"], input[name="password"]';
        await page.waitForSelector(pwSelector, { state: 'visible', timeout: 15000 });
        await page.locator(pwSelector).first().click();
        clipboardy.writeSync(googlePw);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        await page.keyboard.press('Enter');

        console.log('[BlogspotPublisher] 로그인 제출 완료. 2단계 인증이 뜰 경우 60초 안에 브라우저에서 수동으로 인증을 완료해주세요!');
        try {
          await page.waitForURL((url) => url.href.includes('blogger.com'), { timeout: 60000 });
        } catch (e) {
          console.log('[BlogspotPublisher] 2단계 인증 대기 시간(60초) 초과 또는 이미 넘어갔습니다.');
        }
      }

      // 대시보드 강제 이동 후 새 글 쓰기 버튼 탐색
      await page.goto(`https://www.blogger.com/blog/posts/${blogspotId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // 새 글 쓰기 버튼 클릭
      console.log('[BlogspotPublisher] 새 글 쓰기 화면으로 이동합니다.');
      try {
        const newPostBtn = page.locator('div[role="button"]:has-text("새 글"), div[role="button"]:has-text("New Post"), a:has-text("새 글"), a:has-text("New Post"), span:has-text("새 글"), span:has-text("New Post"), div[aria-label="새 글"], div[aria-label="New Post"]').first();
        await newPostBtn.click();
        await page.waitForTimeout(3000); // 에디터 로딩 대기
      } catch (e) {
        console.log('[BlogspotPublisher] 새 글 쓰기 버튼을 찾을 수 없어 URL로 직접 접근합니다.');
        await page.goto(`https://www.blogger.com/blog/post/edit/${blogspotId}/new`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
      }

      console.log('[BlogspotPublisher] 제목과 본문을 입력합니다.');
      
      // 제목 입력
      await page.waitForSelector('input[aria-label="Title"], input[aria-label="제목"], input[placeholder="제목"]', { state: 'visible' });
      await page.locator('input[aria-label="Title"], input[aria-label="제목"], input[placeholder="제목"]').first().click();
      clipboardy.writeSync(title);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      await page.waitForTimeout(500);

      // 본문 입력 (HTML 뷰로 전환이 복잡하므로 클립보드 Paste Event로 본문 에디터(iframe 안의 body)에 주입 시도)
      // Blogspot은 주로 iframe 안의 body에 contenteditable 속성을 가집니다.
      await page.evaluate((htmlContent) => {
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
          const doc = iframes[i].contentDocument;
          if (doc && doc.body && doc.body.getAttribute('contenteditable') === 'true') {
            doc.body.focus();
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/html', htmlContent);
            dataTransfer.setData('text/plain', htmlContent);
            
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            });
            doc.body.dispatchEvent(pasteEvent);
            return; // 성공 시 종료
          }
        }
        
        // iframe 방식이 아닐 경우 (div contenteditable)
        const editorDiv = document.querySelector('div[contenteditable="true"]') as HTMLElement;
        if (editorDiv) {
          editorDiv.focus();
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

      // 발행 버튼 클릭 (aria-label="Publish" 또는 "게시")
      const publishBtn = page.locator('div[aria-label="Publish"], div[aria-label="게시"], span:has-text("게시"), span:has-text("Publish")').first();
      if (await publishBtn.isVisible()) {
        await publishBtn.click();
        await page.waitForTimeout(1000);
        
        // 최종 확인 팝업 "Confirm" / "확인"
        const confirmBtn = page.locator('div[aria-label="Confirm"], div[aria-label="확인"], span:has-text("확인"), span:has-text("Confirm")').last();
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
        }
      }

      await page.waitForTimeout(3000);
      console.log('[BlogspotPublisher] 발행 완료!');
      
      await context.close();
      return { success: true, externalUrl: `https://${blogspotId}.blogspot.com/` };
    } catch (error: any) {
      console.error('[BlogspotPublisher] Error:', error);
      await context.close();
      return { success: false, error: error.message };
    }
  }
}
