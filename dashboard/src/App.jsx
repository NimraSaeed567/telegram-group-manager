import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { GroupProvider } from './lib/group';
import { isConfigured } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Members from './pages/Members';
import Moderation from './pages/Moderation';
import Announcements from './pages/Announcements';
import ActivityPage from './pages/Activity';

function Protected({ children }) {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!session) return <Navigate to="/login" replace />;
  return <GroupProvider>{children}</GroupProvider>;
}

function NotConfigured() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <p className="font-semibold">Supabase is not configured</p>
        <p className="mt-2">
          Copy <code>.env.example</code> to <code>.env</code> and fill in <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Overview />} />
          <Route path="members" element={<Members />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="activity" element={<ActivityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
