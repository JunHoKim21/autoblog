import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import EditorPage from './pages/EditorPage';

import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <h1 className="text-xl font-bold text-blue-600 hover:text-blue-700 transition-colors">
              <Link to="/">ReviewBoost</Link>
            </h1>
            <nav className="flex gap-4">
              <Link to="/" className="text-gray-600 hover:text-blue-600 font-medium transition-colors">새 글 작성</Link>
              <Link to="/dashboard" className="text-gray-600 hover:text-blue-600 font-medium transition-colors">대시보드</Link>
              <Link to="/settings" className="text-gray-600 hover:text-blue-600 font-medium transition-colors">설정</Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 py-8">
          <Routes>
            <Route path="/" element={<EditorPage />} />
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
