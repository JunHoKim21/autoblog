import { BasePublisher, PublishParams, PublishResult } from './Publisher.interface';
import { chromium } from 'rebrowser-playwright';
import clipboardy from 'clipboardy';
import path from 'path';
import fs from 'fs';

export class BlogspotPublisher extends BasePublisher {
  async publish(params: PublishParams): Promise<PublishResult> {
    const { title, content, searchDescription } = params;
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
      // 블로그스팟 홈으로 이동 (자동으로 로그인된 메인 블로그 대시보드로 리다이렉트됨)
      await page.goto(`https://www.blogger.com/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // 구글 로그인 감지 (아직 로그인이 안 된 경우)
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

      // 입력받은 blogspotId가 숫자가 아닌 경우(예: publicaidjk), 실제 블로그에 접속해서 고유 숫자 ID를 파싱해옵니다.
      let numericBlogId = blogspotId;
      if (!/^\d+$/.test(blogspotId)) {
        console.log(`[BlogspotPublisher] 입력된 ID('${blogspotId}')가 숫자가 아닙니다. 실제 블로그에서 숫자 ID를 추출합니다...`);
        try {
          await page.goto(`https://${blogspotId}.blogspot.com`, { waitUntil: 'domcontentloaded' });
          const html = await page.content();
          const idMatch = html.match(/blogID=(\d+)/i) || html.match(/feeds\/(\d+)\/posts/i);
          if (idMatch && idMatch[1]) {
            numericBlogId = idMatch[1];
            console.log(`[BlogspotPublisher] 숫자형 블로그 ID 추출 성공: ${numericBlogId}`);
          } else {
            throw new Error('블로그 숫자형 ID를 찾을 수 없습니다.');
          }
        } catch (e) {
          console.log(`[BlogspotPublisher] 블로그 ID 추출 실패, 기본 URL로 강제 이동 시도합니다. 에러: ${e}`);
        }
      }

      // 로그인 완료 후 홈 화면으로 다시 이동하여 확실히 대시보드 안착 
      // (숫자형 ID를 넣으면 구글이 다중 계정인 경우 알아서 /u/4/ 등으로 리다이렉트 해줌)
      await page.goto(`https://www.blogger.com/blog/posts/${numericBlogId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // 새 글 쓰기 버튼 클릭 (Playwright Selector 이슈 우회, Native JS Click)
      console.log('[BlogspotPublisher] 새 글 쓰기 화면으로 이동합니다.');
      try {
        const clicked = await page.evaluate(() => {
          // '새 글' 또는 'New Post' 텍스트를 포함하는 요소 탐색
          const elements = Array.from(document.querySelectorAll('a, div[role="button"], span'));
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.includes('새 글') || text.includes('New Post')) {
              // 해당 요소를 클릭하거나 가장 가까운 클릭 가능한 부모 요소를 클릭
              const target = el.closest('a') || el.closest('[role="button"]') || el;
              (target as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!clicked) {
          console.log('[BlogspotPublisher] 경고: 화면에서 새 글 쓰기 버튼을 찾지 못했습니다.');
        } else {
          console.log('[BlogspotPublisher] 새 글 쓰기 버튼 클릭 성공!');
        }
        
        // 에디터 로딩 대기 (URL 변경 및 DOM 업데이트)
        await page.waitForTimeout(5000); 

      } catch (e) {
        console.log(`[BlogspotPublisher] 새 글 쓰기 버튼 클릭 중 에러 발생: ${e}`);
      }

      console.log('[BlogspotPublisher] 제목과 본문을 입력합니다.');
      
      // 제목 입력
      await page.waitForSelector('input[aria-label="Title"], input[aria-label="제목"], input[placeholder="제목"]', { state: 'visible' });
      await page.locator('input[aria-label="Title"], input[aria-label="제목"], input[placeholder="제목"]').first().click();
      clipboardy.writeSync(title);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      await page.waitForTimeout(500);

      // 본문 HTML의 로컬 이미지(/uploads/...)를 찾아 Base64로 치환 (Blogger 업로드 우회)
      let processedContent = content;
      try {
        const imgRegex = /<img[^>]+src="(\/uploads\/[^"]+)"[^>]*>/g;
        let match;
        while ((match = imgRegex.exec(content)) !== null) {
          const src = match[1];
          const filename = path.basename(src);
          // BlogspotPublisher.ts의 위치는 backend/src/services/publishers 이므로 uploads는 3단계 위
          const localFilePath = path.join(__dirname, '../../../../uploads', filename);
          
          if (fs.existsSync(localFilePath)) {
            const fileData = fs.readFileSync(localFilePath);
            const ext = path.extname(filename).toLowerCase();
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            if (ext === '.gif') mimeType = 'image/gif';
            if (ext === '.webp') mimeType = 'image/webp';
            
            const base64Data = `data:${mimeType};base64,${fileData.toString('base64')}`;
            processedContent = processedContent.replace(src, base64Data);
            console.log(`[BlogspotPublisher] 로컬 이미지 변환 완료: ${filename}`);
          }
        }
      } catch (err) {
        console.error('[BlogspotPublisher] 이미지 Base64 변환 실패:', err);
      }

      // 본문 영역 탐색 및 클릭 후 HTML 주입
      let injected = false;

      // 0. HTML 뷰 모드 시도 (Base64 이미지가 iframe 주입 시 증발하는 문제 방지)
      try {
        console.log('[BlogspotPublisher] HTML 뷰 모드로 전환을 시도합니다.');
        // 왼쪽 상단 연필 모양 아이콘 (작성 뷰) 드롭다운 클릭
        const composeViewBtn = page.locator('div[aria-label="작성 뷰"], div[aria-label="Compose view"]').first();
        if (await composeViewBtn.isVisible()) {
          await composeViewBtn.click();
          await page.waitForTimeout(500);
          
          // HTML 뷰 선택
          const htmlViewBtn = page.locator('text="HTML 뷰"').or(page.locator('text="HTML view"')).first();
          if (await htmlViewBtn.isVisible()) {
            await htmlViewBtn.click();
            await page.waitForTimeout(1500);
            
            // 클립보드에 HTML 소스 복사
            clipboardy.writeSync(processedContent);
            
            // HTML 에디터(보통 커서가 활성화됨) 빈 곳 클릭
            await page.mouse.click(200, 300);
            
            await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
            await page.keyboard.press('Backspace');
            await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
            await page.waitForTimeout(1500);
            
            // 다시 작성 뷰로 복귀
            const htmlViewDropdown = page.locator('div[aria-label="HTML 뷰"], div[aria-label="HTML view"]').first();
            if (await htmlViewDropdown.isVisible()) {
              await htmlViewDropdown.click();
              await page.waitForTimeout(500);
              await page.locator('text="작성 뷰"').or(page.locator('text="Compose view"')).first().click();
              await page.waitForTimeout(1500);
            }
            
            injected = true;
            console.log('[BlogspotPublisher] HTML 뷰 모드에서 본문 주입 및 이미지 변환 완료.');
          }
        }
      } catch (e) {
        console.log('[BlogspotPublisher] HTML 뷰 전환 실패. iframe/div 주입으로 넘어갑니다.');
      }

      // 1. 프레임(iframe) 내부의 body[contenteditable="true"] 탐색 (Blogger 기본 방식)
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const bodyLocator = frame.locator('body[contenteditable="true"], body.editable');
          if (await bodyLocator.count() > 0) {
            await bodyLocator.first().click();
            await page.waitForTimeout(500);
            await frame.evaluate((html) => {
              document.execCommand('insertHTML', false, html);
            }, processedContent);
            injected = true;
            console.log('[BlogspotPublisher] 본문 iframe 영역에 HTML 삽입 완료.');
            break;
          }
        } catch (e) {
          // Cross-origin 프레임 등 접근 불가 예외 무시
        }
      }

      // 2. 만약 iframe이 없다면 메인 페이지의 div[contenteditable="true"] 탐색
      if (!injected) {
        const divLocator = page.locator('div[contenteditable="true"], .ProseMirror');
        if (await divLocator.count() > 0) {
          await divLocator.first().click();
          await page.waitForTimeout(500);
          await page.evaluate((html) => {
            document.execCommand('insertHTML', false, html);
          }, processedContent);
          injected = true;
          console.log('[BlogspotPublisher] 본문 div 영역에 HTML 삽입 완료.');
        }
      }

      // 3. 둘 다 실패했을 경우, 무식하게 붙여넣기 (사용자 클릭 우회)
      if (!injected) {
        console.log('[BlogspotPublisher] 경고: 본문 영역을 명시적으로 찾지 못해 강제 붙여넣기를 시도합니다.');
        clipboardy.writeSync(processedContent);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(500);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      }
      await page.waitForTimeout(1000);

      // 검색 설명 (Search Description) 자동 입력
      if (searchDescription) {
        try {
          console.log('[BlogspotPublisher] 검색 설명 입력 시도...');
          // 사이드바의 '검색 설명' 버튼 (정확한 텍스트 매칭)
          const searchDescBtn = page.locator('text="검색 설명"').or(page.locator('text="Search description"')).first();
          if (await searchDescBtn.isVisible()) {
            await searchDescBtn.click();
            await page.waitForTimeout(500);
            
            const searchDescTextarea = page.locator('textarea[aria-label="Search description"], textarea[aria-label="검색 설명"]').first();
            if (await searchDescTextarea.isVisible()) {
              await searchDescTextarea.fill(searchDescription);
              console.log('[BlogspotPublisher] 검색 설명 입력 완료.');
            }
          } else {
            console.log('[BlogspotPublisher] 검색 설명 설정이 비활성화되어 입력 건너뜀.');
          }
        } catch (err) {
          console.log('[BlogspotPublisher] 검색 설명 입력 에러(무시됨):', err);
        }
      }

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
