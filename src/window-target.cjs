const { execFile } = require('node:child_process');
const path = require('node:path');
async function windowTarget(command, target, payload, signal) {
  if (!['restore-input', 'paste-current', 'capture', 'list', 'pick-paste', 'focus', 'paste', 'live-start', 'live-write', 'command-start', 'command', 'wait-release'].includes(command)) throw new Error('ウィンドウ操作が不正です。');
  const args = ['capture', 'list', 'pick-paste', 'wait-release'].includes(command) ? [String(process.pid)] : [target?.handle, String(target?.pid)];
  if (args.some(value => typeof value !== 'string' || !/^\d+$/.test(value))) throw new Error('入力先が選択されていません。');
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      const child = execFile(path.join(__dirname, 'WindowTarget.exe'), [command, ...args], { windowsHide: true, signal, encoding: 'utf8', timeout: ['live-write','command'].includes(command) ? 60000 : ['pick-paste','wait-release'].includes(command) ? 35000 : 5000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) { error.stderr = stderr; reject(error); } else resolve({ stdout });
      });
      child.stdin.on('error', reject);
      child.stdin.end(payload === undefined ? '' : JSON.stringify(payload));
    });
    return JSON.parse(stdout.replace(/^\uFEFF/, ''));
  } catch (error) { throw new Error(error.stderr?.trim() || 'ウィンドウ操作に失敗しました: ' + error.message); }
}
module.exports = { windowTarget };
