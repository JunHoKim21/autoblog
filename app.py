from flask import Flask, render_template, request, jsonify
from datetime import datetime
from pipeline import run_automation
import threading
import time

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

import requests

import queue

from config import load_settings, save_settings, reset_prompt

# Telegram 관련 설정은 동적으로 가져옵니다.
def get_telegram_config():
    settings = load_settings()
    # 설정 파일에 값이 없으면 기존 환경 변수 또는 하드코딩된 값을 임시로 사용
    token = settings.get("telegram_bot_token") or "8872255158:AAHk_HYm00FJsT3q9l-L1bIiL0SVCIIzcUE"
    chat_id = settings.get("telegram_chat_id") or "8707269667"
    return token, chat_id

# 전역 작업 대기열(Queue) 생성
task_queue = queue.Queue()

def send_telegram_message(message):
    try:
        token, chat_id = get_telegram_config()
        if not token or not chat_id:
            print("Telegram 설정이 누락되어 메시지를 전송하지 않습니다.")
            return
            
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML"
        }
        response = requests.post(url, json=payload)
        if response.status_code != 200:
            print(f"Telegram 전송 실패: {response.text}")
    except Exception as e:
        print(f"Telegram 전송 에러: {e}")

def worker_thread():
    while True:
        # 대기열에서 작업을 하나씩 꺼내옵니다.
        draft, custom_scheduled_time = task_queue.get()
        try:
            result = run_automation(draft, custom_scheduled_time)
            if result.get("success"):
                title = result.get('title', '제목 없음')
                url = result.get('url', '#')
                msg = f"✅ <b>[블로그 포스팅 성공]</b>\n\n<b>제목:</b> {title}\n성공적으로 예약 발행되었습니다!\n👉 <a href='{url}'>글 확인하기</a>\n\n대기열 남은 작업 수: {task_queue.qsize()}개"
            else:
                msg = f"❌ <b>[블로그 포스팅 실패]</b>\n\n에러 원인:\n{result.get('error')}\n\n대기열 남은 작업 수: {task_queue.qsize()}개"
            send_telegram_message(msg)
        except Exception as e:
            send_telegram_message(f"❌ <b>[블로그 포스팅 시스템 에러]</b>\n\n치명적 에러:\n{e}\n\n대기열 남은 작업 수: {task_queue.qsize()}개")
        finally:
            task_queue.task_done()
            # API 제한을 피하기 위해 다음 작업 전 10초 대기
            time.sleep(10)

# 백그라운드 워커 스레드 시작 (서버 시작 시 1명만 생성)
thread = threading.Thread(target=worker_thread)
thread.daemon = True
thread.start()

@app.route('/api/run', methods=['POST'])
def api_run():
    data = request.json
    if not data:
        return jsonify({"success": False, "error": "데이터가 없습니다."}), 400
        
    draft = data.get('draft', '')
    scheduled_time_str = data.get('scheduled_time', '')
    
    custom_scheduled_time = None
    if scheduled_time_str:
        try:
            custom_scheduled_time = datetime.strptime(scheduled_time_str, "%Y-%m-%dT%H:%M")
        except ValueError:
            pass
            
    # 대기열(Queue)에 작업 추가
    task_queue.put((draft, custom_scheduled_time))
    
    return jsonify({
        "success": True, 
        "message": f"대기열에 추가되었습니다! (현재 대기 중인 작업: {task_queue.qsize()}개)\n완료 시 텔레그램으로 알려드립니다."
    })

@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    if request.method == 'GET':
        return jsonify(load_settings())
    else:
        new_settings = request.json
        save_settings(new_settings)
        return jsonify({"success": True, "message": "설정이 성공적으로 저장되었습니다."})

@app.route('/api/settings/reset_prompt', methods=['POST'])
def api_reset_prompt():
    default_prompt = reset_prompt()
    return jsonify({"success": True, "prompt": default_prompt})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
