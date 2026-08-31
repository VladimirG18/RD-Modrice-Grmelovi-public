# Úpravy 3D modelu (`RDModrice.glb`)

Skripty, které **editují přímo hotový `RDModrice.glb`** pomocí Blenderu
(balík `bpy`). Používají se, když je potřeba lokální zásah do geometrie a
původní parametrický generátor detailního modelu není po ruce.

> ⚠️ `model.html` načítá glTF **bez DRACOLoaderu**, takže export musí být
> **bez Draco komprese** (skripty to tak mají nastavené).

## `add_gable_window.py`
Vytvoří **zalomené okno** na západním štítu: spojí původní střešní okno `S0`
a fasádní okno `S2_0` (západní konec jižní strany) do jednoho okna, které
přechází ze stěny přes okap na střechu (svislá + šikmá tabule s rámem).

```bash
pip install bpy          # Blender jako Python modul
python add_gable_window.py            # upraví ../../RDModrice.glb na místě
# nebo: python add_gable_window.py vstup.glb vystup.glb
```

Pojmenování nových objektů drží konvence modelu (`vypln_*` = výplně oken,
`RD_Obvod_*` / `RD_strecha_*` = vrstvy stěny / střechy), takže vrstvy i
konfigurátor barev na webu fungují automaticky.
