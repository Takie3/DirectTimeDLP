import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                watch: resolve(__dirname, 'watch.html')
            }
        }
    }
});
