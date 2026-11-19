// جسر آمن بين الصفحة وتطبيق سطح المكتب (الطابعات، إعدادات الجهاز، الاتصال بالخادم)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  print: (html, opts) => ipcRenderer.invoke('print', html, opts || {}),
  printers: () => ipcRenderer.invoke('printers'),
  previewPrint: (html, opts) => ipcRenderer.invoke('print:preview', html, opts || {}),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch || {}),
  discover: () => ipcRenderer.invoke('discover'),
  connect: (url) => ipcRenderer.invoke('connect', url),
  showConnect: () => ipcRenderer.invoke('show-connect'),
});
