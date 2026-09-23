import { defineConfig } from 'vite';

export default defineConfig({
  base: '/singularity-engine/', // This MUST match your GitHub repository name exactly
  server: {
    port: 3000,
    open: true
  }
});