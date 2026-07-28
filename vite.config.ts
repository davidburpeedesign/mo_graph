import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /**
   * Relative asset paths, so the same build works at a domain root, in a
   * GitHub Pages project subpath (/mo_graph/), or opened from a local static
   * server — without rebuilding for each. Safe here because the tool is a
   * single page with no client-side routing.
   */
  base: './',
  server: { port: 5173 },
});
