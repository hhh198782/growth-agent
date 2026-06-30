import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createStore } from '../src/store/sqlite-store.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 4788);
const store = createStore({ dbPath: join(root, 'data', 'growth-agent.sqlite') });
const server = createServer(createApp({ store, staticDir: join(root, 'public') }));

server.listen(port, '127.0.0.1', () => {
  console.log(`Growth Agent running at http://localhost:${port}`);
});

process.on('SIGINT', () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
});

