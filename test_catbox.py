import requests

def upload_to_catbox(file_path):
    url = "https://catbox.moe/user/api.php"
    data = {"reqtype": "fileupload"}
    with open(file_path, "rb") as f:
        files = {"fileToUpload": f}
        response = requests.post(url, data=data, files=files)
    
    if response.status_code == 200:
        print("Upload successful:", response.text)
    else:
        print("Upload failed:", response.status_code, response.text)

# create a dummy image
with open("test.jpg", "wb") as f:
    f.write(b"dummy data")

upload_to_catbox("test.jpg")
