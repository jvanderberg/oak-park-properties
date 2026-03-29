import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	base: '/oak-park-properties/',
	plugins: [react(), tailwindcss()],
	publicDir: 'app/public',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './app/src'),
		},
	},
	server: {
		allowedHosts: true,
	},
});
