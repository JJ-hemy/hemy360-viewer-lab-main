# BS17 JobWalk / Sphere XG: uttrekk før abonnementet avsluttes

Prosjekt: `c5be311a-1cb8-4ec5-b607-35707445cd16`, **BS17 - CP: Office to Retail Space (JobWalk)**.

## Krav til uttrekket fra FARO

Lever et komplett, maskinlesbart uttrekk som kan importeres og vises uten FARO/HoloBuilder-konto:

1. Alle originale 360-bildefiler, også tidligere TimeTravel-opptak ved samme punkt. Bevar original oppløsning og bildefilens metadata.
2. Én stabil kilde-ID per waypoint og én kilde-ID per opptak. For hvert opptak: opptakstidspunkt med tidssone, versjonsrekkefølge ved punktet, filnavn og tilknytning til waypoint.
3. Alle tre originale plantegninger med pikselmål og waypointets x/y-koordinater i tegningens koordinatsystem. Ta med etasje/sheet-ID og eventuell tegningstransformasjon.
4. Scene-/prosjekttre, koblinger mellom scener, kategorier, tagger, merknader, tilknyttede 2D-bilder og eventuelle retningsdata/orientering for 360-bildene.
5. Eksport som JSON/CSV for metadata og separat filpakke for originalmedier, med sjekksum per fil og totalsummer per etasje, waypoint og opptak.
6. Avklar hvordan et fullstendig uttrekk kan tas **uten å arkivere eller stenge prosjektet** før Hemy360 har verifisert alle filer. Et eventuelt API-uttak må inkludere historikk, ikke bare nyeste bilde.

## Verifisert hittil (2026-10-06)

- Interaktive PDF-er fra `01. FLOOR`, `02. FLOOR`, `03. FLOOR` er hentet ut. De gir henholdsvis 67, 100 og 5 unike kartpunkt: **172 waypoint**.
- Kartposisjonene er manuelle, omtrentlige 2D-posisjoner. Prosjektoversikten viser ingen prosjektkoordinater. De må ikke presenteres som innmålte 3D-koordinater eller BIM-innretting.
- Web Editor viser `245 / 245` scener. Forskjellen mellom 245 og 172 er **ikke ferdig avklart**; vi må kontrollere hele historikken og eventuelle andre sceneobjekter mot FARO-uttaket.
- Fem originale 360-JPEG fra `03. FLOOR` er hentet ut, hver med lokal SHA-256 og en mobiltilpasset avledet visningsfil. Lokal Hemy360-visning åpner disse i en interaktiv 360-dialog og tilbyr nedlasting av originalen.
- De 167 øvrige kartpunktene har foreløpig bare midlertidig kildehenvisning til HoloBuilder. Ingen skal regnes som migrert før alle relevante opptak ligger i eget fillager og kan åpnes uten FARO-innlogging.

## Modell i Hemy360

`Waypoint` har Hemy360-ID, sheet/etasje, omtrentlig x/y og kilde-ID. `Capture` ligger under waypointet og har versjon, nøyaktig tidspunkt, originalfil, mobilvisning, sjekksum og kilde-ID. Et waypoint kan ha mange opptak. Egen 3D-posisjon legges bare til etter separat innretting mot skann/BIM, med dokumentert metode og usikkerhet.

## Kontroll før oppsigelse

Sammenlign antall sheets, waypoints og opptak med FARO; verifiser filstørrelser og sjekksummer; test historikkvalg og 360-visning på PC og mobil; test med FARO-utlogging; og sikre en separat sikkerhetskopi av originalfilene. Avslutt abonnementet først når disse punktene er bekreftet.
