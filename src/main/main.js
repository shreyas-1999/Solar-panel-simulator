// Electron main process
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const https = require('https');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: 'SolarPro Map',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Open external links (e.g., PVGIS docs) in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// PVGIS proxy: avoids CORS by fetching from the main process.
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'SolarPro-Map/1.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`PVGIS HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON from PVGIS'));
          }
        });
      })
      .on('error', reject);
  });
}

ipcMain.handle('pvgis:get', async (_evt, { lat, lon, tilt, azimuth, loss }) => {
  const url =
    `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
    `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` +
    `&peakpower=1&loss=${loss ?? 14}` +
    `&mountingplace=free&angle=${Math.round(tilt)}&aspect=${Math.round(azimuth)}` +
    `&outputformat=json`;
  try {
    const j = await fetchJson(url);
    // E_d = average daily energy production (kWh/kWp/day)
    const E_d = j?.outputs?.totals?.fixed?.E_d ?? null;
    const E_y = j?.outputs?.totals?.fixed?.E_y ?? null; // annual kWh/kWp
    return { ok: true, E_d, E_y, raw: j?.outputs?.totals?.fixed ?? null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
