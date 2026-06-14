# Parametrický generátor domu (Blender + MCP)

Postaví celý dům v Blenderu z jednoho datového souboru. Geometrie se
generuje **z dat ve výkresech**, takže model je přesný a kdykoli
opakovatelně upravitelný – stačí změnit čísla a skript spustit znovu.

## Soubory

| Soubor | Co dělá |
|---|---|
| `house_data.json` | **datové schéma** – rozměry, místnosti, okna, střecha, terén, materiály. Tohle se edituje podle výkresů. |
| `generate_house.py` | **Blender Python skript** – přečte data a postaví dům. Stejná data má i zabudovaná (záloha pro běh přes MCP). |

## Jak to navazuje na web

Skript pojmenovává objekty přesně podle konvencí, které čte prohlížeč
v `model.html`. Díky tomu **fungují vrstvy na webu automaticky**:

| Název objektu | Vrstva v `model.html` |
|---|---|
| `RD_strecha` | Střecha |
| `RD_Obvod_*` | Obvodové stěny |
| `vypln_*` | Výplně oken |
| `RD_teren` | Terén |
| `RD_1NP_*` / `RD_2NP_*` | 1. patro / 2. patro |
| `txt_*` | Popisky místností |

## Spuštění

### A) Ručně v Blenderu
1. Ulož `.blend` do této složky `generator/` (aby skript našel `house_data.json`).
2. Karta **Scripting** → **Open** → `generate_house.py` → **Run Script** (▶).
3. Dům se postaví do kolekce **RD_Modrice**. Opakované spuštění ji přepíše.

> Bez uloženého `.blend` skript použije zabudovaná data – dům se postaví taky,
> jen nečte externí JSON.

### B) Přes Blender MCP (Claude Desktop)
Když máš živé propojení (kladívko s `execute_blender_code`), řekni Claudovi:

> „Spusť obsah `generator/generate_house.py` v Blenderu."

Claude pošle kód do `execute_blender_code`. Funguje i bez JSON souboru
(data jsou v `DEFAULT_DATA`). Pak ho můžeš dál interaktivně ladit:
„posuň příčku v koupelně", „zvětši okno v obýváku", „uprav sklon střechy"…

## Úprava podle výkresů

Otevři `house_data.json` a uprav hodnoty (vše v **metrech**):

- **`footprint`** – obrys domu jako polygon `[[x,y], …]`.
- **`floors[].rooms[]`** – každá místnost: `x, y` (levý-přední roh) + `w` (šířka v X) a `d` (hloubka v Y).
  - Příčky se generují z hran místností; **sdílená hrana = jedna příčka** (automatická deduplikace).
  - Hrana ležící na obvodu se přeskočí (řeší ji obvodová stěna).
- **`floors[].level_z` / `height`** – výška podlahy nad terénem a světlá výška patra.
- **`windows[]`** – `side` (`S`/`N`/`E`/`W`), `pos` (odsazení podél fasády), `width`, `sill` (parapet), `height`.
- **`roof`** – `eave_z` (okap), `ridge_z` (hřeben), `overhang` (přesah). Hřeben jde podél delší strany půdorysu.
- **`materials`** – barvy (0–1), `roughness`, u skla `alpha`.

> ⚠️ Výchozí půdorys je **přibližný** – odvozený z ploch v `informace.html`.
> Nahraď souřadnice přesnými kótami z výkresů (ideálně z DXF/SVG).

## Export na web

Po kontrole modelu spusť v Blenderu (Scripting → konzole) přímo:

```python
export_glb("/cesta/k/RD-Modrice-Grmelovi-public/RDModrice.glb")
```

Funkce exportuje GLB s **Draco kompresí, +Y up a zachovanými názvy** –
přesně jak to web potřebuje. Pak stačí nový `RDModrice.glb` commitnout
a model na webu se aktualizuje.

> Souřadnice: počátek v levém-předním rohu, **X** doprava, **Y** dozadu,
> **Z** nahoru. GLB export převede na Y-up pro Three.js automaticky.
