"""Extract only the model data from a hash-verified, pinned GiNZA wheel."""
import pathlib
import sys
import zipfile

archive, destination = map(pathlib.Path, sys.argv[1:])
root = destination.resolve()
with zipfile.ZipFile(archive) as wheel:
    for entry in wheel.infolist():
        if not entry.filename.startswith('ja_ginza/ja_ginza-5.2.0/'):
            continue
        target = (root / entry.filename).resolve()
        if not target.is_relative_to(root) or entry.file_size > 256_000_000:
            raise ValueError('Invalid model archive entry')
        if entry.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(wheel.read(entry))
if not (root / 'ja_ginza/ja_ginza-5.2.0/config.cfg').is_file():
    raise ValueError('Model configuration missing')
