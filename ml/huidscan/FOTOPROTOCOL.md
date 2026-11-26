# Fotoprotocol huidscan

Voor de huidtherapeuten. Elke foto voor de huidanalyse volgens dit protocol, in Nijmegen en in Uden hetzelfde, zodat
het model leert van de huid en niet van het licht of de camera.

## Eerst

- **Toestemming**: alleen fotograferen voor de training als het formulier getekend is (TOESTEMMING.md) en de code in het
  toestemmingsbestand staat. Jonger dan 16: geen trainingsfoto's.
- **Huid schoon**: geen make-up, geen crème, geen SPF. Reinig en wacht **10 minuten**, zodat roodheid van het wassen
  wegzakt. Niet direct na een behandeling, peeling of sporten.
- **Gezicht vrij**: haar naar achteren met een haarband, bril af, oorbellen en piercings in het gezicht zo mogelijk uit.
- Neutraal gezicht, ogen open, mond dicht.

## Licht

- Altijd **dezelfde plek** in de behandelkamer, met een neutrale grijze of witte achtergrond.
- **Twee daglichtlampen** (5000–5600 K, CRI 90 of hoger) met een softbox of diffuser, links en rechts op 45°, op
  ooghoogte, even ver weg.
- **Geen flits**, geen raam van opzij, geen gekleurd licht. Plafondlamp uit als die een gele of groene zweem geeft.
- Begin elke dag met één foto van een **grijskaart** (of kleurenkaart) op de plek van het gezicht. Die foto gaat niet
  in de training; hij laat zien of het licht hetzelfde bleef.

## Camera

- Altijd **hetzelfde toestel** van de kliniek, niet je eigen telefoon.
- Op een iPhone: de **2×-lens** (minder vervorming dan 1×). HDR, Portret, Live Photo, filters en "beauty"-functies
  **uit**. Tik op de ogen en houd vast om scherpte en belichting vast te zetten.
- **Afstand** ongeveer 1 meter, camera op **ooghoogte**, recht voor het gezicht (statief of vaste markering op de vloer).
- **Kader**: het hele gezicht, van haarlijn tot kin, beide oren net in beeld; het gezicht vult ongeveer twee derde van
  de hoogte.

## Drie aanzichten

| Code | Aanzicht | Hoe |
|---|---|---|
| F | vooraanzicht | recht in de lens kijken |
| L | linkerkant | hoofd 45° naar rechts draaien, linkerwang naar de camera |
| R | rechterkant | hoofd 45° naar links draaien, rechterwang naar de camera |

Leg twee markeringen op de muur waar de cliënt naar kijkt voor 45°, dan is de hoek elke keer gelijk.

## Controle, meteen

Bekijk elke foto ingezoomd: **scherp** op de huid, geen glimmende vlekken van het licht, geen schaduw over een wang,
het hele gezicht in beeld. Niet goed? Meteen opnieuw.

## Bestandsnaam

`<code>_<jjjjmmdd>_<F|L|R>.jpg`, bijvoorbeeld `PC0042_20261201_F.jpg`.
De code komt van het toestemmingsformulier. **Nooit** de naam van de cliënt in de bestandsnaam.

## Opslag

- Dezelfde dag via kabel of AirDrop naar de **Mac van de kliniek** (FileVault aan), in de map `Huidscan/fotos`.
- Daarna van het toestel verwijderen, ook uit "Recent verwijderd".
- **Nooit** via WhatsApp, e-mail, Google Drive, Dropbox of een andere cloud, en **nooit naar EVREN**.

## Labelen

Open `label/index.html` in Chrome op de Mac van de kliniek, vul je initialen in en open de foto's. De uitleg staat in
het programma (knop "Uitleg"). Exporteer aan het eind van de sessie en zet de twee bestanden in `Huidscan/labels`.
