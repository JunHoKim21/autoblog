import { BasePublisher, PublishParams, PublishResult } from './Publisher.interface';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

export class BlogspotPublisher extends BasePublisher {
  async publish(params: PublishParams): Promise<PublishResult> {
    const { title, content, mediaPaths } = params;
    const { supabaseUrl, supabaseKey, googleClientId, googleClientSecret, googleRefreshToken, blogspotId } = this.config;

    try {
      let modifiedContent = content;

      // 1. Supabase 이미지 업로드 및 치환
      if (supabaseUrl && supabaseKey && mediaPaths && mediaPaths.length > 0) {
        const supabase = createClient(supabaseUrl, supabaseKey);

        for (const localPath of mediaPaths) {
          const fileBuffer = fs.readFileSync(localPath);
          const fileName = Date.now() + '_' + path.basename(localPath);
          
          const { error } = await supabase.storage
            .from('blog-images')
            .upload(fileName, fileBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (!error) {
            const { data: { publicUrl } } = supabase.storage
              .from('blog-images')
              .getPublicUrl(fileName);
              
            // 윈도우 환경 대응: localPath의 슬래시 방향 등이 에디터와 일치하지 않을 수 있으므로 파일명 또는 부분 매칭으로 치환
            // 여기서는 단순 replace 사용 (프론트엔드에서 넘어오는 경로 문자열과 정확히 일치해야 함)
            modifiedContent = modifiedContent.replace(localPath, publicUrl);
          } else {
            console.error('[BlogspotPublisher] Supabase upload error:', error);
          }
        }
      }

      // 2. Google Blogger API 연동
      if (!googleClientId || !googleClientSecret || !googleRefreshToken || !blogspotId) {
        throw new Error('Google OAuth 정보 또는 Blogspot ID가 누락되었습니다.');
      }

      const oauth2Client = new google.auth.OAuth2(googleClientId, googleClientSecret);
      oauth2Client.setCredentials({ refresh_token: googleRefreshToken });
      
      const blogger = google.blogger({ version: 'v3', auth: oauth2Client });

      const result = await blogger.posts.insert({
        blogId: blogspotId,
        requestBody: { 
          title: title, 
          content: modifiedContent 
        }
      });

      return { success: true, externalUrl: result.data.url || 'https://www.blogger.com' };
    } catch (error: any) {
      console.error('[BlogspotPublisher] Error:', error);
      return { success: false, error: error.message };
    }
  }
}
