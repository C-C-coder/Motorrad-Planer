/**
 * gpxParser.js
 *
 * Liest eine GPX-Datei (als String) ein und liefert eine flache
 * Liste von Track-Punkten zurück. Bewusst simpel gehalten -
 * unterstützt einen einzelnen <trk> mit einem oder mehreren
 * <trkseg>, was für Motorradtouren der Normalfall ist.
 *
 * Verwendung:
 *   import { parseGPX } from './gpxParser.js';
 *   const points = parseGPX(gpxString);
 *   // points: [{ lat, lon, ele, time }, ...]
 */

export function parseGPX(gpxString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxString, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('GPX konnte nicht gelesen werden: ungültiges XML.');
  }

  const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
  if (trkpts.length === 0) {
    throw new Error('Keine Track-Punkte (trkpt) in der GPX-Datei gefunden.');
  }

  const points = trkpts.map((node) => {
    const lat = parseFloat(node.getAttribute('lat'));
    const lon = parseFloat(node.getAttribute('lon'));

    const eleNode = node.getElementsByTagName('ele')[0];
    const ele = eleNode ? parseFloat(eleNode.textContent) : null;

    const timeNode = node.getElementsByTagName('time')[0];
    const time = timeNode ? new Date(timeNode.textContent) : null;

    return { lat, lon, ele, time };
  });

  // Punkte mit ungültigen Koordinaten aussortieren (kommt bei
  // fehlerhaften Tracks/Handy-GPS-Ausreißern gelegentlich vor)
  return points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)
  );
}

/**
 * Gesamtdistanz eines Tracks in Metern (Haversine, Summe über alle
 * aufeinanderfolgenden Punktpaare).
 */
export function trackDistanceMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Höhenmeter im Anstieg (Summe aller positiven Höhenänderungen).
 * Punkte ohne Höhenangabe werden übersprungen.
 */
export function elevationGainMeters(points) {
  let gain = 0;
  let prevEle = null;
  for (const p of points) {
    if (p.ele == null) continue;
    if (prevEle != null && p.ele > prevEle) {
      gain += p.ele - prevEle;
    }
    prevEle = p.ele;
  }
  return gain;
}

export function haversineMeters(a, b) {
  const R = 6371000; // Erdradius in Metern
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}
