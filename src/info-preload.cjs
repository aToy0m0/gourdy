const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('info',{setup:()=>ipcRenderer.invoke('info-setup'),close:()=>ipcRenderer.invoke('info-hide'),size:value=>ipcRenderer.invoke('info-size',value),on:callback=>ipcRenderer.on('info',(_,text)=>callback(text))});
