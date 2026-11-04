import { constants } from 'node:fs';
import { open, mkdir, lstat, rename, unlink } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
function checkPrivate(info, kind) {
  if (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid()))
    throw new Error(`${kind} must be owned by the current user with no group or public permissions`);
}
export async function readPrivate(file) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Credential storage must be a regular file');
    checkPrivate(info, 'Credential file');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function savePrivate(file, data) {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Use a dedicated private configuration directory');
  checkPrivate(info, 'Configuration directory');
  const tmp = `${file}.${crypto.randomUUID()}`;
  let handle;
  try {
    handle = await open(tmp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(data) + '\n');
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(tmp, file);
  } finally {
    await handle?.close();
    await unlink(tmp).catch(e => { if (e.code !== 'ENOENT') throw e; });
  }
}
