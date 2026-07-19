// V21: App routes wrapped in AppShell (Sidebar + Topbar + Outlet).
// New routes: /account (list), /compare, /calendar, /library, /ai, /settings.
import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ChatPanel from './components/ChatPanel.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SkeletonCard from './components/SkeletonCard.jsx';
import { MemoryProvider } from './lib/memory/MemoryProvider.jsx';
import { AppShell } from './components/layout/AppShell.jsx';

const Home = lazy(() => import('./routes/Home.jsx'));
const AccountPage = lazy(() => import('./routes/AccountPage.jsx'));
const AccountList = lazy(() => import('./routes/AccountList.jsx'));
const Compare = lazy(() => import('./routes/Compare.jsx'));
const Calendar = lazy(() => import('./routes/Calendar.jsx'));
const Library = lazy(() => import('./routes/Library.jsx'));
const AiInsights = lazy(() => import('./routes/AiInsights.jsx'));
const Settings = lazy(() => import('./routes/Settings.jsx'));
const NotFound = lazy(() => import('./routes/NotFound.jsx'));

function PageLoader() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="skeleton-shimmer h-8 w-48 rounded" />
      <div className="skeleton-shimmer h-3 w-72 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} height={160} />
        ))}
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
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/account" element={<AccountList />} />
              <Route path="/account/:slug" element={<AccountPage />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/library" element={<Library />} />
              <Route path="/ai" element={<AiInsights />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <ChatPanel />
      </ErrorBoundary>
    </MemoryProvider>
  );
}
