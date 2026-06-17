import { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from 'prosemirror-state';

const EditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [mediaPaths, setMediaPaths] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Image.extend({
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('eventHandler'),
              props: {
                handleDrop: (view, event, _slice, moved) => {
                  if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
                    const file = event.dataTransfer.files[0];
                    if (!file.type.startsWith('image/')) return false;

                    event.preventDefault();

                    const formData = new FormData();
                    formData.append('image', file);
                    
                    axios.post('/api/upload', formData).then(res => {
                      const { imageUrl, localPath } = res.data;
                      
                      const { schema } = view.state;
                      const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                      const node = schema.nodes.image.create({ src: imageUrl });
                      const transaction = view.state.tr.insert(coordinates?.pos || 0, node);
                      view.dispatch(transaction);
                      
                      setMediaPaths(prev => [...prev, localPath]);
                    }).catch(err => {
                      console.error('Image upload failed', err);
                    });
                    
                    return true;
                  }
                  return false;
                }
              }
            })
          ];
        }
      })
    ],
    content: '<p>내용을 작성하세요. 사진을 드래그 앤 드롭하면 서버에 안전하게 업로드됩니다.</p>',
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[400px]',
      },
    },
  });

  useEffect(() => {
    if (id && editor) {
      axios.get(`/api/posts/${id}`).then(res => {
        const post = res.data.post;
        setTitle(post.title);
        if (post.content) {
          editor.commands.setContent(post.content);
        }
        setMediaPaths(JSON.parse(post.mediaPaths || '[]'));
        if (post.scheduledAt) {
          // Format ISO string to YYYY-MM-DDTHH:mm
          const localTime = new Date(new Date(post.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          setScheduledAt(localTime);
        }
      }).catch(err => {
        console.error('Failed to load post:', err);
        alert('글 정보를 불러오는데 실패했습니다.');
        navigate('/dashboard');
      });
    }
  }, [id, editor, navigate]);

  const handlePublish = async (isImmediate: boolean) => {
    if (!title || !editor?.getHTML()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    
    if (!isImmediate && !scheduledAt) {
      alert('발행 예약 시간을 설정해주세요. 즉시 발행을 원하시면 [즉시 발송하기] 버튼을 눌러주세요.');
      return;
    }
    
    try {
      const payload = {
        title,
        content: editor.getHTML(),
        mediaPaths,
        scheduledAt: isImmediate ? null : scheduledAt,
        platforms: ['NAVER', 'TISTORY', 'BLOGSPOT']
      };

      if (id) {
        await axios.put(`/api/posts/${id}`, payload);
        alert(isImmediate ? '즉시 발송이 요청되었습니다!' : '글 수정 및 예약이 완료되었습니다!');
        navigate('/dashboard');
      } else {
        await axios.post('/api/posts', payload);
        alert(isImmediate ? '즉시 발송이 요청되었습니다!' : '발행이 예약되었습니다!');
        setTitle('');
        editor.commands.setContent('');
        setMediaPaths([]);
        setScheduledAt('');
        navigate('/dashboard');
      }
    } catch (err) {
      alert('발행 요청 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <input 
          className="w-full text-2xl font-bold border-b border-gray-200 pb-4 mb-4 focus:outline-none"
          placeholder="제목을 입력하세요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        
        <div className="border border-gray-200 rounded-lg p-4 min-h-[400px]">
          <EditorContent editor={editor} />
        </div>

        <div className="mt-6 flex justify-between items-center">
          <button 
            onClick={() => handlePublish(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
          >
            즉시 발송하기
          </button>
          <div className="flex items-center space-x-4">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            />
            <button 
              onClick={() => handlePublish(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
            >
              {id ? '예약 수정하기' : '발행 예약하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorPage;
