# CLAUDE.md — pracovní kontext pro AI asistenta

Tento soubor si Claude Code načítá automaticky na začátku každé session. Shrnuje,
**jak se v tomhle projektu pracuje a nasazuje**, ať může kdokoli (i levnější model,
např. Sonnet) navázat bez ztráty dosud zjištěných informací.

> Uživatel je česky mluvící (rodina Grmelových). **Odpovídej česky.** Web je statický,
> na GitHub Pages. Cíl: úpravy dělat rovnou „na ostro" a hned viditelné.

---

## 1) Jak se nasazuje na produkci (DŮLEŽITÉ)

Web je **statický** a běží na **GitHub Pages**. Nasazení = **merge do větve `main`**:

1. Pracuj na své feature větvi (název dostaneš v zadání session, typicky
   `claude/...`). Commituj s jasnými zprávami.
2. Otevři PR do `main` a **smerguj** ho (merge commit). Po mergi se automaticky spustí
   workflow **„pages build and deployment"** (event `dynamic`, id `295816194`) a web
   se nasadí na `https://vladimirg18.github.io/RD-Modrice-Grmelovi-public/`.
3. **Ověř deploy**: přes GitHub MCP `actions_list` / `actions_get` (workflow
   `295816194`, filtr `branch:main, event:dynamic`) zkontroluj, že poslední běh má
   `conclusion: success`. Deploy trvá ~40–60 s.
4. **Pokud byl PR pro tvou větev už smergován**, začni další práci nad čerstvým
   `origin/main`: `git fetch origin main && git checkout -B <tvá-větev> origin/main`
   (rozdělané změny předtím ulož `git stash -u`, po přepnutí `git stash pop`).

GitHub operace dělej přes **GitHub MCP nástroje** (`mcp__github__*`), ne přes `gh`.
Repo: `VladimirG18/RD-Modrice-Grmelovi-public`. PR body zakonči footerem
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Před pushem lokálně ověř (nejlépe v prohlížeči přes Playwright, viz §5).

---

## 2) Struktura webu

- `index.html` – rozcestník (dlaždice + hero).
- `model.html` – **interaktivní 3D model** (three.js r0.160 přes importmap z unpkg):
  otáčení/procházka/vrstvy (vč. sousedních domů), **konfigurátor barev** (fasáda,
  střecha, okna, dveře, vrata, klempířské, sokl, obklad, ocel, vjezd, interiér, podlahy,
  sklo) + **sdílení podoby odkazem** a **denní doba** (osvětlení), a **„✏️ Navrhnout úpravu"**
  (nástěnka požadavků – zachytí pohled kamery + screenshot, do kterého jde kreslit;
  dále **📍 špendlík** = klik do náhledu → raycast → přesný bod + název dílu,
  **rychlé volby typu** úpravy, **diktování hlasem** cs-CZ a **kontext scény** = barvy+vrstvy).
- `informace.html`, `material.html`, `dokumentace.html`, `harmonogram.html`,
  `checklist.html` – obsahové stránky.
- `vizualizace.html`, `inspirace.html` – sdílené nástěnky obrázků/odkazů
  (`assets/board.js`).
- `poznamky.html` – sdílené poznámky.
- `pozadavky.html` – **nástěnka požadavků na úpravy modelu** (`assets/pozadavky.js`).
- `assets/style.css` – design systém (světlý/tmavý režim), `assets/site.js` – přepínač
  vzhledu + aktivní odkaz v nav. `assets/annotate.js` – kreslení + zoom/posun + „📍 špendlík"
  (přes callback `onPick` volá raycast v `model.html`) do náhledu požadavku.
- `RDModrice.glb` – 3D model (glTF binární), viz §4.

Nav odkazy a dlaždice jsou na všech stránkách stejné – při přidání stránky je doplň
všude (nav blok `.navlinks`, dlaždice `.card` v `index.html`).

---

## 3) Firebase (sdílená data, realtime)

- Config: `assets/firebase-config.js` (projekt `rd-modrice-e9477`). apiKey je
  **veřejný** (běžné pro web SDK; bezpečnost řeší pravidla Firestore, ne skrývání).
- Kolekce Firestore: `poznamky`, `vizualizace`, `inspirace`, **`pozadavky`**.
- Pravidla musí povolit čtení i zápis těchto kolekcí (funguje bez přihlášení – jako
  test mode). Když je DB nedostupná, stránky spadnou na `localStorage`.

---

## 4) Úpravy 3D modelu (`RDModrice.glb`)

Model se generuje parametricky v **privátním** repu (není zde k dispozici). Lokální
zásahy do geometrie se dělají **přímo do hotového `.glb`** Blenderem jako Python modul:

```bash
pip install bpy          # Blender jako modul (Blender 5.0.x); v této session je venv ve scratchpadu
python tools/model_edits/add_gable_window.py [VSTUP.glb] [VYSTUP.glb]
```

Zásady (osvědčené, nešlapat vedle):
- **Export MUSÍ být bez Draco komprese** – `model.html` načítá glTF **bez
  DRACOLoaderu**. (`export_draco_mesh_compression_enable=False`.)
- Souřadnice po importu glTF: **X = západ→východ, Y = jih(≈0)→sever, Z = výška.**
- Boolean modifier: solver **`FLOAT`** (ne `FAST` – v Blenderu 5.0 neexistuje).
  Tenké profily (lišty/žlaby) **NEbooleanovat** – FLOAT jim „nafoukne" bbox a vzniknou
  kvádry navíc; místo toho je maž celé nebo řež rekonstrukcí z **původního** bboxu
  (viz `notch_trim` v tom skriptu).
- Klíčové materiály (barví je konfigurátor podle názvu, `CFG_ITEMS` v `model.html`):
  `A_omitka_svetle_seda` (fasáda), `B_krytina_tmave_seda` (střecha),
  `D_ramy_oken` (rámy oken – odštěpené z `D_okna_antracit`),
  `D_okna_antracit` (vstupní/terasové dveře – zbytek po odštěpení rámů),
  `C_lista_tmava_seda` (klempířské), `E_sokl_tmavy`, `F_obklad_tmavy`, `G_ocel`,
  `H_vrata_tmava`, `beton_dlazba`+`asfalt`+`kacirek` (zpevněné plochy/vjezd),
  `interier_bily` (interiér – stěny), `podlaha_drevo`+`podlaha_dlazba` (podlahy),
  `sklo_okna`+`sklo_zabradli` (sklo/zasklení, průhledné). Prvek může mířit na víc
  materiálů – původní barvy se ukládají po materiálech (`origColors`) kvůli přesnému
  resetu. Pořadí barev pro odkaz `#scene=` je `SCENE_COLORS` v `assets/pozadavky.js`
  (přidání ovladače = doplnit i tam, dekodér je zpětně kompatibilní).
- Vrstvy v `model.html` se třídí podle názvu objektu: `RD_strecha*`→střecha,
  `RD_Obvod*`→obvodové stěny, `vypln*`→výplně oken, `txt_*`→popisky, `RD_teren*`→terén,
  název s `soused`→sousední domy (`RD_teren_soused_*`, vlastní přepínač, nezávislé na terénu).
  Nové objekty proto pojmenovávej touto konvencí, ať fungují vrstvy i barvení.
  „Denní doba" (ráno/poledne/večer) jen mění směr/barvu slunce a pozadí (`LIGHT_PRESETS`),
  nepatří do `#scene=`.
- Vrstvy patra: objekty s `1NP`/`2NP` (nebo `_1xx_`/`_2xx_`) v názvu spadají do
  přepínačů „1. patro"/„2. patro". Interiérové doplňky proto pojmenovávej s `1NP`.
- Hotové úpravy modelu (skripty v `tools/model_edits/`, detaily v `README.md`):
  - `add_gable_window.py` – zalomená (spojená střešní+fasádní) okna na jižní straně
    (západní štít + východní strana), plné/prosklené plochy zadní stěny terasy,
    zkrácení vnitřních příček prostrkávajících do lodžie, levé terasové okno.
  - `furnish_interior.py` – zjednodušené zařízení obýváku s kuchyní (místnost 104)
    dle uložených vizualizací (kuchyň, ostrůvek, spotřebiče, sedačka, stoly, TV,
    police, lamely, dubová podlaha). Nábytek má prefix `int_1NP_furn_` a vlastní
    materiály (konfigurátor je nebarví). Skript je idempotentní.
- **Celá sestava modelu = dva kroky** (druhý navazuje na výstup prvního):
  `add_gable_window.py <orig.glb> RDModrice.glb` → `furnish_interior.py` (in‑place).

Po úpravě modelu: zkopíruj výsledek do `RDModrice.glb`, ověř v prohlížeči (§5),
commitni a nasaď (§1).

---

## 5) Ověření v prohlížeči (Playwright)

Model i stránky se ověřují headless Chromiem (je předinstalované na
`/opt/pw-browsers/...`, `playwright-core`). Osvědčený postup: malý http server, který
servíruje repo, přepíše `unpkg` URL na lokální kopii three.js a servíruje `RDModrice.glb`.
Pro testy nástěnek servíruj **prázdný** `firebase-config.js` (apiKey ""), ať se
nezapisuje do reálné databáze (spadne to na `localStorage`).

3D snímek: `renderer.render(scene,camera)` a hned `canvas.toDataURL(...)` (buffer se
jinak nezachytí). Kamera je v modulu `model.html` jako `camera`/`orbit`.

---

## 6) Nástěnka požadavků – jak číst a odbavovat

Rodina zadává požadavky na úpravy modelu na `pozadavky.html` nebo přímo v modelu
(tlačítko „Navrhnout úpravu"). Ukládají se do Firestore kolekce `pozadavky` s poli:
`text`, `author`, `area`, `status` (`novy`/`probiha`/`hotovo`), `ts`, volitelně
`view` (pohled kamery `{p:[x,y,z], t:[x,y,z]}`), `thumb` (JPEG data URL – screenshot,
případně s ruční kresbou; při kreslení jde náhled přiblížit) a volitelně `images`
(pole JPEG data URL – doplňující obrázky přiložené z PC/internetu, zmenšené).
Dále volitelně (nová vylepšení navrhovače, zpřesňují zadání):
- `kind` – druh úpravy (rychlá volba): `barva`/`pridat`/`odebrat`/`rozmer`/`material`/`jine`
  (definice `KINDS` v `assets/pozadavky.js`).
- `pin` – **špendlík**: přesné místo úpravy z raycastu v modelu
  `{ p:[x,y,z] (three.js, Y=výška), obj:"<název meshe z GLB>", label:"<lidský název dílu>" }`.
  `obj` je přímo název objektu v `.glb` – nejrychlejší způsob, jak najít, čeho se to týká.
- `scene` – **kontext scény**: `{ colors:{<id konfigurátoru>:hex}, layers:{roof,walls,np2,np1,glass,terrain,labels:bool}, colorsChanged:bool }`.
  Řekne, jaké barvy a které vrstvy měl uživatel zapnuté, když požadavek psal.
  Na nástěnce se z něj skládá odkaz `model.html#view=…&scene=…`, který obnoví i barvy/vrstvy
  (kódování `sceneToHash`/`hashToScene`).

**Přečíst požadavky odsud** (bez appky, veřejné čtení – jako web) přes Firestore REST:

```bash
KEY="$(grep -oE 'AIza[0-9A-Za-z_-]+' assets/firebase-config.js | head -1)"
curl -sS "https://firestore.googleapis.com/v1/projects/rd-modrice-e9477/databases/(default)/documents/pozadavky?key=$KEY&pageSize=50" -o /tmp/pozadavky.json
# JSON má „typed values" (stringValue/integerValue/mapValue/arrayValue) – rozparsuj v pythonu;
# pole `thumb` je data URL: base64 část ulož jako .jpg a otevři (uvidíš i kresbu uživatele).
# pole `images` (je-li) = arrayValue data URL příloh – ulož a projdi stejně jako thumb.
# pole `view` → otevři pohled v modelu jako model.html#view=px,py,pz,tx,ty,tz
# pole `pin` (je-li) = mapValue: `obj` (stringValue) je název meshe v GLB → přímo víš, čeho se to týká;
#   `p` (arrayValue 3× doubleValue) je bod ve three.js (Y=výška; do bpy §4 přepočítej Z=výška).
# pole `kind` (je-li) = stringValue druhu úpravy; `scene` (je-li) = mapValue s `colors`/`layers`/`colorsChanged`.
```

**Označit jako hotové** (nepovinné, mění sdílená data – až po nasazení úpravy):
`PATCH https://firestore.googleapis.com/v1/projects/rd-modrice-e9477/databases/(default)/documents/pozadavky/<ID>?key=$KEY&updateMask.fieldPaths=status`
s tělem `{"fields":{"status":{"stringValue":"hotovo"}}}`. (Nebo to udělá rodina ručně
tlačítky ve stavu na `pozadavky.html`.)

Pohled `view`/`thumb` bere souřadnice three.js (Y = výška), kdežto úpravy modelu v bpy
jsou v soustavě z §4 (Z = výška) – při hledání místa v modelu podle pohledu na to mysli.

---

## 7) Konvence

- Odpovídej **česky**, stručně a k věci.
- Commituj a nasazuj až po ověření; po nasazení napiš, že je to na produkci
  (a případně ať dá uživatel Ctrl+F5, u modelu se cachuje `.glb`).
- Do commitů/PR **nepiš** název modelu ani interní identifikátory.
- Těžké úpravy geometrie modelu mají vyšší „setup" cenu (instalace bpy, mapování
  geometrie). Lehčí věci (obsah stránek, texty, drobné úpravy, triage požadavků) jsou
  levné i v čerstvé session.
