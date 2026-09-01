# Úpravy 3D modelu (`RDModrice.glb`)

Skripty, které **editují přímo hotový `RDModrice.glb`** pomocí Blenderu
(balík `bpy`). Používají se, když je potřeba lokální zásah do geometrie a
původní parametrický generátor detailního modelu není po ruce.

> ⚠️ `model.html` načítá glTF **bez DRACOLoaderu**, takže export musí být
> **bez Draco komprese** (skripty to tak mají nastavené).

## `add_gable_window.py`
Vytvoří **zalomená okna** na jižní straně: každé spojí původní střešní a fasádní
okno do jednoho okna, které přechází ze stěny přes okap na střechu (svislá +
šikmá tabule s rámem). Dělá se to na dvou místech:

* **západní štít** – střešní `S0` + fasádní `S2_0` → jedno okno (X 0.55–1.70),
* **východní strana** – 2 střešní `S1`,`S2` + fasádní `S2_1` → jedno okno
  (X 8.65–9.80), stejných rozměrů.

Pod oknem i po jeho stranách se doplní omítka (parapet + špalety), aby
neprosvítal interiér; dlouhý okap na východě se jen nařízne, krátký na západě
smaže celý.

```bash
pip install bpy          # Blender jako Python modul
python add_gable_window.py            # upraví ../../RDModrice.glb na místě
# nebo: python add_gable_window.py vstup.glb vystup.glb
```

Pojmenování nových objektů drží konvence modelu (`vypln_*` = výplně oken,
`RD_Obvod_*` / `RD_strecha_*` = vrstvy stěny / střechy), takže vrstvy i
konfigurátor barev na webu fungují automaticky.
