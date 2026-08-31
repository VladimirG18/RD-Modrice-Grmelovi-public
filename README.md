# RD Modřice – Grmelovi

Web projektu rodinného domu v Modřicích – rozcestník s 3D modelem a dalšími podklady.

## Co je tu

- `index.html` – **rozcestník** s hero vizualizací a přehledem projektu.
- `model.html` – interaktivní **3D model** domu (otáčení, zoom, procházka, vrstvy,
  popisky místností, vnitřní dispozice) + **konfigurátor barev** fasády, střechy,
  oken a dalších prvků.
- `informace.html` – **informace o domě** z projektové dokumentace (plochy místností,
  konstrukce, povrchy, technika, pozemek, vizualizace).
- `material.html` – **stavební materiály** a skladby dle projektu.
- `dokumentace.html` – **projektová dokumentace** k prohlížení (PDF výkresy: půdorys 1.NP,
  podkroví, řez, pohledy, sjezd); soubory jsou ve složce `dokumentace/`.
- `checklist.html` – **checklist** úkolů a rozhodnutí (ukládá se v prohlížeči).
- `harmonogram.html` – **harmonogram stavby** (fáze a termíny).
- `poznamky.html` – **sdílené poznámky** (Firebase Firestore, realtime).
- `assets/style.css` – sdílený design systém (světlý + tmavý režim).
- `assets/site.js` – přepínání vzhledu a zvýraznění navigace.
- `assets/img/` – vizualizace generované z projektové dokumentace.
- `RDModrice.glb` – samotný 3D model domu ve formátu glTF (binární `.glb`);
  generuje se parametrickým skriptem z privátního repozitáře projektu.

## Spuštění

### Online (GitHub Pages)
Po zapnutí GitHub Pages bude web dostupný na adrese:

```
https://<uživatel>.github.io/RD-Modrice-Grmelovi-public/
```

Zapnutí: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
zvolte větev (`main`) a složku `/ (root)`.

### Lokálně
Protože se model načítá přes `fetch`, je potřeba jednoduchý lokální server
(otevření souboru přes `file://` model nenačte):

```bash
python3 -m http.server 8000
# poté otevřít http://localhost:8000
```

## Ovládání modelu

- **Otáčení / přiblížení / posun** – myš (tažení, kolečko, pravé tlačítko) nebo dotyk.
- **🚶 Procházka (WASD)** – režim první osoby: rozhlížení myší, pohyb `W`/`A`/`S`/`D`,
  nahoru `Space`, dolů `Shift`, ukončení `Esc`. Umožní projít se přímo interiérem domu.
- **🏠 Pohled do místností** – schová střechu a obvodové stěny a podívá se shora dovnitř.
- **Vrstvy** – samostatné vypínání střechy, obvodových stěn, pater (1NP/2NP), výplní
  oken, terénu a popisků místností.
- **🎨 Barvy domu (konfigurátor)** – nastavení barev jednotlivých prvků fasády:
  omítka, střešní krytina, rámy oken, garážová vrata, klempířské prvky, sokl,
  obklad terasy a zábradlí. Každý prvek je samostatný (např. rámy oken se mění
  nezávisle na dveřích a vratech). Na výběr jsou přednastavené vzorníky i vlastní
  barva, rychlé kombinace stylů a návrat k původním barvám. Barvy jsou živý náhled;
  tlačítkem **💾 Uložit konfiguraci** se výběr uloží do prohlížeče a pamatuje se
  i po zavření a znovuotevření (neuložené změny se po znovunačtení vrátí na uloženou verzi).

## Technologie

Stránka používá [**Three.js**](https://threejs.org/) (`GLTFLoader`, `OrbitControls`,
`PointerLockControls`), který se načítá z CDN a zajišťuje vykreslení modelu,
procházku interiérem i přepínání vrstev.
