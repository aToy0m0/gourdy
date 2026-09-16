const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('dictation',{
  forceStop:()=>ipcRenderer.invoke('force-stop'),
  reportError:message=>ipcRenderer.invoke('report-mini-error',message),
  downloadCommandModel:()=>ipcRenderer.invoke('download-command-model'),cancelCommandDownload:()=>ipcRenderer.invoke('cancel-command-download'),
  recordingList:()=>ipcRenderer.invoke('recording-list'),recordingPreview:id=>ipcRenderer.invoke('recording-preview',id),recordingDelete:id=>ipcRenderer.invoke('recording-delete',id),recordingRetry:id=>ipcRenderer.invoke('recording-retry',id),
  meetingList:()=>ipcRenderer.invoke('meeting-list'),meetingRead:id=>ipcRenderer.invoke('meeting-read',id),meetingSelect:()=>ipcRenderer.invoke('meeting-select'),meetingPreview:(id,start)=>ipcRenderer.invoke('meeting-preview',id,start),meetingRun:id=>ipcRenderer.invoke('meeting-run',id),meetingCopy:id=>ipcRenderer.invoke('meeting-copy',id),meetingExport:id=>ipcRenderer.invoke('meeting-export',id),meetingDelete:id=>ipcRenderer.invoke('meeting-delete',id), cancelMedia:()=>ipcRenderer.invoke('cancel-media'),
  exportIme:()=>ipcRenderer.invoke('export-ime'),importDictionaryFile:()=>ipcRenderer.invoke('import-dictionary-file'),
  importIme:()=>ipcRenderer.invoke('import-ime'), snapshot:()=>ipcRenderer.invoke('snapshot'), miniSettings:()=>ipcRenderer.invoke('mini-settings'), save:patch=>ipcRenderer.invoke('save-settings',patch),
  closeSettings:()=>ipcRenderer.invoke('close-settings'), openSettings:tab=>ipcRenderer.invoke('open-settings',tab), hide:()=>ipcRenderer.invoke('hide-mini'), destroy:action=>ipcRenderer.invoke('destroy-data',action),
  deleteHistory:id=>ipcRenderer.invoke('delete-history',id), copy:text=>ipcRenderer.invoke('copy',text), pasteAtCursor:text=>ipcRenderer.invoke('paste-at-cursor',text),
  liveStart:mode=>ipcRenderer.invoke('live-start',mode), liveChunk:bytes=>ipcRenderer.invoke('live-chunk',bytes), liveFinish:()=>ipcRenderer.invoke('live-finish'),liveEnd:()=>ipcRenderer.invoke('live-end'),cancel:()=>ipcRenderer.invoke('cancel'),
  on:(channel,callback)=>{if(!['command-model-changed','command-progress','command-start','command-release','command-result','toggle','notice','settings-changed','data-changed','request-close','select-tab','phase-changed','meeting-changed'].includes(channel))throw new Error('Unknown event');ipcRenderer.on(channel,(_,value)=>callback(value));}
});
