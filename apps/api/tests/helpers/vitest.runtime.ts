import { afterAll } from 'vitest';
import { closeOpenTestServers } from './test-http-servers.js';

afterAll(async () => {
  await closeOpenTestServers();
});
