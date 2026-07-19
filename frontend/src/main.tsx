import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './index.css';

import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { DemoConsole } from './pages/DemoConsole';
import { DemoSimulator } from './pages/DemoSimulator';
import { Cosign } from './pages/Cosign';
import { Activity } from './pages/Activity';
import { Policy } from './pages/Policy';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Signup /> },

      // Real-user surfaces (product language).
      { path: '/approvals', element: <RequireAuth><Cosign /></RequireAuth> },
      { path: '/activity', element: <RequireAuth><Activity /></RequireAuth> },
      { path: '/rules', element: <RequireAuth><Policy /></RequireAuth> },

      // Demo / dev tools — kept for the showcase, tucked under the Demo menu.
      { path: '/demo/console', element: <DemoConsole /> },
      { path: '/demo/simulator', element: <DemoSimulator /> },

      // Back-compat redirects so old links (and the deployed build) never 404.
      { path: '/cosign', element: <Navigate to="/approvals" replace /> },
      { path: '/policy', element: <Navigate to="/rules" replace /> },
      { path: '/dashboard', element: <Navigate to="/" replace /> },

      { path: '*', element: <p role="alert" className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600 shadow-sm">Page not found.</p> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);