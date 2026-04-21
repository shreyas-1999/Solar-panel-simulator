// Local ENU (East-North-Up) projection helpers + 2D rotation.
// Good enough for site-scale layouts (sub-meter accuracy within a few km).
(function (global) {
  const DEG = Math.PI / 180;
  const M_PER_DEG_LAT = 110540; // meters per degree latitude
  const M_PER_DEG_LON = 111320; // base meters per degree longitude at equator

  function makeProjection(lat0, lon0) {
    const cosLat0 = Math.cos(lat0 * DEG);
    return {
      lat0,
      lon0,
      toXY(lat, lon) {
        const x = (lon - lon0) * cosLat0 * M_PER_DEG_LON;
        const y = (lat - lat0) * M_PER_DEG_LAT;
        return [x, y];
      },
      toLatLon(x, y) {
        const lat = lat0 + y / M_PER_DEG_LAT;
        const lon = lon0 + x / (cosLat0 * M_PER_DEG_LON);
        return [lat, lon];
      }
    };
  }

  function rotate(pt, angDeg) {
    const a = angDeg * DEG;
    const c = Math.cos(a), s = Math.sin(a);
    return [pt[0] * c - pt[1] * s, pt[0] * s + pt[1] * c];
  }

  function rotatePoly(poly, angDeg) {
    return poly.map((p) => rotate(p, angDeg));
  }

  function bbox(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  // Ray-casting point in polygon
  function pointInPoly(pt, poly) {
    const x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect =
        (yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distToSegment(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  function minDistToPoly(pt, poly) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const d = distToSegment(pt, a, b);
      if (d < best) best = d;
    }
    return best;
  }

  // Polygon area in m^2 via shoelace (poly in meters).
  function polyAreaM2(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }

  // Robust segment intersection (strict, no shared endpoint counts only if overlap).
  function segmentsIntersect(p1, p2, p3, p4) {
    const d = (a, b, c) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = d(p3, p4, p1);
    const d2 = d(p3, p4, p2);
    const d3 = d(p1, p2, p3);
    const d4 = d(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    return false;
  }

  // True if polygons A and B overlap (share interior area).
  // A or B may be non-convex; both expected as arrays of [x,y].
  function polysOverlap(A, B) {
    // 1) any vertex of A inside B (or vice versa)
    for (const p of A) if (pointInPoly(p, B)) return true;
    for (const p of B) if (pointInPoly(p, A)) return true;
    // 2) any edge of A intersects any edge of B
    for (let i = 0; i < A.length; i++) {
      const a1 = A[i], a2 = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) {
        const b1 = B[j], b2 = B[(j + 1) % B.length];
        if (segmentsIntersect(a1, a2, b1, b2)) return true;
      }
    }
    return false;
  }

  global.SolarGeo = {
    DEG,
    makeProjection,
    rotate,
    rotatePoly,
    bbox,
    pointInPoly,
    minDistToPoly,
    polyAreaM2,
    segmentsIntersect,
    polysOverlap
  };
})(window);
