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

      // 본문에서 로컬 이미지 태그를 제거 (드롭으로 삽입할 것이므로 중복 방지)
      let processedContent = content.replace(/<img[^>]+src="(\/uploads\/[^"]+)"[^>]*>/g, '');

      // 본문 영역 탐색 및 클릭 후 HTML 주입
      let injected = false;

      // 0. (삭제됨) HTML 뷰 전환 로직은 불안정하므로 사용하지 않음.

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

      // 이미지 구글 피커 업로드 (드래그앤드롭 실패 대비 확실한 방법)
      if (params.mediaPaths && params.mediaPaths.length > 0) {
        console.log('[BlogspotPublisher] 로컬 이미지를 구글 피커(컴퓨터에서 업로드)를 통해 확실하게 업로드합니다.');
        try {
          // 1. 툴바에서 이미지 삽입 버튼 클릭
          const insertImageBtn = page.locator('div[aria-label="이미지 삽입"], div[aria-label="Insert image"], div[data-tooltip="이미지 삽입"], span:has-text("이미지 삽입")').filter({ visible: true }).first();
          if (await insertImageBtn.isVisible()) {
            await insertImageBtn.click();
            await page.waitForTimeout(1000);
            
            // 2. 컴퓨터에서 업로드 클릭
            const uploadFromComputerBtn = page.locator('text="컴퓨터에서 업로드"').or(page.locator('text="Upload from computer"')).filter({ visible: true }).first();
            await uploadFromComputerBtn.click();
            await page.waitForTimeout(3000); // iframe 로딩 대기
            
            // 3. Picker iframe 찾기
            const pickerFrame = page.frameLocator('iframe.picker-frame, iframe.picker, iframe[src*="docs.google.com/picker"]');
            
            // 로컬 파일 절대 경로 배열 생성
            const filePathsToUpload = [];
            for (const media of params.mediaPaths) {
              const filename = path.basename(media);
              const localPath = path.join(__dirname, '../../../../uploads', filename);
              if (fs.existsSync(localPath)) {
                filePathsToUpload.push(localPath);
              }
            }
            
            if (filePathsToUpload.length > 0) {
              // 4. input[type="file"]에 파일 업로드
              await pickerFrame.locator('input[type="file"]').setInputFiles(filePathsToUpload);
              console.log(`[BlogspotPublisher] ${filePathsToUpload.length}개 파일 선택 완료, 구글 서버 업로드 진행 중...`);
              
              // 5. 업로드 완료 대기 (사진 용량에 따라 다를 수 있으므로 넉넉히 대기)
              await page.waitForTimeout(7000); 
              
              // 6. 선택 버튼 클릭 (선택, Select 등)
              // 보통 좌측 하단에 파란색 버튼으로 존재합니다.
              const selectBtn = pickerFrame.locator('div[role="button"]:has-text("선택"), div[role="button"]:has-text("Select")').filter({ visible: true }).last();
              await selectBtn.click();
              console.log('[BlogspotPublisher] 구글 피커를 통한 이미지 본문 삽입 완료.');
              await page.waitForTimeout(3000); // 본문에 렌더링될 시간 대기
            }
          } else {
            console.log('[BlogspotPublisher] 이미지 삽입 툴바 버튼을 찾을 수 없습니다.');
          }
        } catch (e) {
          console.error('[BlogspotPublisher] 구글 피커 이미지 업로드 중 에러 발생:', e);
        }
      }

      // 검색 설명 (Search Description) 자동 입력
      if (searchDescription) {
        try {
          console.log('[BlogspotPublisher] 검색 설명 입력 시도...');
          // 사이드바의 '검색 설명' 버튼 (정확한 텍스트 매칭)
          const searchDescBtn = page.locator('text="검색 설명"').or(page.locator('text="Search description"')).first();
          if (await searchDescBtn.isVisible()) {
            await searchDescBtn.click();
            await page.waitForTimeout(1000);
            
            // textarea를 넓은 범위로 찾기
            const searchDescTextarea = page.locator('textarea[aria-label="Search description"], textarea[aria-label="검색 설명"], textarea').last();
            if (await searchDescTextarea.isVisible()) {
              await searchDescTextarea.fill(searchDescription);
              console.log('[BlogspotPublisher] 검색 설명 입력 완료.');
            } else {
              console.log('[BlogspotPublisher] 검색 설명 textarea를 찾을 수 없습니다.');
            }
          } else {
            console.log('[BlogspotPublisher] 검색 설명 설정이 비활성화되어 입력 건너뜀.');
          }
        } catch (err) {
          console.log('[BlogspotPublisher] 검색 설명 입력 에러(무시됨):', err);
        }
      }

      // 발행 버튼 클릭 (aria-label="Publish" 또는 "게시")
      console.log('[BlogspotPublisher] 발행(게시) 버튼 클릭 시도...');
      const publishBtn = page.locator('div[aria-label="Publish"], div[aria-label="게시"]')
        .or(page.getByText('게시', { exact: true }))
        .or(page.getByText('Publish', { exact: true }))
        .filter({ visible: true })
        .first();
        
      if (await publishBtn.count() > 0) {
        await publishBtn.click();
        await page.waitForTimeout(1500);
        
        // 최종 확인 팝업 "Confirm" / "확인"
        console.log('[BlogspotPublisher] 발행 확인 팝업 클릭 시도...');
        const confirmBtn = page.locator('div[aria-label="Confirm"], div[aria-label="확인"]')
          .or(page.getByText('확인', { exact: true }))
          .or(page.getByText('Confirm', { exact: true }))
          .filter({ visible: true })
          .first();
          
        if (await confirmBtn.isVisible({ timeout: 3000 })) {
          await confirmBtn.click();
          console.log('[BlogspotPublisher] 최종 발행 확인 완료.');
        } else {
          console.log('[BlogspotPublisher] 발행 확인 팝업이 뜨지 않거나 찾을 수 없습니다.');
        }
      } else {
        console.log('[BlogspotPublisher] 발행 버튼을 찾을 수 없습니다.');
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
