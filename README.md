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

## Technologie

Stránka používá webovou komponentu [`<model-viewer>`](https://modelviewer.dev/)
od Googlu, která se načítá z CDN a zajišťuje vykreslení i ovládání 3D modelu.
