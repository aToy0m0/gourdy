const fs = require('node:fs/promises');
const path = require('node:path');
const {shortcutKeys}=require('./voice-commands.cjs');
const {validateReplacements}=require('./replacements.cjs');
const defaults = {
  shortcut: 'ControlRight', commandShortcut: 'Super+Shift+J', commandEnabled: false, saveAudio: true, replacements: [], liveInput: true,
  textBackground: true, noiseThresholdDb: -80, mcpEnabled: true, mcpPort: 55888, microphoneId: '', noiseSuppression: true, continuationAssist: true, fastStart: true,
  accent: '#262626', showTaskbar: true, launchAtStartup: false, imeAutoImport: false,
  count: 10, chars: 12000,
  terms: [{ term: 'Claude', reading: 'クロード' }, { term: 'Electron', reading: 'エレクトロン' }]
};
const colors = ['#262626','#EBD48A','#9BACDC','#DC9B97','#E7B2CC','#E8BA91','#9FC3AD','#9ECEDE','#C4D59B'];
function validate(settings) {
  shortcutKeys(settings?.shortcut);
  if(!Number.isInteger(settings.noiseThresholdDb)||settings.noiseThresholdDb< -80||settings.noiseThresholdDb> -20)throw new Error('ノイズ閾値は−80〜−20 dBにしてください。');
  if(typeof settings.mcpEnabled!=='boolean'||!Number.isInteger(settings.mcpPort)||settings.mcpPort<1024||settings.mcpPort>65535)throw new Error('MCPポートは1024〜65535にしてください。');
  if(typeof settings.microphoneId!=='string'||settings.microphoneId.length>512)throw new Error('マイクの設定が不正です。');
  if(shortcutKeys(settings.commandShortcut).length<2)throw new Error('押して話すコマンドは修飾キーと別のキーを組み合わせてください。');
  if(settings.commandEnabled&&settings.commandShortcut===settings.shortcut)throw new Error('録音とコマンドには別のショートカットを指定してください。');
  validateReplacements(settings.replacements);
  if (!colors.includes(settings.accent) || ['textBackground','liveInput','showTaskbar','launchAtStartup','imeAutoImport','saveAudio','commandEnabled','noiseSuppression','continuationAssist','fastStart'].some(k => typeof settings[k] !== 'boolean')) throw new Error('操作設定が不正です。');
  if (!Number.isInteger(settings.count) || settings.count < 0 || settings.count > 1000 || !Number.isInteger(settings.chars) || settings.chars < 1 || settings.chars > 12000) throw new Error('保存件数は0〜1000件、文字数は1〜12000文字です。');
  if (!Array.isArray(settings.terms) || settings.terms.length > 100 || settings.terms.some(t => !t || typeof t.term !== 'string' || t.term.length > 80 || typeof t.reading !== 'string' || t.reading.length > 120)) throw new Error('用語は100件まで、表記は80文字、読みは120文字までです。');
  return settings;
}
function trimHistory(entries, settings) {
  return entries.slice(0, settings.count).map(e => ({ ...e, text: Array.from(e.text).slice(0, settings.chars).join(''), original: Array.from(e.original || '').slice(0, settings.chars).join('') }));
}
class Store {
  constructor(folder) { this.folder = folder; this.file = path.join(folder, 'app-data.json'); this.data = { settings: structuredClone(defaults), history: [] }; }
  async load() {
    await fs.mkdir(this.folder, { recursive: true });
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.data.settings.imeAutoImport ??= false;
      this.data.settings.commandEnabled ??= false;
      this.data.settings.commandShortcut ??= this.data.settings.shortcut===defaults.commandShortcut?'Super+Shift+K':defaults.commandShortcut;
      this.data.settings.saveAudio ??= defaults.saveAudio;
      this.data.settings.replacements ??= [];
      this.data.settings.microphoneId ??= '';
      this.data.settings.noiseSuppression ??= true;
      this.data.settings.continuationAssist ??= true;
      this.data.settings.fastStart ??= true;
      for(const key of ['textBackground','noiseThresholdDb','mcpEnabled','mcpPort'])this.data.settings[key]??=defaults[key];
      if(this.data.imeSeen!==undefined&&(!Array.isArray(this.data.imeSeen)||this.data.imeSeen.length>100000||this.data.imeSeen.some(k=>typeof k!=='string'||! /^[a-f0-9]{64}$/.test(k))))throw new Error('Windows辞書の取り込み記録が不正です。');
      validate(this.data.settings);
      if (!Array.isArray(this.data.history) || this.data.history.some(e => !e || typeof e.id !== 'string' || typeof e.text !== 'string' || typeof e.at !== 'string')) throw new Error('履歴の形式が不正です。');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      try {
        const old = JSON.parse(await fs.readFile(path.join(this.folder, 'settings.json'), 'utf8'));
        for (const k of ['shortcut','liveInput']) if (old[k] !== undefined) this.data.settings[k] = old[k];
        if (old.glossary) this.data.settings.terms = old.glossary.map(t => ({ term: t.term, reading: t.reading }));
        validate(this.data.settings);
      } catch (migrationError) { if (migrationError.code !== 'ENOENT') throw migrationError; }
      await this.write(this.data);
    }
    return this.data;
  }
  async write(data) {
    validate(data.settings);
    const temp = this.file + '.tmp';
    const handle = await fs.open(temp, 'w');
    try { await handle.writeFile(JSON.stringify(data, null, 2), 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, this.file);
    this.data = data;
  }
}
module.exports = { Store, defaults, validate, trimHistory, colors };
