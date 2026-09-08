/**
 * curveClassifier.js
 *
 * Kern-Logik von Schritt 1 des Motorrad-Explorer-Projekts:
 * aus einer Liste von GPS-Punkten (lat/lon) den Kurventyp pro
 * Streckenabschnitt ableiten.
 *
 * Ablauf:
 *   1. Resampling auf einen festen Punktabstand (Rohdaten von
 *      Handy-GPS sind unregelmäßig verteilt und verrauscht -
 *      ohne Resampling verfälscht das die Krümmungsberechnung).
 *   2. Krümmungsradius pro Punkt via Menger-Krümmung aus drei
 *      benachbarten Punkten (lokal in Metern projiziert).
 *   3. Radius -> Kategorie (Kehre / enge Kurve / Flow-Kurve / Gerade).
 *   4. Glättung (gleitender Mittelwert) gegen Ausreißer.
 *   5. Aufeinanderfolgende Punkte gleicher Kategorie zu Segmenten
 *      zusammenfassen.
 *
 * Verwendung:
 *   import { classifyTrack } from './curveClassifier.js';
 *   const { classifiedPoints, segments, stats } = classifyTrack(points);
 */

// Kategorie-Grenzwerte in Metern (Radius). Ausgangswerte aus der
// Konzeptbesprechung - bei Bedarf später pro Nutzer/Fahrstil justierbar.
export const CURVE_CATEGORIES = {
  KEHRE: { key: 'kehre', label: 'Kehre', maxRadius: 15 },
  ENGE_KURVE: { key: 'enge_kurve', label: 'Enge Kurve', maxRadius: 50 },
  FLOW_KURVE: { key: 'flow_kurve', label: 'Flow-Kurve', maxRadius: 150 },
  GERADE: { key: 'gerade', label: 'Gerade / weite Kurve', maxRadius: Infinity },
};

const RESAMPLE_STEP_M = 10; // Punktabstand nach Resampling
const SMOOTHING_WINDOW = 3; // gleitender Mittelwert über N Radiuswerte
const MIN_SEGMENT_LENGTH_M = 30; // kürzere (Nicht-Kehre-)Segmente werden mit Nachbarn verschmolzen

/**
 * Hauptfunktion: liefert klassifizierte Punkte, aggregierte
 * Segmente und eine Zusammenfassung (Anzahl je Kategorie).
 */
export function classifyTrack(rawPoints, options = {}) {
  const step = options.resampleStepM ?? RESAMPLE_STEP_M;

  if (rawPoints.length < 3) {
    throw new Error('Track braucht mindestens 3 Punkte für eine Krümmungsberechnung.');
  }

  const resampled = resampleTrack(rawPoints, step);
  const localPoints = toLocalMeters(resampled);

  const radii = localPoints.map((_, i) => curvatureRadiusAt(localPoints, i));
  const smoothedRadii = movingAverage(radii, SMOOTHING_WINDOW);

  const classifiedPoints = resampled.map((p, i) => ({
    lat: p.lat,
    lon: p.lon,
    ele: p.ele,
    radius: smoothedRadii[i],
    category: categoryForRadius(smoothedRadii[i]),
  }));

  const rawSegments = buildSegments(classifiedPoints, step);
  const segments = mergeSmallSegments(
    rawSegments,
    options.minSegmentLengthM ?? MIN_SEGMENT_LENGTH_M
  );
  const stats = summarize(segments);

  return { classifiedPoints, segments, stats };
}

/**
 * Ordnet einem Krümmungsradius (Meter) eine Kategorie zu.
 * `Infinity` bzw. sehr große Radien = Gerade.
 */
export function categoryForRadius(radius) {
  if (radius <= CURVE_CATEGORIES.KEHRE.maxRadius) return CURVE_CATEGORIES.KEHRE;
  if (radius <= CURVE_CATEGORIES.ENGE_KURVE.maxRadius) return CURVE_CATEGORIES.ENGE_KURVE;
  if (radius <= CURVE_CATEGORIES.FLOW_KURVE.maxRadius) return CURVE_CATEGORIES.FLOW_KURVE;
  return CURVE_CATEGORIES.GERADE;
}

// ---------------------------------------------------------------
// Resampling: Track auf gleichmäßigen Punktabstand bringen
// ---------------------------------------------------------------

function resampleTrack(points, stepM) {
  const result = [points[0]];
  let carry = 0;

  for (let i = 1; i < points.length; i++) {
    let prev = points[i - 1];
    const curr = points[i];
    let segLen = haversine(prev, curr);

    while (carry + segLen >= stepM) {
      const remaining = stepM - carry;
      const f = remaining / segLen;
      const interp = lerpPoint(prev, curr, f);
      result.push(interp);
      prev = interp;
      segLen = haversine(prev, curr);
      carry = 0;
    }
    carry += segLen;
  }

  return result;
}

function lerpPoint(a, b, f) {
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    ele: a.ele != null && b.ele != null ? a.ele + (b.ele - a.ele) * f : null,
  };
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------
// Lokale Projektion (lat/lon -> Meter), nötig für die
// Krümmungsberechnung per Dreiecksfläche
// ---------------------------------------------------------------

function toLocalMeters(points) {
  const lat0 = points[0].lat;
  const lon0 = points[0].lon;
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);

  return points.map((p) => ({
    x: (p.lon - lon0) * mPerDegLon,
    y: (p.lat - lat0) * mPerDegLat,
  }));
}

// ---------------------------------------------------------------
// Krümmung: Menger-Krümmung aus drei aufeinanderfolgenden Punkten
// radius = 1 / curvature; an den Rändern (erster/letzter Punkt)
// wird der Radius des Nachbarpunkts übernommen.
// ---------------------------------------------------------------

function curvatureRadiusAt(localPoints, i) {
  if (i === 0 || i === localPoints.length - 1) {
    // Randpunkte: von direktem Nachbarn übernehmen (nach der
    // eigentlichen Berechnung befüllt, s. u.)
    return null;
  }

  const A = localPoints[i - 1];
  const B = localPoints[i];
  const C = localPoints[i + 1];

  const a = dist(B, C);
  const b = dist(A, C);
  const c = dist(A, B);

  const area = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;

  const denom = a * b * c;
  if (denom < 1e-6) return Infinity; // Punkte praktisch identisch

  const curvature = (4 * area) / denom;
  if (curvature < 1e-6) return Infinity; // keine messbare Krümmung -> Gerade

  return 1 / curvature;
}

function dist(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function movingAverage(values, window) {
  // Randpunkte (null) mit dem nächsten gültigen Wert auffüllen
  const filled = values.slice();
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] == null) {
      filled[i] = filled[i + 1] ?? filled[i - 1] ?? Infinity;
    }
  }

  const half = Math.floor(window / 2);
  return filled.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(filled.length - 1, i + half);
    const slice = filled.slice(start, end + 1).filter((v) => Number.isFinite(v));
    if (slice.length === 0) return Infinity;
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

// ---------------------------------------------------------------
// Segmentierung: aufeinanderfolgende Punkte gleicher Kategorie
// zu einem Segment zusammenfassen
// ---------------------------------------------------------------

function buildSegments(classifiedPoints, stepM) {
  const segments = [];
  let current = null;

  for (const p of classifiedPoints) {
    if (!current || current.category.key !== p.category.key) {
      if (current) segments.push(current);
      current = {
        category: p.category,
        points: [p],
      };
    } else {
      current.points.push(p);
    }
  }
  if (current) segments.push(current);

  return segments.map((seg) => ({
    category: seg.category,
    startPoint: seg.points[0],
    endPoint: seg.points[seg.points.length - 1],
    pointCount: seg.points.length,
    lengthM: (seg.points.length - 1) * stepM,
    points: seg.points,
  }));
}

/**
 * Verschmilzt Segmente, die kürzer als minLengthM sind, mit einem
 * Nachbarsegment. Ohne diesen Schritt "zittert" die Klassifikation
 * an Kurvenein-/-ausgängen zwischen mehreren Kategorien und erzeugt
 * viele winzige Segmente statt zusammenhängender Abschnitte.
 *
 * Regel: das kleine Segment wird dem längeren der beiden Nachbarn
 * zugeschlagen (dessen Kategorie "gewinnt"). Läuft iterativ, bis
 * keine zu kurzen Segmente mehr übrig sind oder nur noch eines da ist.
 */
function mergeSmallSegments(segments, minLengthM) {
  let list = segments.map((s) => ({ ...s, points: s.points.slice() }));

  let mergedSomething = true;
  while (mergedSomething && list.length > 1) {
    mergedSomething = false;

    for (let i = 0; i < list.length; i++) {
      // Kehren sind naturgemäß kurz (enger Radius = kurze Strecke
      // pro Winkelgrad) - die dürfen nie wegfusioniert werden, sonst
      // verschwindet ausgerechnet die wichtigste Kategorie.
      if (list[i].category.key === CURVE_CATEGORIES.KEHRE.key) continue;
      if (list[i].lengthM >= minLengthM) continue;

      const left = list[i - 1] ?? null;
      const right = list[i + 1] ?? null;

      let target;
      if (left && right) {
        target = left.lengthM >= right.lengthM ? 'left' : 'right';
      } else if (left) {
        target = 'left';
      } else if (right) {
        target = 'right';
      } else {
        break; // einziges Segment übrig, nichts zu tun
      }

      if (target === 'left') {
        list[i - 1] = combineSegments(left, list[i]);
        list.splice(i, 1);
      } else {
        list[i + 1] = combineSegments(list[i], right);
        list.splice(i, 1);
      }

      mergedSomething = true;
      break; // Liste hat sich verändert, Schleife neu starten
    }
  }

  return list;
}

function combineSegments(a, b) {
  // Kehre hat immer Vorrang - sonst könnte eine kurze, unwichtige
  // Nachbar-Kategorie eine (naturgemäß kurze) Kehre beim Verschmelzen
  // überschreiben. Ansonsten setzt sich die Kategorie des längeren
  // Teils durch.
  let category;
  if (a.category.key === CURVE_CATEGORIES.KEHRE.key) category = a.category;
  else if (b.category.key === CURVE_CATEGORIES.KEHRE.key) category = b.category;
  else category = a.lengthM >= b.lengthM ? a.category : b.category;

  const points = [...a.points, ...b.points];

  return {
    category,
    startPoint: a.startPoint,
    endPoint: b.endPoint,
    pointCount: points.length,
    lengthM: a.lengthM + b.lengthM,
    points,
  };
}

function summarize(segments) {
  const stats = {
    kehre: { count: 0, lengthM: 0 },
    enge_kurve: { count: 0, lengthM: 0 },
    flow_kurve: { count: 0, lengthM: 0 },
    gerade: { count: 0, lengthM: 0 },
  };

  for (const seg of segments) {
    const key = seg.category.key;
    stats[key].count += 1;
    stats[key].lengthM += seg.lengthM;
  }

  return stats;
}
