const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('info',{close:()=>ipcRenderer.invoke('info-hide'),on:callback=>ipcRenderer.on('info',(_,text)=>callback(text))});
