# Changelog - FragezeichenArchiv

Alle wichtigen Änderungen und Feature-Releases dieses Projekts von Version 1.0.0 bis Version 2.0.0.

---

## [2.0.0] - 2026-06-27 (Aktuelle Version)
### Hinzugefügt
- **Präzises Tracking des Hörverlaufs:** Die exakte Position (Sekunden) wird beim Abspielen jede Sekunde (gedrosselt) sowie sofort beim Pausieren im Verlauf gespeichert.
- **Lesezeichen-Fortsetzung:** Beim Klicken auf einen Eintrag im Hörverlauf wird die Wiedergabe an genau der Stelle fortgesetzt, an der sie gestoppt wurde.
- **Download-Funktion:**
  - Download-Buttons für jeden einzelnen Track direkt in den Modal-Listen.
  - Ein **"Folge herunterladen"**-Button in der Detailansicht, der alle Tracks einer Episode nacheinander herunterlädt (zeitlich versetzt um 800 ms, um Browser-Downloadsperren zu verhindern).
- **GitHub Repository Link:** Ein Button in den "Quellen & Infos" führt direkt zum GitHub-Projekt.

### Behoben
- **Fehlerfreie Übergänge:** Die künstliche Abschneidung der letzten 0,8 Sekunden wurde entfernt. Der Übergang zur nächsten Datei wird nun über standardmäßige HTML5 `onended`-Events am exakten Ende des Tracks ausgeführt.
- **Mobiles Grid-Layout:** Grid-Spalten auf Mobilgeräten nutzen jetzt `repeat(2, minmax(0, 1fr))` und `min-width: 0`, sodass die Cover-Karten exakt 50 % der Bildschirmbreite einnehmen und Texte sauber mit Auslassungspunkten gekürzt werden.
- **macOS-Metadaten-Ignorierung:** Doppelte Tracks und versteckte `.DS_Store` / `__MACOSX` Ordner bzw. `._*` Dateien werden beim Generieren und Hochladen ignoriert (die Track-Zahl von z.B. "Das Seeungeheuer" wurde von 52 auf 26 bereinigt).
- **Hotel Luxury End Cover-Fix:** Die Bonus-Episode "Hotel Luxury End" (Die dr3i) wurde von Episode 99 in Episode 9 umbenannt, wodurch das vorhandene Cover `covers/D_9.jpg` automatisch geladen wird.

---

## [1.4.0] - 2026-06-26
### Hinzugefügt
- **Sonderfolgen & Die dr3i Integration:**
  - Eigener "Specials"-Reiter im Seitenmenü und der mobilen Menüleiste.
  - Dynamischer Metadaten-Generierer `build_metadata.py`, der Tags (Dauer, Titel, Größe) direkt aus FLAC/MP3-Dateien über `mutagen` liest und Cover-Bilder extrahiert.
- **Uploader-Kollisionsschutz:** Der Uploader unterscheidet nun offizielle Folgen von Specials und Die dr3i anhand eindeutiger IDs (`D_X`, `S_X`) in der `fileditch_tracks.json`.

### Geändert
- Der offizielle Episoden-Reiter wurde von "Alle Folgen" in "Offizielle Folgen" ("Offiziell" auf Mobilgeräten) umbenannt.

---

## [1.3.0] - 2026-06-25
### Hinzugefügt
- **Hörverlauf (History):** Einführung des Hörverlaufs als eigene Sektion im Seitenmenü, um die zuletzt gestarteten Folgen anzuzeigen.
- **Synchronisierung:** Verlauf wird lokal im Browser-Speicher (`localStorage`) hinterlegt.

---

## [1.2.0] - 2026-06-23
### Hinzugefügt
- **Desktop GUI Uploader:** Ein übersichtlicher Tkinter-basierter Uploader mit Verzeichnis-Auswahl, Episoden-Statusprüfung (Ausstehend / Inkomplett / Komplett) und Upload-Fortschrittsbalken.
- **Windows Batch Launcher:** Bereitstellung von `upload.bat`, um den Uploader mit einem Doppelklick direkt auf Windows zu starten.

---

## [1.1.0] - 2026-06-20
### Hinzugefügt
- **FileDitch Hosting & Uploader:** Umstellung des Audio-Streamings auf High-Speed FileDitch-Hoster.
- **CLI Uploader:** Konsolen-Skript `upload.py` zum automatisierten Hochladen ganzer Ordner.
- **Archive.org Fallback:** Erkennt unvollständige Uploads und streamt die restlichen Tracks automatisch von Archive.org.

---

## [1.0.0] - 2026-06-15
### Hinzugefügt
- **Initiale Version:** Grundlegendes Web-Archiv mit Glassmorphism-Design für Die drei ???.
- Integration des Standard-Audio-Players mit Lautstärke- und Abspielgeschwindigkeitsregelung.
- Offline-Streaming aller Folgen direkt über Archive.org-Datenbanken.
