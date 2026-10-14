import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// CODAP runs on https, so the dev server must too. If you have the CODAP
// convention's trusted localhost certificate (~/.localhost-ssl, made with
// mkcert), it is used; otherwise a self-signed one is generated, which your
// browser will ask you to accept once at https://localhost:8090.
const certDir = path.join(os.homedir(), '.localhost-ssl');
const cert = path.join(certDir, 'localhost.pem');
const key = path.join(certDir, 'localhost.key');
const trusted = fs.existsSync(cert) && fs.existsSync(key);

export default defineConfig({
  // Relative asset paths, so the build works from any folder, e.g. GitHub Pages.
  base: './',
  plugins: trusted ? [] : [basicSsl()],
  server: {
    port: 8090,
    strictPort: true,
    https: trusted ? { cert: fs.readFileSync(cert), key: fs.readFileSync(key) } : undefined,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
