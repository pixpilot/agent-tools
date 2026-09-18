import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const PROXY_SERVER = fileURLToPath(
  new URL('../../docker/proxy-server.mjs', import.meta.url),
);
// An allowlisted IP literal: the proxy skips DNS for it, so the suite needs no
// network of its own.
const ALLOWED_HOST = '1.1.1.1';
const BLOCKED_HOST = 'mcp-proxy.anthropic.com';
const SETTLE_MS = 300;
const RESET_ATTEMPTS = 3;

let proxy: ChildProcessWithoutNullStreams | undefined;

afterEach(() => {
  proxy?.kill();
  proxy = undefined;
});

/** Starts the real proxy on a free port and resolves once it logs READY. */
async function startProxy(): Promise<{ port: number; log: () => string }> {
  const port = await reservePort();
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [PROXY_SERVER], {
    env: {
      ...process.env,
      SANDBOX_PROXY_MODE: 'strict',
      SANDBOX_PROXY_PORT: String(port),
      SANDBOX_PROXY_ALLOW: ALLOWED_HOST,
    },
  });

  proxy = child;
  let log = '';
  child.stderr.setEncoding('utf-8');

  await new Promise<void>((resolve, reject) => {
    child.stderr.on('data', (chunk: string) => {
      log += chunk;

      if (log.includes('PROXY READY')) {
        resolve();
      }
    });
    child.once('exit', () => {
      reject(new Error(`Proxy exited early: ${log}`));
    });
  });

  return { port, log: () => log };
}

/** A port the OS just handed out, so parallel runs do not collide. */
async function reservePort(): Promise<number> {
  const probe = net.createServer();

  return new Promise<number>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;

      probe.close(() => {
        resolve(port);
      });
    });
  });
}

/** Sends a CONNECT and returns the proxy's status line with the open socket. */
async function connect(
  port: number,
  host: string,
): Promise<{ status: string; socket: net.Socket }> {
  const socket = net.createConnection({ host: '127.0.0.1', port });

  socket.on('error', () => undefined);
  await new Promise<void>((resolve) => {
    socket.once('connect', resolve);
  });
  socket.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);

  const status = await new Promise<string>((resolve) => {
    socket.once('data', (chunk: Buffer) => {
      resolve(chunk.toString('utf-8').split('\r\n')[0] ?? '');
    });
  });

  return { status, socket };
}

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('sandbox proxy', () => {
  it('should answer a blocked host with 403 rather than a bare reset', async () => {
    const { port, log } = await startProxy();
    const { status } = await connect(port, BLOCKED_HOST);

    expect(status).toContain('403');
    expect(log()).toContain(`PROXY REJECTED ${BLOCKED_HOST}:443`);
  });

  // A refused agent resets the tunnel rather than closing it. The raw CONNECT
  // socket has no listener of its own, so that reset used to surface as an
  // unhandled 'error' event and take the proxy down for the whole session.
  it('should stay up when a client resets a refused tunnel', async () => {
    const { port } = await startProxy();

    for (let attempt = 0; attempt < RESET_ATTEMPTS; attempt += 1) {
      const { socket } = await connect(port, BLOCKED_HOST);

      socket.resetAndDestroy();
      await wait(SETTLE_MS / RESET_ATTEMPTS);
    }

    await wait(SETTLE_MS);
    expect(proxy?.exitCode).toBeNull();
  });

  it('should stay up when a client resets an accepted tunnel mid-handshake', async () => {
    const { port } = await startProxy();
    const { status, socket } = await connect(port, ALLOWED_HOST);

    expect(status).toContain('200');
    // A truncated TLS record, then a reset while the proxy still waits for SNI.
    socket.write(Buffer.from([0x16, 0x03, 0x01, 0x00, 0x05]));
    await wait(SETTLE_MS / RESET_ATTEMPTS);
    socket.resetAndDestroy();

    await wait(SETTLE_MS);
    expect(proxy?.exitCode).toBeNull();
  });
});
