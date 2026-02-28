import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [
    react({
      // Babel optimizations
      babel: {
        plugins: isProduction ? [
          ['babel-plugin-transform-remove-console', { exclude: ['error', 'warn'] }]
        ] : []
      }
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    minify: isProduction ? 'terser' : false,
    sourcemap: !isProduction,
    cssCodeSplit: true,
    terserOptions: isProduction ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
        passes: 2, // Multiple passes for better compression
      },
      format: {
        comments: false,
      },
    } : undefined,
    // rollupOptions consolidated below
    chunkSizeWarningLimit: 1000,
    // Improve build performance
    reportCompressedSize: false,
    // Target modern browsers for smaller bundles
    target: 'esnext',
    // Rollup options and tree shaking
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            if (id.includes('@radix-ui')) return 'vendor-ui';
            if (id.includes('recharts') || id.includes('react-financial-charts')) return 'vendor-charts';
            if (id.includes('@supabase') || id.includes('@tanstack')) return 'vendor-data';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor-other';
          }
          if (id.includes('/pages/admin')) return 'pages-admin';
          if (id.includes('/pages/')) return 'pages-user';
          if (id.includes('/components/modals/')) return 'components-modals';
        }
      },
      treeshake: {
        moduleSideEffects: false,
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@supabase/supabase-js',
      '@tanstack/react-query',
      'axios',
      'wouter',
      'lucide-react',
    ],
    exclude: ['@vite/client', '@vite/env'],
  },
  server: {
    warmup: {
      clientFiles: [
        './client/src/App.tsx',
        './client/src/pages/home.tsx',
        './client/src/pages/login.tsx',
      ]
    }
  },
});
