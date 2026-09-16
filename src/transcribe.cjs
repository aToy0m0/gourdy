const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

function validateWav(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 44 || b.length > 16000 * 2 * 300 + 44 ||
      b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' ||
      b.toString('ascii', 12, 16) !== 'fmt ' || b.readUInt32LE(16) !== 16 ||
      b.readUInt16LE(20) !== 1 || b.readUInt16LE(22) !== 1 ||
      b.readUInt32LE(24) !== 16000 || b.readUInt16LE(34) !== 16 ||
      b.toString('ascii', 36, 40) !== 'data' || b.readUInt32LE(40) !== b.length - 44) {
    throw new Error('音声形式が不正です。16kHz・モノラル・16bit WAV、最大5分に対応しています。');
  }
  return b;
}

async function transcribe(bytes, settings, tempRoot, signal) {
  const wav = validateWav(bytes);
  for (const [label, file] of [['実行ファイル', settings.engine], ['モデル', settings.model], ['音声区間検出モデル', settings.vadModel]]) {
    if (!file || !path.isAbsolute(file)) throw new Error(`${label}を設定してください。`);
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error(`${label}がファイルではありません。`);
  }
  const dir = await fs.mkdtemp(path.join(tempRoot, 'dictation-'));
  try {
    const input = path.join(dir, 'audio.wav');
    const output = path.join(dir, 'result');
    await fs.writeFile(input, wav);
    await new Promise((resolve, reject) => {
      const args = ['-m', settings.model, '-f', input, '-l', 'ja', '-otxt', '-of', output, '-nt', '-ng', '--vad', '--vad-model', settings.vadModel];
      const hint = (settings.glossary || []).map(row => row.term).join('、').slice(0, 600);
      if (hint) args.push('--prompt', hint);
      const child = spawn(settings.engine, args, {
        windowsHide: true, shell: false, signal, timeout: 600000,
        stdio: ['ignore', 'ignore', 'pipe']
      });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
      child.once('error', reject);
      child.once('close', (code, termination) => {
        if (code === 0) resolve();
        else reject(new Error(`文字起こしに失敗しました（${termination || code}）。\n${stderr}`));
      });
    });
    return (await fs.readFile(`${output}.txt`, 'utf8')).trim();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
module.exports = { validateWav, transcribe };
