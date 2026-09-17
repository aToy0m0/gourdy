"""Create a local Windows release candidate. Never publish or change versions."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    version = package['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version')
    source = ROOT / 'dist-staged/win-unpacked'
    built = json.loads((source / 'resources/app/package.json').read_text(encoding='utf-8'))
    if built['version'] != version:
        raise ValueError('Build version differs from package.json; rebuild first')
    required = ['Gourdy.exe', 'LICENSE', 'README.md', 'docs/public/THIRD-PARTY-NOTICES.md',
                'resources/runtime/ffmpeg/ffmpeg.exe', 'resources/runtime/ffmpeg/ffprobe.exe',
                'resources/runtime/ffmpeg/LICENSE.txt', 'resources/runtime/ffmpeg/BUILD.txt',
                'LICENSE.electron.txt', 'LICENSES.chromium.html']
    for name in required:
        if not (source / name).is_file():
            raise FileNotFoundError(f'Missing distribution file: {name}')
    files = sorted(p for p in source.rglob('*') if p.is_file())
    for file in files:
        relative = file.relative_to(source)
        if (file.suffix == '.map' or file.name.startswith('.env') or
                (relative.parts[0] == 'docs' and relative.parts[1] != 'public') or
                any(part in {'artifacts', '.git', '__pycache__'} for part in relative.parts)):
            raise ValueError(f'Unexpected distribution file: {relative}')
    output = ROOT / 'release'
    output.mkdir(exist_ok=True)
    archive = output / f'gourdy-{version}-windows-x64.zip'
    temporary = archive.with_suffix('.zip.partial')
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
        for file in files:
            zipped.write(file, file.relative_to(source).as_posix())
    with zipfile.ZipFile(temporary) as zipped:
        broken = zipped.testzip()
        if broken:
            raise ValueError(f'ZIP verification failed: {broken}')
    temporary.replace(archive)
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    (output / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n', encoding='ascii')
    print(f'Created {archive.name} ({archive.stat().st_size:,} bytes), SHA256 {digest}', flush=True)
    print('Local candidate only. Complete the open license/security checks in docs/public/release.md before publication.')


if __name__ == '__main__':
    main()
