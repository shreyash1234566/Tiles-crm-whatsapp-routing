import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, '.next', 'standalone');

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standaloneRoot))) {
  throw new Error(`Standalone build directory not found: ${standaloneRoot}`);
}

const staticSource = path.join(projectRoot, '.next', 'static');
const staticDestination = path.join(standaloneRoot, '.next', 'static');
await mkdir(path.dirname(staticDestination), { recursive: true });
await cp(staticSource, staticDestination, { recursive: true, force: true });

const publicSource = path.join(projectRoot, 'public');
if (await exists(publicSource)) {
  await cp(publicSource, path.join(standaloneRoot, 'public'), { recursive: true, force: true });
}

console.log('Prepared standalone runtime assets:', staticDestination);
