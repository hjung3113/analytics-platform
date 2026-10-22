import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createFoQueryClient, shouldRetryQuery } from './lib/query/query-client';
import { createAppRouter } from './lib/router/app-router';
import './styles.css';

export { createAppRouter, shouldRetryQuery };

const queryClient = createFoQueryClient();
const router = createAppRouter(queryClient);

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
