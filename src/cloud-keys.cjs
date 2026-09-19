const fs=require('node:fs/promises');
const path=require('node:path');
const PROVIDERS=['openai','gemini'];
class CloudKeys {
  constructor(folder,encryption){this.folder=folder;this.encryption=encryption;this.present={openai:false,gemini:false};}
  file(provider){if(!PROVIDERS.includes(provider))throw new Error('APIの選択が不正です。');return path.join(this.folder,provider+'.key');}
  async load(){for(const p of PROVIDERS){try{await fs.access(this.file(p));this.present[p]=true;}catch(e){if(e.code!=='ENOENT')throw e;}}}
  check(){if(!this.encryption.isEncryptionAvailable())throw new Error('WindowsのAPIキー暗号化を利用できません。保存を中止しました。');}
  async save(provider,key){const file=this.file(provider);if(typeof key!=='string'||key.length<10||key.length>512||/\s/.test(key))throw new Error('APIキーの形式を確認してください。');this.check();await fs.mkdir(this.folder,{recursive:true});await fs.writeFile(file+'.tmp',this.encryption.encryptString(key),{mode:0o600});await fs.rename(file+'.tmp',file);this.present[provider]=true;}
  async read(provider){const file=this.file(provider);this.check();if(!this.present[provider])throw new Error('設定の「AI接続」でAPIキーを登録してください。');return this.encryption.decryptString(await fs.readFile(file));}
  async remove(provider){const file=this.file(provider);await fs.rm(file+'.tmp',{force:true});await fs.rm(file,{force:true});this.present[provider]=false;}
}
module.exports={CloudKeys};
