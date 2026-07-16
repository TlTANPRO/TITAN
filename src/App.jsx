import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ChatPanel from './components/ChatPanel.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SkeletonCard from './components/SkeletonCard.jsx';
import { MemoryProvider } from './lib/memory/MemoryProvider.jsx';

const Home = lazy(() => import('./routes/Home.jsx'));
const AccountPage = lazy(() => import('./routes/AccountPage.jsx'));
const NotFound = lazy(() => import('./routes/NotFound.jsx'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-bg-primary px-6 py-12">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="skeleton-shimmer h-8 w-48 rounded" />
        <div className="skeleton-shimmer h-3 w-72 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} height={160} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MemoryProvider>
      <ErrorBoundary>
        <a href="#main-content" className="skip-link">Langsung ke konten utama</a>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/account/:slug" element={<AccountPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <ChatPanel />
      </ErrorBoundary>
    </MemoryProvider>
  );
}
