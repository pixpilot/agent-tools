import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(directory, '../../agent-config-sync/dist');
const target = path.resolve(directory, '../docker/agent-config-sync');

if (!fs.existsSync(source)) {
  throw new Error(`agent-config-sync build output is missing: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true, force: true });
fs.writeFileSync(path.join(target, 'package.json'), '{ "type": "module" }\n');
