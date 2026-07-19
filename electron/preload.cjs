const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('designxDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
  },
});
