const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solarApi', {
  getPVGIS: (params) => ipcRenderer.invoke('pvgis:get', params)
});
