import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface PlatformStatus {
  id: number;
  platform: string;
  status: string;
  errorMsg: string | null;
  externalUrl: string | null;
}

interface Post {
  id: number;
  title: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  platformStatuses: PlatformStatus[];
}

const getBadgeColor = (status: string) => {
  switch (status) {
    case 'PENDING':
    case 'SCHEDULED': return 'bg-gray-100 text-gray-800';
    case 'PUBLISHING': return 'bg-blue-100 text-blue-800 animate-pulse';
    case 'SUCCESS':
    case 'COMPLETED': return 'bg-green-100 text-green-800';
    case 'FAILED': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const DashboardPage = () => {
  const [posts, setPosts] = useState<Post[]>([]);

  const fetchPosts = async () => {
    try {
      const res = await axios.get('/api/posts');
      if (res.data.success) {
        setPosts(res.data.posts);
      }
    } catch (error) {
      console.error('Failed to fetch posts', error);
    }
  };

  useEffect(() => {
    fetchPosts();
    // 폴링 로직 (실시간 반영)
    const interval = setInterval(fetchPosts, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-bold mb-6">예약 및 발행 대시보드</h2>

      <div className="grid gap-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold break-keep">
                  {post.title}
                </h3>
                {post.status === 'SCHEDULED' && (
                  <Link to={`/editor/${post.id}`} className="shrink-0 text-xs font-normal text-blue-600 border border-blue-600 px-3 py-1 rounded hover:bg-blue-50 transition-colors mt-1">
                    수정
                  </Link>
                )}
              </div>
              <div className="text-sm text-gray-500">
                작성일: {new Date(post.createdAt).toLocaleString()} <br />
                {post.scheduledAt && `예약일: ${new Date(post.scheduledAt).toLocaleString()}`}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getBadgeColor(post.status)}`}>
                MAIN: {post.status}
              </span>

              <div className="flex gap-2 mt-2">
                {post.platformStatuses.map((ps) => (
                  <div key={ps.id} className="flex flex-col items-end group relative">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getBadgeColor(ps.status)} cursor-default`}>
                      {ps.platform}: {ps.status}
                    </span>
                    {ps.errorMsg && (
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded p-2 w-48 z-10">
                        {ps.errorMsg}
                      </div>
                    )}
                    {ps.externalUrl && (
                      <a href={ps.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1">
                        보기
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {posts.length === 0 && (
          <div className="text-center text-gray-500 py-10 bg-white rounded-lg border border-gray-100">
            예약되거나 발행된 글이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
