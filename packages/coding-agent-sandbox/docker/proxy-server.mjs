#!/usr/bin/env node
/* eslint-disable no-magic-numbers -- TLS wire offsets and reserved CIDR boundaries are clearer as literals. */
// A deliberately small forward proxy. It resolves every destination itself and
// connects only to a selected public IPv4 address, preventing proxy-based LAN,
// metadata and DNS-rebinding bypasses.
import { Buffer } from 'node:buffer';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import process from 'node:process';
import { domainToASCII } from 'node:url';

const MAX_CLIENT_HELLO_BYTES = 65_536;
const CLIENT_HELLO_TIMEOUT_MS = 5_000;
const MODE = parseMode(process.env.SANDBOX_PROXY_MODE);
const PORT = parsePort(process.env.SANDBOX_PROXY_PORT);
const ALLOWED_HOSTS = parseAllowedHosts(process.env.SANDBOX_PROXY_ALLOW);

const server = http.createServer((request, response) => {
  proxyHttp(request, response).catch((error) => {
    const message = error instanceof Error ? error.message : 'Proxy request failed';
    log('REJECTED', request.url ?? 'unknown', message);
    writeError(response, 502, message);
  });
});

server.on('connect', (request, client, head) => {
  proxyConnect(request, client, head).catch((error) => {
    log(
      'REJECTED',
      request.url ?? 'unknown',
      error instanceof Error ? error.message : 'failed',
    );
    client.destroy();
  });
});

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(PORT, '0.0.0.0', () => {
  log('READY', `${MODE}:${PORT}`, `${ALLOWED_HOSTS.length} strict host pattern(s)`);
});

async function proxyHttp(request, response) {
  const target = parseHttpTarget(request.url);
  ensureAllowed(target.host);
  const address = await resolvePublicIpv4(target.host);
  log('HTTP', `${target.host}:${target.port}`, address);

  const headers = { ...request.headers, host: target.host };
  delete headers['proxy-authorization'];
  delete headers['proxy-connection'];

  const upstream = http.request(
    {
      host: address,
      port: target.port,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers,
      agent: false,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', (error) => {
    writeError(response, 502, error.message);
  });
  request.pipe(upstream);
}

async function proxyConnect(request, client, head) {
  const target = parseConnectTarget(request.url);

  if (target.port !== 443) {
    log('REJECTED', `${target.host}:${target.port}`, 'CONNECT port is not 443');
    client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }

  ensureAllowed(target.host);
  const address = await resolvePublicIpv4(target.host);

  if (MODE === 'strict') {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const hello = await readClientHello(client, head);

    if (hello.serverName !== target.host) {
      log(
        'REJECTED',
        `${target.host}:${target.port}`,
        'TLS SNI does not match CONNECT host',
      );
      client.destroy();
      return;
    }

    log('CONNECT', `${target.host}:${target.port}`, address);
    tunnel(client, address, target.port, hello.data);
    return;
  }

  log('CONNECT', `${target.host}:${target.port}`, address);
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  tunnel(client, address, target.port, head);
}

function tunnel(client, address, port, buffered) {
  client.pause();
  const upstream = net.createConnection({ host: address, port });

  upstream.once('connect', () => {
    if (buffered.length > 0) {
      upstream.write(buffered);
    }
    client.pipe(upstream);
    upstream.pipe(client);
  });
  upstream.once('error', () => client.destroy());
  client.once('error', () => upstream.destroy());
  client.once('close', () => upstream.destroy());
}

function parseHttpTarget(value) {
  let target;

  try {
    target = new URL(value);
  } catch {
    throw new Error('Proxy requests must use an absolute HTTP URL.');
  }

  if (target.protocol !== 'http:') {
    throw new Error('Only HTTP forwarding and HTTPS CONNECT are supported.');
  }

  const port = target.port === '' ? 80 : Number(target.port);
  if (port !== 80) {
    throw new Error('HTTP forwarding is restricted to port 80.');
  }

  return {
    host: normalizeHost(target.hostname),
    port,
    pathname: target.pathname,
    search: target.search,
  };
}

function parseConnectTarget(value) {
  const match = /^(?<host>[^:]+):(?<port>\d{1,5})$/u.exec(value ?? '');

  if (match?.groups?.host == null || match.groups.port == null) {
    throw new Error('CONNECT target must be a hostname and port.');
  }

  const port = Number(match.groups.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('CONNECT port is invalid.');
  }

  return { host: normalizeHost(match.groups.host), port };
}

function normalizeHost(value) {
  const normalized =
    net.isIP(value) === 4 ? value : domainToASCII(value.trim()).toLowerCase();

  if (normalized === '' || (!isIpv4(normalized) && !isHostname(normalized))) {
    throw new Error('Destination must be an IPv4 address or a DNS hostname.');
  }

  return normalized;
}

function ensureAllowed(host) {
  if (MODE !== 'strict') {
    return;
  }

  const allowed = ALLOWED_HOSTS.some((pattern) =>
    pattern.startsWith('*.')
      ? host.endsWith(`.${pattern.slice(2)}`) && host !== pattern.slice(2)
      : host === pattern,
  );

  if (!allowed) {
    throw new Error(`Host ${host} is not on the strict allowlist.`);
  }
}

async function resolvePublicIpv4(host) {
  if (isIpv4(host)) {
    if (!isPublicIpv4(host)) {
      throw new Error(`Destination ${host} is not a public IPv4 address.`);
    }
    return host;
  }

  const addresses = await lookup(host, { all: true, verbatim: true });
  const publicAddress = addresses.find(
    (address) => address.family === 4 && isPublicIpv4(address.address),
  );

  if (publicAddress == null) {
    throw new Error(`Host ${host} did not resolve to a public IPv4 address.`);
  }

  return publicAddress.address;
}

function isPublicIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  const [first, second, third] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && (second === 0 || second === 168)) return false;
  if (first === 198 && (second === 18 || second === 19 || second === 51)) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isIpv4(value) {
  return net.isIP(value) === 4;
}

function isHostname(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(
    value,
  );
}

async function readClientHello(socket, head) {
  let data = Buffer.from(head);

  return new Promise((resolve, reject) => {
    let timeout;
    let onData;
    let onError;
    let onClose;
    const finish = (result) => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const inspect = () => {
      try {
        const serverName = parseClientHelloServerName(data);
        if (serverName !== undefined) {
          socket.pause();
          finish({ serverName, data });
        } else if (data.length > MAX_CLIENT_HELLO_BYTES) {
          finish(new Error('TLS ClientHello exceeds the proxy limit.'));
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };
    onData = (chunk) => {
      data = Buffer.concat([data, chunk]);
      inspect();
    };
    onError = (error) => finish(error);
    onClose = () => finish(new Error('Client closed before sending TLS ClientHello.'));

    timeout = setTimeout(
      () => finish(new Error('Timed out waiting for TLS ClientHello.')),
      CLIENT_HELLO_TIMEOUT_MS,
    );
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
    inspect();
  });
}

function parseClientHelloServerName(data) {
  let offset = 0;
  let handshake = Buffer.alloc(0);

  while (offset + 5 <= data.length) {
    const type = data.readUInt8(offset);
    const recordLength = data.readUInt16BE(offset + 3);
    if (offset + 5 + recordLength > data.length) return undefined;
    if (type !== 22)
      throw new Error('CONNECT tunnel did not start with a TLS handshake.');
    handshake = Buffer.concat([
      handshake,
      data.subarray(offset + 5, offset + 5 + recordLength),
    ]);
    offset += 5 + recordLength;

    if (handshake.length >= 4) {
      if (handshake.readUInt8(0) !== 1) {
        throw new Error('First TLS handshake is not ClientHello.');
      }
      const length = handshake.readUIntBE(1, 3);
      if (handshake.length >= 4 + length) {
        return parseServerNameExtension(handshake.subarray(4, 4 + length));
      }
    }
  }

  return undefined;
}

function parseServerNameExtension(hello) {
  let offset = 34;
  if (hello.length < offset + 1) throw new Error('Malformed TLS ClientHello.');
  offset += 1 + hello.readUInt8(offset);
  if (hello.length < offset + 2) throw new Error('Malformed TLS ClientHello.');
  offset += 2 + hello.readUInt16BE(offset);
  if (hello.length < offset + 1) throw new Error('Malformed TLS ClientHello.');
  offset += 1 + hello.readUInt8(offset);
  if (hello.length < offset + 2) throw new Error('TLS ClientHello has no extensions.');
  const extensionsEnd = offset + 2 + hello.readUInt16BE(offset);
  offset += 2;
  if (extensionsEnd > hello.length) throw new Error('Malformed TLS extensions.');

  while (offset + 4 <= extensionsEnd) {
    const type = hello.readUInt16BE(offset);
    const length = hello.readUInt16BE(offset + 2);
    offset += 4;
    if (offset + length > extensionsEnd) throw new Error('Malformed TLS extension.');
    if (type === 0) return parseServerNameList(hello.subarray(offset, offset + length));
    offset += length;
  }

  throw new Error('TLS ClientHello has no SNI extension.');
}

function parseServerNameList(data) {
  if (data.length < 5) throw new Error('Malformed TLS SNI extension.');
  const listLength = data.readUInt16BE(0);
  const nameType = data.readUInt8(2);
  const nameLength = data.readUInt16BE(3);
  if (listLength + 2 > data.length || nameType !== 0 || nameLength + 5 > data.length) {
    throw new Error('Malformed TLS SNI name.');
  }
  return normalizeHost(data.subarray(5, 5 + nameLength).toString('utf-8'));
}

function parseMode(value) {
  if (value === 'strict' || value === 'open') return value;
  throw new Error(`Unsupported SANDBOX_PROXY_MODE: ${value ?? ''}`);
}

function parsePort(value) {
  const port = Number(value ?? '8888');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid SANDBOX_PROXY_PORT: ${value ?? ''}`);
  }
  return port;
}

function parseAllowedHosts(value) {
  return (value ?? '')
    .split(/\r?\n/u)
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '');
}

function writeError(response, status, message) {
  if (!response.headersSent) {
    response.writeHead(status, { Connection: 'close', 'Content-Type': 'text/plain' });
  }
  response.end(`${message}\n`);
}

function log(event, target, detail) {
  process.stderr.write(
    `PROXY ${event} ${target}${detail === undefined ? '' : ` ${detail}`}\n`,
  );
}
