// Injects a small (i) info icon next to every form field, with a tooltip
// (HTML title attribute) describing what the field does. Centralized so the
// HTML stays clean.
(function () {
  const HELP = {
    capMode:
      'Target MWp = stop placing tables once the target wattage is met. ' +
      'Maximum = fill the entire boundary with as many tables as possible.',
    targetMW:
      'Total DC capacity in megawatts-peak (MWp) you want the layout to reach. ' +
      'Ignored when Capacity Mode is set to Maximum.',
    modW:
      'Physical width of one PV module in meters (the shorter side for typical ' +
      'rectangular modules). Example: 1.134 m for a common 585 Wp panel.',
    modH:
      'Physical height (long side) of one PV module in meters. ' +
      'Example: 2.278 m for a common 585 Wp panel.',
    modWatt:
      'Nameplate DC power of a single module in watts-peak (Wp). Used for ' +
      'capacity, BOM and PVGIS energy calculations.',
    orient:
      'Portrait = long side vertical (along the tilt). Landscape = long side ' +
      'horizontal (along the row). Affects table footprint and inter-row pitch.',
    lat:
      'Site latitude in decimal degrees. Auto-filled from the centroid of the ' +
      'boundary you draw. Used for tilt default, sun-angle math and PVGIS.',
    lon:
      'Site longitude in decimal degrees. Auto-filled from the centroid of the ' +
      'boundary you draw. Used by PVGIS to fetch local irradiation.',
    tilt:
      'Module tilt angle from horizontal in degrees. Leave blank to use the ' +
      'absolute latitude as the tilt (a common rule-of-thumb optimum).',
    az:
      'Array azimuth in degrees. 0° = facing true South (Northern hemisphere ' +
      'optimum). +90° = West, −90° = East. Rotates the entire row layout.',
    setoff:
      'Minimum clear distance in meters between any panel edge and the ' +
      'boundary polygon (perimeter buffer for cabling, walkways, fencing).',
    loss:
      'PVGIS system loss percentage (cables, soiling, inverter, mismatch, etc). ' +
      'Typical default is 14%. Higher loss reduces predicted energy.',
    modRow:
      'Maximum number of modules placed side-by-side in one row of a table. ' +
      'The algorithm will reduce this near edges so partial tables can fit.',
    modStack:
      'Number of modules stacked along the tilt direction within one table. ' +
      'Common values: 1 (1P), 2 (2P), 3 (3P).',
    gapV:
      'Vertical gap in meters between stacked module rows inside the same ' +
      'table (typical 0.02 m for clamp clearance).',
    gapH:
      'Horizontal gap in meters between adjacent modules inside the same ' +
      'table (typical 0.02 m for thermal expansion).',
    tGapH:
      'Gap in meters between two adjacent tables placed side-by-side in the ' +
      'same row (clamp / structure spacing).',
    hRoadW:
      'Width in meters of horizontal access roads inserted between rows of ' +
      'tables for O&M vehicle access.',
    hRoadFreq:
      'Insert one horizontal road after every N rows of tables. Set to 0 to ' +
      'disable horizontal roads entirely.',
    vRoadW:
      'Width in meters of vertical access roads inserted between groups of ' +
      'tables within a row.',
    vRoadFreq:
      'Insert one vertical road after every N tables in a row. Set to 0 to ' +
      'disable vertical roads entirely.',
    panelColor:
      'Pick any color for the PV modules drawn on the map. Use the dropdown ' +
      'beside it for quick presets. Updates live without re-generating.',
    panelOpacity:
      'Opacity of the module fill (0.1 = nearly transparent so the satellite ' +
      'image shows through, 1.0 = fully opaque).'
  };

  function init() {
    for (const id in HELP) {
      const el = document.getElementById(id);
      if (!el) continue;
      const label = el.closest('label');
      if (!label) continue;
      // Avoid double-injection on Ctrl+R reloads
      if (label.querySelector('.info-icon')) continue;
      const icon = document.createElement('span');
      icon.className = 'info-icon';
      icon.textContent = 'i';
      icon.setAttribute('title', HELP[id]);
      icon.setAttribute('aria-label', HELP[id]);
      // Insert at the start of the label, before the field name text.
      label.insertBefore(icon, label.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
