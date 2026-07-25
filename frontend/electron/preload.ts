import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectDownloadDirectory: () => ipcRenderer.invoke('select-download-directory'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getDefaultDownloads: () => ipcRenderer.invoke('get-default-downloads'),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),
  getBackendUrl: () => ipcRenderer.invoke('backend-url'),
})
