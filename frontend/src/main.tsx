import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './index.css';

import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Login } from './pages/Login';
import { DemoConsole } from './pages/DemoConsole';
import { DemoSimulator } from './pages/DemoSimulator';
import { Cosign } from './pages/Cosign';
import { Activity } from './pages/Activity';
import { Policy } from './pages/Policy';
import { Dashboard } from './pages/Dashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/demo/console" replace /> },
      { path: '/login', element: <Login /> },
      { path: '/demo/console', element: <DemoConsole /> },
      { path: '/demo/simulator', element: <DemoSimulator /> },
      { path: '/cosign', element: <RequireAuth><Cosign /></RequireAuth> },
      { path: '/activity', element: <RequireAuth><Activity /></RequireAuth> },
      { path: '/policy', element: <RequireAuth><Policy /></RequireAuth> },
      { path: '/dashboard', element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: '*', element: <p role="alert">Page not found.</p> },
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