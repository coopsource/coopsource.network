import type { Server } from 'node:http';

const openTestServers = new Set<Server>();

export function trackTestServer(server: Server): void {
  openTestServers.add(server);
  server.once('close', () => {
    openTestServers.delete(server);
  });
}

export async function closeOpenTestServers(): Promise<void> {
  const servers = Array.from(openTestServers);
  await Promise.all(servers.map(closeTestServer));
}

function closeTestServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      openTestServers.delete(server);
      resolve();
      return;
    }

    server.close((error) => {
      openTestServers.delete(server);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
