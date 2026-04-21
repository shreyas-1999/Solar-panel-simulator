// PVGIS bridge: calls the main process (which performs the HTTPS request).
(function (global) {
  async function getYield({ lat, lon, tilt, azimuth, loss }) {
    if (!global.solarApi) {
      // Fallback constant if running outside Electron
      return { ok: false, error: 'Not running inside Electron', E_d: null };
    }
    return await global.solarApi.getPVGIS({ lat, lon, tilt, azimuth, loss });
  }
  global.SolarPVGIS = { getYield };
})(window);
