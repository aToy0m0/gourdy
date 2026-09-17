// Build PNG/ICO assets from the editable SVG with Chromium's SVG renderer.
const {app,BrowserWindow,nativeImage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
app.disableHardwareAcceleration();
app.setPath('userData',path.resolve(__dirname,'../artifacts/icon-renderer-profile'));
app.whenReady().then(async()=>{
 const dir=path.resolve(__dirname,'../src/assets'),svg=await fs.readFile(path.join(dir,'gourdy.svg'),'utf8');
 const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 await window.loadURL('data:text/html,<html></html>');
 const png=await window.webContents.executeJavaScript(`(async()=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(${JSON.stringify(svg)});await img.decode();const c=document.createElement('canvas');c.width=c.height=1024;c.getContext('2d').drawImage(img,0,0,1024,1024);return c.toDataURL('image/png').split(',')[1]})()`);
 const original=nativeImage.createFromBuffer(Buffer.from(png,'base64')),sizes=[16,20,24,32,40,48,64,128,256],images=sizes.map(size=>original.resize({width:size,height:size,quality:'best'}).toPNG());
 await fs.writeFile(path.join(dir,'gourdy.png'),original.resize({width:256,height:256,quality:'best'}).toPNG());
 for(const size of [16,20,24,32,48])await fs.writeFile(path.join(dir,`gourdy-${size}.png`),images[sizes.indexOf(size)]);
 const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((size,i)=>{const at=6+i*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(images[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[i].length;});
 await fs.writeFile(path.join(dir,'gourdy.ico'),Buffer.concat([header,...images]));
 await fs.mkdir(path.resolve(__dirname,'../docs/public/assets'),{recursive:true});
 await fs.copyFile(path.join(dir,'gourdy.png'),path.resolve(__dirname,'../docs/public/assets/gourdy.png'));
 console.log('Generated gourdy PNG sizes and multi-resolution ICO.');window.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
