import React, { useState } from 'react';
import axios from 'axios';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from 'prosemirror-state';

const EditorPage = () => {
  const [title, setTitle] = useState('');
  const [mediaPaths, setMediaPaths] = useState<string[]>([]);

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
                handleDrop: (view, event, slice, moved) => {
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

  const handlePublish = async () => {
    if (!title || !editor?.getHTML()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    
    try {
      // DRAFT나 SCHEDULED, platforms 등 추가 메타데이터 연동 가능
      await axios.post('/api/posts', {
        title,
        content: editor.getHTML(),
        mediaPaths,
        platforms: ['NAVER', 'TISTORY', 'BLOGSPOT']
      });
      alert('발행이 예약되었습니다!');
      setTitle('');
      editor.commands.setContent('');
      setMediaPaths([]);
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

        <div className="mt-6 flex justify-end">
          <button 
            onClick={handlePublish}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
          >
            발행 예약하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorPage;
