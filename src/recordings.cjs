const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {atomic}=require('./meetings.cjs');
const MAX_BYTES=16000*4*300;
function header(bytes){const b=Buffer.alloc(44);b.write('RIFF');b.writeUInt32LE(bytes+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(64000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(bytes,40);return b;}
class Recordings {
 constructor(folder){this.folder=folder;this.active=null;}
 file(id,ext){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('録音IDが不正です。');return path.join(this.folder,id+'.'+ext);}
 async read(id){const row=JSON.parse(await fs.readFile(this.file(id,'json'),'utf8'));if(row.id!==id||!Number.isFinite(Date.parse(row.at))||!Number.isFinite(row.duration)||row.duration<0||row.duration>300)throw new Error('録音情報が不正です。');return row;}
 async list(){await fs.mkdir(this.folder,{recursive:true});const rows=[];for(const name of await fs.readdir(this.folder)){if(name.endsWith('.json'))rows.push(await this.read(name.slice(0,-5)));}return rows.sort((a,b)=>b.at.localeCompare(a.at));}
 async recover(){for(const row of await this.list()){if(row.state==='recording'){const file=this.file(row.id,'wav'),size=(await fs.stat(file)).size-44;if(size<0||size%4||size>MAX_BYTES)throw new Error('保存途中の録音サイズが不正です。');const h=await fs.open(file,'r+');try{await h.write(header(size),0,44,0);await h.sync();}finally{await h.close();}await atomic(this.file(row.id,'json'),{...row,state:'interrupted',duration:size/64000});}}await this.prune();}
 async prune(){const rows=await this.list();for(const [i,row] of rows.entries())if(row.id!==this.active?.id&&(i>=10||Date.now()-Date.parse(row.at)>7*86400000))await this.remove(row.id);}
 async start(){if(this.active)throw new Error('録音保存は既に開始しています。');await fs.mkdir(this.folder,{recursive:true});const row={id:randomUUID(),at:new Date().toISOString(),state:'recording',duration:0};const handle=await fs.open(this.file(row.id,'wav'),'wx');try{await handle.write(header(0));await handle.sync();await atomic(this.file(row.id,'json'),row);}catch(e){await handle.close();await fs.rm(this.file(row.id,'wav'),{force:true});throw e;}this.active={...row,handle,bytes:0,synced:0};await this.prune();return row.id;}
 async append(bytes){const a=this.active;if(!a)throw new Error('録音保存が開始していません。');if(bytes.length%4||a.bytes+bytes.length>MAX_BYTES)throw new Error('録音保存は5分までです。');await a.handle.writeFile(bytes);a.bytes+=bytes.length;if(a.bytes-a.synced>=64000){await a.handle.sync();a.synced=a.bytes;}}
 async finish(state='saved'){const a=this.active;if(!a)return;try{await a.handle.write(header(a.bytes),0,44,0);await a.handle.sync();}finally{await a.handle.close();this.active=null;}const row={id:a.id,at:a.at,state,duration:a.bytes/64000};await atomic(this.file(a.id,'json'),row);return row;}
 async remove(id){if(id===this.active?.id)throw new Error('録音終了後に削除してください。');await fs.rm(this.file(id,'wav'),{force:true});await fs.rm(this.file(id,'json'),{force:true});}
}
module.exports={Recordings,header,MAX_BYTES};
