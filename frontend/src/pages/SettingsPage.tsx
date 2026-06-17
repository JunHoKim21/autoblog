import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Config {
  naverId: string;
  naverPw: string;
  kakaoId: string;
  kakaoPw: string;
  tistoryBlog: string;
  blogspotId: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  supabaseUrl: string;
  supabaseKey: string;
}

const SettingsPage = () => {
  const [config, setConfig] = useState<Config>({
    naverId: '', naverPw: '',
    kakaoId: '', kakaoPw: '', tistoryBlog: '',
    blogspotId: '', googleClientId: '', googleClientSecret: '', googleRefreshToken: '',
    supabaseUrl: '', supabaseKey: ''
  });
  const [activeTab, setActiveTab] = useState<'naver' | 'tistory' | 'blogspot'>('naver');

  useEffect(() => {
    axios.get('/api/config').then((res) => {
      if (res.data.success && res.data.config) {
        const safeConfig = Object.keys(res.data.config).reduce((acc, key) => {
          acc[key] = res.data.config[key] || '';
          return acc;
        }, {} as any);
        setConfig(safeConfig);
      }
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      const res = await axios.put('/api/config', config);
      if (res.data.success) {
        alert('설정이 저장되었습니다.');
      }
    } catch (error) {
      alert('설정 저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['naver', 'tistory', 'blogspot'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-4 font-medium text-sm transition-colors ${activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/10' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {activeTab === 'naver' && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-lg font-bold">네이버 블로그 설정</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Naver ID</label>
                <input name="naverId" value={config.naverId} onChange={handleChange} className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Naver Password</label>
                <input name="naverPw" type="password" value={config.naverPw} onChange={handleChange} className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          )}

          {activeTab === 'tistory' && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-lg font-bold">티스토리 (카카오 로그인) 설정</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kakao ID</label>
                <input name="kakaoId" value={config.kakaoId} onChange={handleChange} className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kakao Password</label>
                <input name="kakaoPw" type="password" value={config.kakaoPw} onChange={handleChange} className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tistory Blog Name (xxx.tistory.com)</label>
                <input name="tistoryBlog" value={config.tistoryBlog} onChange={handleChange} placeholder="xxx" className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          )}

          {activeTab === 'blogspot' && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-lg font-bold">블로그스팟 (구글 계정) 설정</h2>
              <p className="text-sm text-gray-500 mb-4">복잡한 API 연동 없이 로봇이 자동으로 로그인하여 글을 작성합니다.</p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Email (ID)</label>
                <input name="googleClientId" value={config.googleClientId} onChange={handleChange} placeholder="example@gmail.com" className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Password</label>
                <input name="googleClientSecret" type="password" value={config.googleClientSecret} onChange={handleChange} placeholder="비밀번호" className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Blogspot 주소 (xxx.blogspot.com)</label>
                <input name="blogspotId" value={config.blogspotId} onChange={handleChange} placeholder="xxx" className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors">
              저장하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
