import os
import json
import time
import base64
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

import google.generativeai as genai
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from config import load_settings

# ==========================================
# 환경 설정 및 초기화
# ==========================================
load_dotenv()

SCOPES = ['https://www.googleapis.com/auth/blogger']

def get_dynamic_config():
    settings = load_settings()
    gemini_key = settings.get("gemini_api_key") or os.getenv("GEMINI_API_KEY")
    hf_key = settings.get("hf_api_key") or os.getenv("HF_API_KEY")
    blog_id = settings.get("blog_id") or os.getenv("BLOG_ID")
    system_prompt = settings.get("system_prompt")
    return gemini_key, hf_key, blog_id, system_prompt


def step2_refine_and_extract(draft):
    """Step 2: 최종 HTML 생성 및 프롬프트 추출"""
    gemini_key, _, _, user_prompt = get_dynamic_config()
    
    try:
        from config import get_base_prompt
        base_prompt = get_base_prompt()
        
        # 동적 프롬프트 사용
        prompt = base_prompt.replace("{draft}", draft)
        
        if user_prompt and user_prompt.strip():
            parts = prompt.split("------------------------------------")
            if len(parts) >= 2:
                prompt = parts[0] + "\n[사용자 추가 지시사항]\n" + user_prompt.strip() + "\n\n------------------------------------\n" + parts[1]
            else:
                prompt = prompt + "\n\n[사용자 추가 지시사항]\n" + user_prompt.strip()
        
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        max_retries = 4
        response = None
        for attempt in range(max_retries):
            try:
                response = model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(response_mime_type="application/json")
                )
                
                # 마크다운 찌꺼기 제거 및 JSON 파싱 시도
                raw_text = response.text.strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                elif raw_text.startswith("```"):
                    raw_text = raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                    
                result = json.loads(raw_text.strip())
                break # 파싱 성공하면 루프 탈출
            except Exception as e:
                if "429" in str(e):
                    if attempt < max_retries - 1:
                        print(f"API Rate limit (429) hit. Retrying in 65 seconds... (Attempt {attempt+1}/{max_retries})")
                        time.sleep(65)
                    else:
                        raise Exception("구글 Gemini API 일일 무료 사용량 또는 분당 요청 한도를 초과했습니다. 잠시 대기 후 다시 시도하시거나, 구글 API 콘솔에서 한도를 확인해주세요.")
                elif "JSONDecodeError" in str(type(e).__name__) and attempt < max_retries - 1:
                    print(f"JSON 문법 오류 발생. 다시 생성 시도합니다... (Attempt {attempt+1}/{max_retries})")
                    time.sleep(2)
                else:
                    if attempt == max_retries - 1:
                        raise e
                    
        return result
    except Exception as e:
        raise Exception(f"최종본 및 데이터 추출 중 에러 발생: {e}")


def generate_image_hf(prompt, save_path, hf_key):
    """우선 순위 1: Hugging Face API로 이미지 생성"""
    API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"
    headers = {"Authorization": f"Bearer {hf_key}"}
    payload = {"inputs": prompt}
    
    response = requests.post(API_URL, headers=headers, json=payload)
    if response.status_code == 200:
        with open(save_path, 'wb') as f:
            f.write(response.content)
        return True
    else:
        return False


def generate_image_pollinations(prompt, save_path):
    """우선 순위 2 (백업): Pollinations AI로 이미지 생성"""
    safe_prompt = requests.utils.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{safe_prompt}?width=1024&height=1024&nologo=true"
    
    response = requests.get(url)
    if response.status_code == 200:
        with open(save_path, 'wb') as f:
            f.write(response.content)
        return True
    else:
        return False


def step3_generate_images(prompts):
    """Step 3: 무료 이미지 생성 및 백업 로직"""
    _, hf_key, _, _ = get_dynamic_config()
    image_paths = []
    
    os.makedirs("images", exist_ok=True)
    
    for i, prompt in enumerate(prompts):
        save_path = f"images/image_{i+1}.jpg"
        success = False
        
        # 1. Hugging Face 시도
        if hf_key:
            for attempt in range(1, 4):
                try:
                    if generate_image_hf(prompt, save_path, hf_key):
                        success = True
                        break
                    else:
                        if attempt < 3:
                            time.sleep(5)
                except Exception:
                    if attempt < 3:
                        time.sleep(5)
                        
        # 2. Pollinations AI 백업 시도
        if not success:
            try:
                if generate_image_pollinations(prompt, save_path):
                    success = True
            except Exception:
                pass
                
        if success:
            image_paths.append(save_path)
            
    return image_paths


def upload_image_to_host(file_path):
    """Blogger가 Base64를 차단하므로, 무료 이미지 호스팅에 업로드하고 URL을 반환"""
    try:
        url = "https://catbox.moe/user/api.php"
        data = {"reqtype": "fileupload"}
        with open(file_path, "rb") as f:
            files = {"fileToUpload": f}
            response = requests.post(url, data=data, files=files, timeout=30)
        
        if response.status_code == 200:
            return response.text.strip()
    except Exception as e:
        print(f"이미지 호스팅 업로드 실패: {e}")
    return None


def get_blogger_service():
    """Blogger API 서비스 객체 생성 (OAuth 2.0 인증)"""
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists('client_secret.json'):
                raise FileNotFoundError("Blogger API 인증을 위한 'client_secret.json' 파일이 없습니다. 구글 클라우드에서 다운받아 주세요.")
            flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    return build('blogger', 'v3', credentials=creds)


def step4_post_to_blogger(title, html_content, meta_desc, image_paths, custom_scheduled_time=None):
    """Step 4: Blogger API로 예약 포스팅"""
    _, _, blog_id, _ = get_dynamic_config()
    if not blog_id:
        raise Exception("Blogger ID가 설정되지 않았습니다. 환경 설정에서 확인해 주세요.")
        
    try:
        service = get_blogger_service()
        
        # 이미지를 호스팅 서버에 업로드하고 HTML 태그로 변환
        img_htmls = []
        for path in image_paths:
            hosted_url = upload_image_to_host(path)
            if hosted_url:
                img_htmls.append(f'<div style="text-align: center; margin: 25px 0;"><img src="{hosted_url}" alt="Generated Image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>')
            else:
                with open(path, "rb") as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
                    img_htmls.append(f'<div style="text-align: center; margin: 25px 0;"><img src="data:image/jpeg;base64,{encoded_string}" alt="Generated Image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>')
                
        # 최종 본문 결합
        final_content = html_content
        
        # Blogger API 우회: 본문 최상단에 검색 설명 삽입
        if meta_desc:
            intro_html = f'<div style="background-color: #f8f9fa; border-left: 4px solid #4CAF50; padding: 15px; margin-bottom: 20px; font-size: 0.95em; color: #555;"><strong>💡 핵심 요약:</strong> {meta_desc}</div>'
            final_content = intro_html + final_content
            
        if len(img_htmls) > 0:
            if "<!-- IMAGE_1 -->" in final_content:
                final_content = final_content.replace("<!-- IMAGE_1 -->", img_htmls[0])
            else:
                final_content = img_htmls[0] + "<br>" + final_content
                
        if len(img_htmls) > 1:
            if "<!-- IMAGE_2 -->" in final_content:
                final_content = final_content.replace("<!-- IMAGE_2 -->", img_htmls[1])
            else:
                final_content = final_content + "<br>" + img_htmls[1]
        
        if custom_scheduled_time:
            scheduled_time = custom_scheduled_time
        else:
            now = datetime.now()
            tomorrow = now + timedelta(days=1)
            scheduled_time = tomorrow.replace(hour=9, minute=0, second=0, microsecond=0)
            
        published_str = scheduled_time.astimezone().isoformat()
        
        post_body = {
            "kind": "blogger#post",
            "title": title,
            "content": final_content,
            "published": published_str,
            "customMetaData": meta_desc
        }
        
        request = service.posts().insert(blogId=blog_id, body=post_body, isDraft=False)
        response = request.execute()
        
        return response.get('url'), response.get('id')
        
    except Exception as e:
        raise Exception(f"블로그 발행 중 에러 발생: {e}")


def run_automation(draft, custom_scheduled_time=None):
    """웹 서버에서 호출하는 메인 파이프라인 함수"""
    if not draft or not draft.strip():
        return {"success": False, "error": "초안 내용이 없습니다."}

    try:
        # Step 2: HTML 및 데이터 추출
        extracted_data = step2_refine_and_extract(draft)
        
        title = extracted_data.get("title", "블로그 포스트 완벽 가이드")
        html_content = extracted_data.get("html_content", "")
        prompts = extracted_data.get("prompts", [])
        meta_desc = extracted_data.get("meta_description", "")
        
        # 프롬프트 보충
        while len(prompts) < 2:
            prompts.append("A beautiful cinematic abstract background image, high resolution, 8k")

        # Step 3: 무료 이미지 생성
        image_paths = step3_generate_images(prompts[:2])

        # Step 4: 예약 포스팅
        post_url, post_id = step4_post_to_blogger(title, html_content, meta_desc, image_paths, custom_scheduled_time)
        
        _, _, blog_id, _ = get_dynamic_config()
        admin_url = f"https://www.blogger.com/blog/posts/{blog_id}"
        
        return {
            "success": True,
            "url": admin_url,
            "public_url": post_url,
            "title": title,
            "message": "성공적으로 예약 포스팅되었습니다!"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
