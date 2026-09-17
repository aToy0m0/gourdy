const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');
class Moonshine {
  constructor(settings) {
    this.pending = new Map(); this.nextId = 0; this.failure = null;
    this.child = spawn(settings.python, ['-u', '-X', 'utf8', path.join(__dirname, 'moonshine_worker.py')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    this.child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-3000); });
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; });
    this.readyTimer = setTimeout(() => this.fail(new Error('音声モデルの起動が30秒以内に完了しませんでした。')), 30000);
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    this.closed = new Promise(resolve => this.child.on('close', code => {
      if (!this.ending || code !== 0) this.fail(new Error(`音声認識プロセスが終了しました（${code}）。${stderr}`));
      resolve();
    }));
    createInterface({ input: this.child.stdout }).on('line', raw => {
      try {
        const message = JSON.parse(raw);
        if (message.error) throw new Error('音声認識に失敗しました: ' + message.error);
        if (message.ready) { this.timing=message.timing;clearTimeout(this.readyTimer); this.readyResolve(); return; }
        const pending = this.pending.get(message.id);
        if (!pending) throw new Error('音声認識の応答番号が不正です。');
        clearTimeout(pending.timer); this.pending.delete(message.id); pending.resolve(message);
      } catch (error) { this.fail(error); }
    });
    this.child.stdin.write(JSON.stringify({ model: settings.moonshineModel, runtime: settings.moonshineRuntime }) + '\n');
  }
  fail(error) {
    this.failure ??= error; clearTimeout(this.readyTimer); this.readyReject(this.failure);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(this.failure); }
    this.pending.clear(); this.child.kill();
  }
  async request(kind, bytes) {
    await this.ready;
    if (this.failure) throw this.failure;
    const id = this.nextId++;
    if (kind === 'stop') this.ending = true;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('音声認識が30秒間応答しませんでした。')), 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, kind, ...(bytes ? { pcm: Buffer.from(bytes).toString('base64') } : {}) }) + '\n');
    });
  }
  async close() {
    if (!this.ending && !this.failure) this.fail(new Error('音声認識を終了しました。'));
    await this.closed;
  }
}
module.exports = { Moonshine };
