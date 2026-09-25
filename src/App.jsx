// V21: App routes wrapped in AppShell (Sidebar + Topbar + Outlet).
// New routes: /account (list), /compare, /calendar, /library, /ai, /settings.
//
// SPA fallback: when GH Pages serves 404.html for an unknown path, that
// handler stores the requested sub-route in sessionStorage under
// 'titan:redirect' and redirects to /TITAN/. Before rendering <Routes>,
// if that key is set, render a <Navigate> to the original path so the user
// lands on the route they actually wanted. Clear the key after consuming
// so browser back/forward doesn't loop.
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import ChatPanel from './components/ChatPanel.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SkeletonCard from './components/SkeletonCard.jsx';
import { MemoryProvider } from './lib/memory/MemoryProvider.jsx';
import { AppShell } from './components/layout/AppShell.jsx';

// V39: the landing page is its own composition (rivr / technical-specifications /
// bento-grid-stats / faq-cta / stark-minimal-footer) and carries its own nav, so
// it sits OUTSIDE AppShell. The tool routes stay inside the shell.
//   /            landing — hero, metrics, features, command center, specs, bento, FAQ, footer
//   /dashboard   the command center on its own, with the app chrome
const Landing = lazy(() => import('./routes/Landing.jsx'));
const CommandCenterRoute = lazy(() => import('./routes/Dashboard.jsx'));
const AccountPage = lazy(() => import('./routes/AccountPage.jsx'));
const AccountList = lazy(() => import('./routes/AccountList.jsx'));
const Compare = lazy(() => import('./routes/Compare.jsx'));
const Calendar = lazy(() => import('./routes/Calendar.jsx'));
const Library = lazy(() => import('./routes/Library.jsx'));
const AiInsights = lazy(() => import('./routes/AiInsights.jsx'));
const Settings = lazy(() => import('./routes/Settings.jsx'));
const Admin = lazy(() => import('./routes/Admin.jsx'));
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

function RedirectBootstrap() {
  // Read 404.html's stored path, push to it once, then clear the key so
  // back/forward navigation doesn't re-trigger the redirect.
  const location = useLocation();
  const target = typeof window !== 'undefined' ? sessionStorage.getItem('titan:redirect') : null;
  useEffect(() => {
    if (target) sessionStorage.removeItem('titan:redirect');
  }, [target]);
  if (target && location.pathname === '/') {
    return <Navigate to={target} replace />;
  }
  return null;
}

function ChatPanelGate() {
  // The landing page is a prompt-composed front door with its own nav and
  // footer; a floating chat bubble over it is not part of that composition and
  // the panel has no account context to offer there anyway. Everywhere else the
  // chat stays exactly as it was.
  const { pathname } = useLocation();
  if (pathname === '/') return null;
  return <ChatPanel />;
}

export default function App() {
  return (
    <MemoryProvider>
      <ErrorBoundary>
        <a href="#main-content" className="skip-link">Langsung ke konten utama</a>
        <Suspense fallback={<PageLoader />}>
          <RedirectBootstrap />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<CommandCenterRoute />} />
              <Route path="/account" element={<AccountList />} />
              <Route path="/account/:slug" element={<AccountPage />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/library" element={<Library />} />
              <Route path="/ai" element={<AiInsights />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={<Admin />} />
              {/* The old / command center is now /dashboard; keep old links alive. */}
              <Route path="/home" element={<Navigate to="/dashboard" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <ChatPanelGate />
      </ErrorBoundary>
    </MemoryProvider>
  );
}
