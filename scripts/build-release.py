from pathlib import Path
import hashlib
import base64
import gzip
import io
import json
import os
import shutil
import stat
import subprocess
import tarfile
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
out = root / 'dist'
subprocess.run(['node', 'scripts/check-public.mjs'], cwd=root, check=True)
paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
paths = sorted(set(p for p in paths if p and not p.startswith('dist/')))
version = json.loads((root / 'package.json').read_text())['version']

def archive(target, directory, names, prefix=''):
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(names):
            p = directory / name
            if p.is_symlink():
                raise ValueError(f'Symlink cannot be released: {name}')
            info = zipfile.ZipInfo(prefix + name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            mode = 0o755 if p.stat().st_mode & 0o111 else 0o644
            info.external_attr = (stat.S_IFREG | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, p.read_bytes(), compresslevel=9)

out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='solidrpc-release-') as tmp:
    candidate = Path(tmp) / 'source'
    candidate.mkdir()
    for name in paths:
        p = root / name
        if p.is_symlink() or not p.is_file():
            raise ValueError(f'Invalid source entry: {name}')
        target = candidate / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
    pkg = json.loads((candidate / 'package.json').read_text())
    if pkg['name'] != '@solidrpc/agent' or pkg.get('private') is not True:
        raise ValueError('Expected the private SolidRPC source manifest')
    source = out / f'agent-toolkit-{version}-source.zip'
    archive(source, candidate, paths, 'agent-toolkit/')
    del pkg['private']
    (candidate / 'package.json').write_text(json.dumps(pkg, indent=2) + '\n')
    packed = json.loads(subprocess.check_output(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', str(out)], cwd=candidate))[0]
    tarball = out / packed['filename']
    normalized = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=normalized, compresslevel=0, mtime=0) as g:
        g.write(gzip.decompress(tarball.read_bytes()))
    tarball.write_bytes(normalized.getvalue())
    packed['size'] = tarball.stat().st_size
    packed['shasum'] = hashlib.sha1(tarball.read_bytes()).hexdigest()
    packed['integrity'] = 'sha512-' + base64.b64encode(hashlib.sha512(tarball.read_bytes()).digest()).decode()
    with tarfile.open(tarball) as t:
        for member in t.getmembers():
            if not member.isfile() or not member.name.startswith('package/'):
                raise ValueError(f'Invalid npm archive member: {member.name}')
            expected = candidate / member.name.removeprefix('package/')
            if t.extractfile(member).read() != expected.read_bytes():
                raise ValueError(f'npm archive differs: {member.name}')
    bundle = Path(tmp) / 'bundle'
    bundle.mkdir()
    for name in ['src', 'examples', 'skills', 'configs']:
        shutil.copytree(candidate / name, bundle / name)
    for name in ['package.json', 'package-lock.json', 'README.md', 'LICENSE']:
        shutil.copy2(candidate / name, bundle / name)
    manifest = json.loads((root / 'release/manifest.json').read_text())
    if manifest['version'] != version:
        raise ValueError('MCP bundle version mismatch')
    shutil.copy2(candidate / 'release/icon.png', bundle / 'icon.png')
    (bundle / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    env = {k:v for k,v in os.environ.items() if k not in ['NODE_AUTH_TOKEN','NPM_TOKEN']}
    subprocess.run(['npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-fund', '--no-audit'], cwd=bundle, env=env, check=True)
    bundle_names = [str(p.relative_to(bundle)) for p in bundle.rglob('*') if p.is_file() and '.bin' not in p.relative_to(bundle).parts]
    mcpb = out / f'solidrpc-{version}.mcpb'
    archive(mcpb, bundle, bundle_names)
    records = [{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [source,tarball,mcpb]]
    (out / 'artifact-hashes.json').write_text(json.dumps(records, indent=2)+'\n')
    (out / 'SHA256SUMS').write_text(''.join(f"{r['sha256']}  {r['file']}\n" for r in records))
    (out / 'npm-pack.json').write_text(json.dumps(packed, indent=2)+'\n')
print('Built three local release candidates. Source manifest remains private. Nothing published.')
