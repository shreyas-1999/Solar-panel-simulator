// Placement algorithm ported from Rev 5.8 SolarPro LISP.
// All math in local meters; caller handles lat/lon <-> meters and rotation.
(function (global) {
  const DEG = Math.PI / 180;

  function asin(x) {
    if (Math.abs(x) >= 1) return x > 0 ? Math.PI / 2 : -Math.PI / 2;
    return Math.atan2(x, Math.sqrt(1 - x * x));
  }

  // Solar altitude (deg) at given latitude (deg), declination (deg), solar hour (decimal).
  function solarAltitude(latDeg, decDeg, hour) {
    const lat = latDeg * DEG, dec = decDeg * DEG;
    const ha = (hour - 12) * 15 * DEG;
    return (
      asin(
        Math.sin(lat) * Math.sin(dec) +
          Math.cos(lat) * Math.cos(dec) * Math.cos(ha)
      ) / DEG
    );
  }

  // Inputs:
  //   boundary: array of [x,y] polygon vertices in meters (ROTATED into row-aligned frame)
  //   exclusions: array of polygons (each [x,y] arrays) in same frame
  //   cfg: see app.js for full schema
  // Returns:
  //   { tables: [{x,y,w,h,cols}], counts:{panels,tables,endClamps,midClamps,perSize:Map},
  //     params:{tableH, tableHProj, rowPitch, rowGap, tilt, solarAltDesign} }
  function generateLayout(boundary, exclusions, cfg) {
    const {
      modW, modH, orient,
      modPerRow, modPerStack,
      gapV, gapH, tableGapH,
      setoff,
      hRoadW, hRoadFreq, vRoadW, vRoadFreq,
      tilt, latitude,
      targetModules,
      startPoint // optional {x, y} in the rotated frame
    } = cfg;

    const actualW = orient === 'Portrait' ? modW : modH;
    const actualH = orient === 'Portrait' ? modH : modW;

    const tableH = actualH * modPerStack + gapV * (modPerStack - 1);
    const solarAltDesign = solarAltitude(latitude, -23.45, 9.5);
    const safeAlt = Math.max(5, solarAltDesign);
    const tableRise = tableH * Math.sin(tilt * DEG);
    const tableHProj = tableH * Math.cos(tilt * DEG);
    const rowGap = tableRise / Math.tan(safeAlt * DEG);
    const rowPitch = tableHProj + rowGap;

    const G = window.SolarGeo;
    const bb = G.bbox(boundary);

    function tableCorners(x, y, w) {
      return [
        [x, y],
        [x + w, y],
        [x + w, y + tableHProj],
        [x, y + tableHProj]
      ];
    }

    function placementOk(x, y, w) {
      const corners = tableCorners(x, y, w);
      // Boundary containment + setoff
      for (const c of corners) {
        if (!G.pointInPoly(c, boundary)) return false;
        if (G.minDistToPoly(c, boundary) < setoff * 0.99) return false;
      }
      // Exclusion: full polygon overlap (catches corners-in, edges crossing,
      // and the small-exclusion-fully-inside-table case).
      for (const exc of exclusions) {
        if (G.polysOverlap(corners, exc)) return false;
      }
      return true;
    }

    const tables = [];
    const perSize = new Map();
    let panels = 0, endClamps = 0, midClamps = 0;
    const tgtMods = targetModules > 0 ? targetModules : Number.POSITIVE_INFINITY;

    function tryPlace(x, y) {
      let cols = modPerRow;
      while (cols > 0) {
        const tw = actualW * cols + gapH * (cols - 1);
        if (placementOk(x, y, tw)) {
          tables.push({ x, y, w: tw, h: tableHProj, cols });
          endClamps += 2 * 2 * modPerStack;
          if (cols > 1) midClamps += (cols - 1) * 2 * modPerStack;
          perSize.set(cols, (perSize.get(cols) || 0) + 1);
          panels += cols * modPerStack;
          return tw;
        }
        cols -= 1;
      }
      return 0;
    }

    // ---- Row generation ----
    // If startPoint is provided, that point becomes the bottom-left anchor of
    // a table row, and rows are generated upward AND downward from it. Within
    // each row, tables are placed rightward AND leftward from the anchor X.
    // If not provided, fall back to the LISP behavior (start at boundary minX/minY).
    const sx = startPoint && isFinite(startPoint.x) ? startPoint.x : bb.minX + setoff;
    const sy = startPoint && isFinite(startPoint.y) ? startPoint.y : bb.minY + setoff;

    function placeRowFromAnchor(rowY, anchorX, rowOffsetIndex) {
      // returns true if at least one table was placed in this row
      let placedAny = false;

      // ---- Rightward sweep ----
      let curX = anchorX;
      let tInRow = 0;
      let safety = 0;
      while (panels < tgtMods && curX < bb.maxX - setoff && safety++ < 5000) {
        if (vRoadFreq > 0 && tInRow > 0 && tInRow % vRoadFreq === 0) {
          curX += vRoadW;
        }
        const tw = tryPlace(curX, rowY);
        if (tw > 0) {
          placedAny = true;
          curX += tw + tableGapH;
          tInRow += 1;
        } else {
          curX += actualW + tableGapH;
        }
      }

      // ---- Leftward sweep (only when an explicit start point is set) ----
      if (startPoint) {
        // First leftward table sits to the LEFT of anchor; we need its right edge
        // to be at (anchorX - tableGapH). We probe widths to find the largest fit.
        let rightEdge = anchorX - tableGapH;
        let tLeft = 0;
        safety = 0;
        while (panels < tgtMods && rightEdge > bb.minX + setoff && safety++ < 5000) {
          if (vRoadFreq > 0 && tLeft > 0 && tLeft % vRoadFreq === 0) {
            rightEdge -= vRoadW;
          }
          // probe largest cols that fits with its left edge inside boundary
          let placedW = 0;
          let cols = modPerRow;
          while (cols > 0) {
            const tw = actualW * cols + gapH * (cols - 1);
            const xLeft = rightEdge - tw;
            if (xLeft >= bb.minX + setoff && placementOk(xLeft, rowY, tw)) {
              tables.push({ x: xLeft, y: rowY, w: tw, h: tableHProj, cols });
              endClamps += 2 * 2 * modPerStack;
              if (cols > 1) midClamps += (cols - 1) * 2 * modPerStack;
              perSize.set(cols, (perSize.get(cols) || 0) + 1);
              panels += cols * modPerStack;
              placedW = tw;
              break;
            }
            cols -= 1;
          }
          if (placedW > 0) {
            placedAny = true;
            rightEdge = rightEdge - placedW - tableGapH;
            tLeft += 1;
          } else {
            rightEdge -= actualW + tableGapH;
          }
        }
      }

      return placedAny;
    }

    // Generate rows going UP from anchor, then DOWN from anchor
    let rowIdx = 0;
    let y = sy;
    let rowsUp = 0, rowsDown = 0;
    let safety = 0;
    while (y + tableHProj <= bb.maxY - setoff && panels < tgtMods && safety++ < 5000) {
      if (hRoadFreq > 0 && rowsUp > 0 && rowsUp % hRoadFreq === 0) {
        y += hRoadW;
        if (y + tableHProj > bb.maxY - setoff) break;
      }
      placeRowFromAnchor(y, sx, rowIdx);
      y += rowPitch;
      rowsUp += 1;
      rowIdx += 1;
    }

    if (startPoint) {
      let yd = sy - rowPitch;
      safety = 0;
      while (yd >= bb.minY + setoff && panels < tgtMods && safety++ < 5000) {
        if (hRoadFreq > 0 && rowsDown > 0 && rowsDown % hRoadFreq === 0) {
          yd -= hRoadW;
          if (yd < bb.minY + setoff) break;
        }
        placeRowFromAnchor(yd, sx, -1 - rowsDown);
        yd -= rowPitch;
        rowsDown += 1;
      }
    }

    return {
      tables,
      counts: {
        panels,
        tables: tables.length,
        endClamps,
        midClamps,
        perSize
      },
      params: {
        tableH,
        tableHProj,
        rowPitch,
        rowGap,
        tilt,
        solarAltDesign,
        actualW,
        actualH
      }
    };
  }

  function calcProduction(panels, watt, dailyYieldPerKWp) {
    const capKW = (panels * watt) / 1000;
    const capMW = capKW / 1000;
    const daily = capKW * dailyYieldPerKWp;
    const annual = daily * 365;
    return { capMW, capKW, daily, annual, dailyYieldPerKWp };
  }

  global.SolarLayout = { generateLayout, calcProduction, solarAltitude };
})(window);
