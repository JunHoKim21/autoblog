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

# ==========================================
# 환경 설정 및 초기화
# ==========================================
# .env 파일 로드
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
HF_API_KEY = os.getenv("HF_API_KEY")
BLOG_ID = os.getenv("BLOG_ID")

# Blogger API 스코프
SCOPES = ['https://www.googleapis.com/auth/blogger']


def print_step(step_num, message):
    """콘솔 출력을 깔끔하게 포매팅하는 헬퍼 함수"""
    print(f"\n[{'='*10} Step {step_num}: {message} {'='*10}]")


def step1_generate_draft(topic):
    """Step 1: Gemini API를 이용해 초안 작성"""
    print_step("1", "초안 작성 (Gemini API)")
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""
        당신은 전문적인 블로그 마케터이자 작가입니다.
        주어진 주제에 대해 사람들의 이목을 끄는 흥미롭고 유익한 블로그 포스트 초안을 작성해주세요.
        주제: {topic}
        """
        print(f"'{topic}' 주제로 초안 생성을 요청합니다...")
        response = model.generate_content(prompt)
        print("✅ 초안 생성이 완료되었습니다.")
        return response.text
    except Exception as e:
        print(f"❌ [Error] Step 1 초안 작성 중 에러 발생: {e}")
        return None


def step2_refine_and_extract(draft):
    """Step 2: 최종 HTML 생성 및 프롬프트 추출"""
    print_step("2", "최종본 완성 및 프롬프트 추출 (Gemini API)")
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"""
        다음 블로그 초안을 바탕으로 다음 4가지 요소를 JSON 형식으로 반환해 주세요.
        1. "title": 사람들의 클릭을 유도하는 매력적인 블로그 제목
        2. "html_content": 블로그에 바로 올릴 수 있는 최종 HTML 포맷의 글 (<h1>, <p>, <ul> 등 태그 사용, <body> 태그 생략)
        3. "prompts": 이 글의 내용과 어울리는 고품질 이미지 생성을 위한 '영문 프롬프트' 2개 (리스트 형태)
        4. "meta_description": 검색 엔진 최적화(SEO)를 위한 150자 이내의 메타 디스크립션

        초안:
        {draft}

        반드시 유효한 JSON 형식으로만 응답해주세요. 마크다운 코드블록 없이 순수 JSON만 반환해야 합니다.
        """
        print("최종 HTML 및 프롬프트 추출을 요청합니다...")
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(response_mime_type="application/json")
        )
        
        result = json.loads(response.text)
        print("✅ 최종본 및 프롬프트 추출이 완료되었습니다.")
        return result
    except Exception as e:
        print(f"❌ [Error] Step 2 최종본 생성 중 에러 발생: {e}")
        return None


def generate_image_hf(prompt, save_path):
    """우선 순위 1: Hugging Face API로 이미지 생성"""
    API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"
    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    payload = {"inputs": prompt}
    
    response = requests.post(API_URL, headers=headers, json=payload)
    if response.status_code == 200:
        with open(save_path, 'wb') as f:
            f.write(response.content)
        return True
    else:
        print(f"Hugging Face API 에러 ({response.status_code}): {response.text}")
        return False


def generate_image_pollinations(prompt, save_path):
    """우선 순위 2 (백업): Pollinations AI로 이미지 생성"""
    safe_prompt = requests.utils.quote(prompt)
    # 이미지 생성 옵션 조정 (1024x1024, 시드값 임의 지정 등)
    url = f"https://image.pollinations.ai/prompt/{safe_prompt}?width=1024&height=1024&nologo=true"
    
    response = requests.get(url)
    if response.status_code == 200:
        with open(save_path, 'wb') as f:
            f.write(response.content)
        return True
    else:
        print(f"Pollinations AI 에러 ({response.status_code})")
        return False


def step3_generate_images(prompts):
    """Step 3: 무료 이미지 생성 및 백업 로직"""
    print_step("3", "무료 이미지 생성 및 백업 로직")
    image_paths = []
    
    os.makedirs("images", exist_ok=True)
    
    for i, prompt in enumerate(prompts):
        save_path = f"images/image_{i+1}.jpg"
        print(f"▶ 이미지 {i+1} 생성 시도 중... (프롬프트: '{prompt}')")
        
        success = False
        
        # 1. Hugging Face 시도
        if HF_API_KEY:
            for attempt in range(1, 4):
                print(f"[Hugging Face] 시도 {attempt}/3...")
                try:
                    if generate_image_hf(prompt, save_path):
                        success = True
                        print(f"✅ 이미지 {i+1} 저장 성공: {save_path}")
                        break
                    else:
                        if attempt < 3:
                            print("⏳ 서버 트래픽 이슈 등 실패 발생. 30초 대기 후 재시도합니다...")
                            time.sleep(30)
                except Exception as e:
                    print(f"Hugging Face 요청 중 예외 발생: {e}")
                    if attempt < 3:
                        time.sleep(30)
        else:
            print("HF_API_KEY가 없어 바로 Pollinations AI 백업으로 넘어갑니다.")
            
        # 2. Pollinations AI 백업 시도
        if not success:
            print(f"[Pollinations AI] 백업 이미지 생성을 시도합니다...")
            try:
                if generate_image_pollinations(prompt, save_path):
                    print(f"✅ 이미지 {i+1} 저장 성공 (Pollinations): {save_path}")
                    success = True
            except Exception as e:
                print(f"Pollinations AI 요청 중 예외 발생: {e}")
                
        if success:
            image_paths.append(save_path)
        else:
            print(f"❌ [Error] 이미지 {i+1} 생성에 최종 실패했습니다.")
            
    return image_paths


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
                raise FileNotFoundError("Blogger API 인증을 위한 'client_secret.json' 파일이 없습니다. Google Cloud Console에서 다운로드 받아주세요.")
            flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    return build('blogger', 'v3', credentials=creds)


def step4_post_to_blogger(title, html_content, meta_desc, image_paths, custom_scheduled_time=None):
    """Step 4: Blogger API로 예약 포스팅"""
    print_step("4", "블로그스팟 예약 발행 (Google Blogger API v3)")
    try:
        service = get_blogger_service()
        
        # Base64 인코딩으로 이미지를 HTML 본문에 추가
        images_html = ""
        for path in image_paths:
            with open(path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
                # 본문에 삽입될 이미지 마크업
                images_html += f'<div style="text-align: center;"><img src="data:image/jpeg;base64,{encoded_string}" alt="Generated Image" style="max-width: 100%; height: auto; margin-bottom: 20px; border-radius: 8px;"></div>\n<br>\n'
                
        # 최종 본문 결합 (이미지 뒤에 글 내용)
        final_content = images_html + html_content
        
        if custom_scheduled_time:
            scheduled_time = custom_scheduled_time
        else:
            # 기본값: 내일 오전 9시 예약 (시스템 로컬 시간 기준)
            now = datetime.now()
            tomorrow = now + timedelta(days=1)
            scheduled_time = tomorrow.replace(hour=9, minute=0, second=0, microsecond=0)
            
        # RFC 3339 포맷 (예: 2024-05-20T09:00:00+09:00)
        published_str = scheduled_time.astimezone().isoformat()
        
        print(f"예약 발행 예정 시간: {published_str}")
        
        post_body = {
            "kind": "blogger#post",
            "title": title,
            "content": final_content,
            "published": published_str,
            "customMetaData": meta_desc
        }
        
        print("Blogger API로 포스트 전송 중...")
        request = service.posts().insert(blogId=BLOG_ID, body=post_body, isDraft=False)
        response = request.execute()
        
        print("✅ 블로그 포스팅이 성공적으로 예약되었습니다!")
        print(f"🔗 포스트 URL: {response.get('url')}")
        
    except Exception as e:
        print(f"❌ [Error] Step 4 블로그 발행 중 에러 발생: {e}")


def main():
    print("=" * 50)
    print("🤖 AI 자동 블로그 포스팅 봇 (초안 제공 버전) 🤖")
    print("=" * 50)
    
    draft_file = "draft.txt"
    if not os.path.exists(draft_file):
        print(f"⚠️ '{draft_file}' 파일이 없습니다. 스크립트와 같은 폴더에 '{draft_file}' 파일을 만들고 초안을 적어주세요.")
        return
        
    with open(draft_file, "r", encoding="utf-8") as f:
        draft = f.read().strip()
        
    if not draft or draft.startswith("여기에 블로그에 올릴 글의 초안을"):
        print(f"⚠️ '{draft_file}' 파일에 초안 내용이 비어있거나 기본 문구입니다. 내용을 적고 다시 실행해주세요.")
        return
        
    print(f"✅ '{draft_file}'에서 초안 내용을 성공적으로 읽어왔습니다.")

    time_input = input("\n⏰ 예약 발행 시간을 입력하세요 (형식: YYYY-MM-DD HH:MM, 빈칸 시 내일 오전 9시): ")
    custom_scheduled_time = None
    if time_input.strip():
        try:
            custom_scheduled_time = datetime.strptime(time_input.strip(), "%Y-%m-%d %H:%M")
        except ValueError:
            print("⚠️ 시간 형식이 잘못되었습니다. 기본값(내일 오전 9시)으로 진행합니다.")

    # Step 2: HTML 및 데이터 추출 (Step 1 생략)
    extracted_data = step2_refine_and_extract(draft)
    if not extracted_data:
        return
        
    title = extracted_data.get("title", "블로그 포스트 완벽 가이드")
    html_content = extracted_data.get("html_content", "")
    prompts = extracted_data.get("prompts", [])
    meta_desc = extracted_data.get("meta_description", "")
    
    # 프롬프트가 2개 미만일 경우 기본값 보충
    while len(prompts) < 2:
        prompts.append("A beautiful cinematic abstract background image, high resolution, 8k")

    # Step 3: 무료 이미지 생성
    # 메모리/디스크 절약을 위해 2개의 프롬프트만 사용
    image_paths = step3_generate_images(prompts[:2])

    if not image_paths:
        print("⚠️ 생성된 이미지가 없습니다. 글만 업로드합니다.")

    # Step 4: 예약 포스팅
    step4_post_to_blogger(title, html_content, meta_desc, image_paths, custom_scheduled_time)
    
    print("\n🎉 모든 파이프라인 처리가 완료되었습니다!")


if __name__ == "__main__":
    main()
