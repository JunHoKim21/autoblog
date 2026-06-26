import os
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def check_blogger_meta():
    try:
        if os.path.exists('token.json'):
            creds = Credentials.from_authorized_user_file('token.json')
            service = build('blogger', 'v3', credentials=creds)
            
            # Fetch the user's blogs
            blogs = service.blogs().listByUser(userId='self').execute()
            if not blogs.get('items'):
                print("No blogs found.")
                return
            
            blog_id = blogs['items'][0]['id']
            
            # Create a test draft post with customMetaData
            post_body = {
                "kind": "blogger#post",
                "title": "Test Meta Description",
                "content": "<p>Testing custom meta data.</p>",
                "customMetaData": "This is a test search description."
            }
            
            request = service.posts().insert(blogId=blog_id, body=post_body, isDraft=False)
            response = request.execute()
            
            post_id = response.get('id')
            print(f"Created Post ID: {post_id}")
            print(f"customMetaData after insert: {response.get('customMetaData')}")
            
            # Try updating
            update_body = {"customMetaData": "Updated search description via PATCH"}
            update_request = service.posts().patch(blogId=blog_id, postId=post_id, body=update_body)
            update_response = update_request.execute()
            print(f"customMetaData after patch: {update_response.get('customMetaData')}")
            
    except Exception as e:
        print(f"Error: {e}")

check_blogger_meta()
