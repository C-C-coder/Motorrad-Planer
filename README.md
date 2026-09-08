# Motorrad Explorer

PWA für kurvenreiche Motorrad-Tagesausflüge im Freundeskreis –
Routenplanung nach Kurvenkategorie, Wetter-/Straßenzustand-Ampel,
Community-Bewertung von Streckenabschnitten und persönliche
Fahrstatistik/Ranking.

## Projektstatus

**Schritt 1 – GPX-Import + Kurventyp-Klassifikation: fertig (Prototyp)**

- `js/gpxParser.js` – liest GPX-Dateien ein, berechnet Gesamtdistanz
  und Höhenmeter
- `js/curveClassifier.js` – Kernstück: berechnet den Krümmungsradius
  entlang eines Tracks und klassifiziert jeden Abschnitt in
  **Kehre**, **Enge Kurve**, **Flow-Kurve** oder **Gerade**
- `kurven-test.html` – Testseite mit Karte (Leaflet/OSM), zeigt einen
  GPX-Track farblich nach Kurventyp eingefärbt, inkl. Statistik und
  Segmenttabelle
- `test-track.gpx` – synthetischer Testtrack zum Ausprobieren
  (Gerade → 5 Kehren → Flow-Kurven → Wechselkurven → Gerade)

## Nächste Schritte (geplant)

1. Firestore-Datenmodell aufsetzen (`way_segments`, `segment_ratings`, `rides`)
2. Einfacher Routenplaner mit einer Kurven-Kategorie
3. Wetter-/Straßenzustand-Ampel entlang der Route (Open-Meteo)
4. "Fahrt bestätigen" + persönliche Statistik
5. Bewertungssystem für Streckenabschnitte
6. Explorer-Modus (unbekannte, aber vielversprechende Strecken vorschlagen)

## Architektur (bewusst 100% kostenlos)

| Baustein | Dienst | Kosten |
|---|---|---|
| Hosting der PWA | Firebase Hosting (Spark-Tarif) | 0 € |
| Datenbank (Bewertungen, Statistik) | Firestore (Spark-Tarif) | 0 € |
| Login fürs Ranking | Firebase Authentication (Spark-Tarif) | 0 € |
| Straßendaten | Overpass API | 0 € |
| Wetterdaten | Open-Meteo | 0 € |
| Routing-Logik | eigener JS-Code im Browser (kein Server) | 0 € |

Bewusst **kein** Firebase Cloud Functions / kein eigener Server, da
das den kostenpflichtigen Blaze-Tarif (mit Kreditkarten-Hinterlegung)
voraussetzen würde.

## Lokal testen

`kurven-test.html` einfach im Browser öffnen (lädt Leaflet/OSM-Kacheln
aus dem Netz). Über den Datei-Auswähler oben lassen sich auch eigene
GPX-Tracks laden.
