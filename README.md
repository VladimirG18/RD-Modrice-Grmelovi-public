# RD Modřice – Grmelovi

Hlavní stránka s **interaktivním 3D modelem** rodinného domu v Modřicích.

## Co je tu

- `index.html` – webová stránka, která zobrazí 3D model (otáčení, zoom, posun).
- `RDModrice.glb` – samotný 3D model domu ve formátu glTF (binární `.glb`).

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

## Technologie

Stránka používá [**Three.js**](https://threejs.org/) (`GLTFLoader`, `OrbitControls`,
`PointerLockControls`), který se načítá z CDN a zajišťuje vykreslení modelu,
procházku interiérem i přepínání vrstev.
