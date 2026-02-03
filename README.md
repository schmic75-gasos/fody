# Fody - React Native aplikace pro OSMCZ

Kompletní mobilní klient pro práci s Fody fotodatabází OpenStreetMap CZ.

© Michal Schneider and OSMCZ, 2026

## Funkce

- **Prohlížení fotek** - grid/list zobrazení, vyhledávání, filtrování
- **Nahrávání fotek** - z galerie nebo přímo z kamery, GPS souřadnice z EXIF nebo aktuální polohy
- **Interaktivní mapa** - OSM Mapnik v Leafletu s vyznačenými fotkami
- **Statistiky** - přehledy, počty, typy objektů
- **Projekt čtvrtletí** - aktuální informace z OSMCZ
- **Odkazy** - Discord, OpenStreetMap.cz, Fody web

## Požadavky

- Node.js 18+
- Expo CLI
- Expo Go aplikace na telefonu (pro testování)

## Instalace a spuštění

### 1. Naklonujte/stáhněte projekt

```bash
cd fody-app
```

### 2. Nainstalujte závislosti

```bash
npm install
```

### 3. Spusťte vývojový server

```bash
npx expo start
```

### 4. Otevřete v Expo Go

- Naskenujte QR kód v terminálu pomocí aplikace Expo Go (Android) nebo Kamera (iOS)
- Nebo stiskněte `a` pro Android emulátor / `i` pro iOS simulátor

## Struktura projektu

```
fody-app/
├── App.js              # Hlavní soubor s celou aplikací
├── app.json            # Expo konfigurace
├── package.json        # NPM závislosti
├── babel.config.js     # Babel konfigurace
├── assets/             # Ikony a splash screen
│   ├── icon.png
│   ├── adaptive-icon.png
│   ├── splash.png
│   └── favicon.png
└── README.md           # Tento soubor
```

## Assets (ikony)

Pro plnou funkčnost vytvořte složku `assets/` s následujícími obrázky:

- `icon.png` - 1024x1024px, ikona aplikace
- `adaptive-icon.png` - 1024x1024px, adaptivní ikona pro Android
- `splash.png` - 1284x2778px, splash screen
- `favicon.png` - 48x48px, favicon pro web

Doporučené barvy:
- Primární: #2E7D32 (zelená)
- Pozadí: #FFFFFF

## Konfigurace API

Aplikace komunikuje s Fody API na adrese:
```
https://osm.fit.vutbr.cz/fody/
```
Jako reference byly použity zdrojové soubory původního webového projektu Fody.

### Dostupné API endpointy:

| Endpoint | Metoda | Popis |
|----------|--------|-------|
| `api.php?cmd=show` | GET | Seznam fotek (GeoJSON) |
| `api.php?cmd=tags` | GET | Dostupné tagy |
| `api.php?cmd=licenses` | GET | Seznam licencí |
| `api.php?cmd=close` | GET | Fotky v okolí bodu |
| `api.php?cmd=add` | POST | Nahrání nové fotky |
| `verify.php?stats` | GET | Statistiky |

## Buildování pro produkci

### Android APK

```bash
npx expo build:android -t apk
```

### Android App Bundle

```bash
npx expo build:android -t app-bundle
```

### iOS

```bash
npx expo build:ios
```

### EAS Build (doporučeno)

```bash
npx eas build --platform android
npx eas build --platform ios
```

## Poznámky

- Pro nahrávání fotek je potřeba přihlášení OSM účtem (OAuth)
- Fotky musí být ve formátu JPEG s EXIF daty
- Minimální velikost fotky: 100 KB
- GPS souřadnice se získávají z EXIF nebo z aktuální polohy

## Licence

GNU General Public License v2.0

## Odkazy

- [Discord komunita](https://discord.gg/A9eRVaRzRe)
- [OpenStreetMap.cz](https://openstreetmap.cz)
- [Fody web](https://osm.fit.vutbr.cz/fody/)
- [Projekt čtvrtletí](https://fluffini.cz/projektmesice.txt)

## Kredity

- Fody API: Tomáš Kašpárek
- React Native aplikace: Michal Schneider
- OpenStreetMap CZ komunita
