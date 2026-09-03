#!/usr/bin/env python
"""
Zjednodušené zařízení obýváku s kuchyní (místnost 104 „obývací pokoj + KK")
podle dvou uložených vizualizací na webu (nástěnka Vizualizace).

Model je schématický (hranatý), takže nábytek je také schématický – kvádry ve
správném rozmístění, proporcích a barvách dle vizualizací:
  * bílá kuchyňská linka do L u východní stěny + dubová pracovní deska,
  * vysoká skříň s nerez lednicí a vestavěnými troubami, nerez digestoř,
    varná deska, dřez,
  * kuchyňský ostrůvek (bílý korpus + dubová deska) se 3 barovými židlemi,
  * tmavě modrá rohová sedačka, konferenční stolek (dub + černé nohy),
  * jídelní stůl (dub) se židlemi u prosklených dveří na zahradu,
  * TV sestava (dubová skříňka + černá TV na stěně),
  * otevřená dřevěná police, dřevěné lamely u krbu,
  * dubová podlaha v obýváku.
Krb v modelu už je (int_1NP_krb_*) – needitujeme ho.

Souřadnice bpy po importu glTF: X západ→východ, Y jih(≈0)→sever, Z výška.
Místnost 104: X 0.45–7.45, Y 0.45–6.30, podlaha Z0, strop Z2.60.
Pevné prvky (nepřekrývat): prosklené dveře na jih X 3.37–6.48; okno na jih
X 1.12–1.98; krb X 2.55–3.70, Y 5.30–5.95 (Z0–1.15); spíž (105) SZ roh
X 0.45–2.67, Y 5.32–6.30; schodiště / otvor do haly na severu X 3.80–6.30.

Nábytek se pojmenovává prefixem `int_1NP_furn_` → v model.html spadá do vrstvy
„1. patro (1NP)" a barvení konfigurátoru se ho netýká (vlastní materiály).

Použití (Blender jako Python modul – balík `bpy`):
    python furnish_interior.py [VSTUP.glb] [VYSTUP.glb]
Výchozí VSTUP i VYSTUP = ../../RDModrice.glb. Skript je idempotentní: nejdřív
smaže dřívější `int_1NP_furn_*`, pak je vytvoří znovu.

POZN.: model.html načítá glTF bez DRACOLoaderu → export MUSÍ být bez Draco.
Celá sestava modelu: nejdřív add_gable_window.py (orig → glb), poté tento skript.
"""
import bpy, os, sys

_here = os.path.dirname(os.path.abspath(__file__))
_default = os.path.normpath(os.path.join(_here, "..", "..", "RDModrice.glb"))
argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else sys.argv[1:]
GLB_IN  = argv[0] if len(argv) > 0 else _default
GLB_OUT = argv[1] if len(argv) > 1 else _default

PREFIX = "int_1NP_furn_"

# ---- materiály nábytku (baseColor, metallic, roughness) ----
MATS = {
    "furn_bila":   ((0.905, 0.895, 0.865, 1), 0.0, 0.55),  # bílé korpusy kuchyně
    "furn_dub":    ((0.717, 0.523, 0.304, 1), 0.0, 0.70),  # dub – desky, stoly, police
    "furn_dub_tm": ((0.556, 0.386, 0.212, 1), 0.0, 0.70),  # tmavší dub – TV skříňka, lamely
    "furn_modra":  ((0.129, 0.160, 0.243, 1), 0.0, 0.85),  # tmavě modrá sedačka
    "furn_cerna":  ((0.045, 0.048, 0.055, 1), 0.0, 0.45),  # TV, nohy, varná deska
    "furn_nerez":  ((0.750, 0.762, 0.780, 1), 0.0, 0.40),  # nerez (světle šedá, bez env. mapy nemetal.)
    "furn_podlaha":((0.760, 0.585, 0.360, 1), 0.0, 0.75),  # dubová podlaha
}

def get_mat(key):
    name = key
    m = bpy.data.materials.get(name)
    if m is None:
        col, metal, rough = MATS[key]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = col
            if "Metallic" in bsdf.inputs:  bsdf.inputs["Metallic"].default_value = metal
            if "Roughness" in bsdf.inputs: bsdf.inputs["Roughness"].default_value = rough
        m.diffuse_color = col
    return m

def box(name, x0, x1, y0, y1, z0, z1, matkey, col):
    import bmesh
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    bm = bmesh.new(); vs = {}
    for xi, x in enumerate((x0, x1)):
        for yi, y in enumerate((y0, y1)):
            for zi, z in enumerate((z0, z1)):
                vs[(xi, yi, zi)] = bm.verts.new((x, y, z))
    q = [[(0,0,0),(0,1,0),(0,1,1),(0,0,1)], [(1,0,0),(1,0,1),(1,1,1),(1,1,0)],
         [(0,0,0),(1,0,0),(1,0,1),(0,0,1)], [(0,1,0),(0,1,1),(1,1,1),(1,1,0)],
         [(0,0,0),(0,1,0),(1,1,0),(1,0,0)], [(0,0,1),(1,0,1),(1,1,1),(0,1,1)]]
    for f in q: bm.faces.new([vs[k] for k in f])
    bm.normal_update(); bm.to_mesh(me); bm.free()
    me.materials.append(get_mat(matkey))
    return ob

def clear_prev():
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.startswith(PREFIX):
            bpy.data.objects.remove(o, do_unlink=True)

def furnish(col):
    B = lambda n,*a: box(PREFIX+n, *a, col)
    # Otočení celé sestavy o 180° kolem středu místnosti (Xc=3.95, Yc=3.375):
    # X→CX−X, Y→CY−Y. Při pohledu ze zahrady (od jihu na sever) tím kuchyň přejde
    # na LEVOU stranu (západ) a obývák/gauč na PRAVOU (východ). Kusy níže jsou
    # zapsané v původní (nepřevrácené) poloze a R() je otočí; jídelní stůl a lamely
    # se needitují otočením (viz níže), aby stůl zůstal u dveří a lamely u krbu.
    CX, CY = 7.90, 6.75
    def R(n, x0, x1, y0, y1, z0, z1, m):
        return B(n, CX-x1, CX-x0, CY-y1, CY-y0, z0, z1, m)

    # ---- dubová podlaha obýváku (tenká deska mírně nad stávající podlahou) ----
    B("podlaha", 0.50, 7.42, 0.50, 5.20, 0.00, 0.02, "furn_podlaha")

    # ============ KUCHYNĚ – linka do L (po otočení u ZÁPADNÍ stěny, čelem na východ) ============
    R("kuch_spodni", 6.82, 7.42, 1.60, 6.05, 0.05, 0.88, "furn_bila")
    R("kuch_sokl",   6.86, 7.42, 1.60, 6.05, 0.00, 0.05, "furn_cerna")
    R("kuch_deska",  6.76, 7.45, 1.55, 6.10, 0.88, 0.93, "furn_dub")     # pracovní deska (dub)
    R("kuch_horni1", 7.14, 7.42, 1.60, 2.55, 1.55, 2.28, "furn_bila")    # horní skříňky
    R("kuch_horni2", 7.14, 7.42, 3.95, 4.85, 1.55, 2.28, "furn_bila")
    R("kuch_varna",  6.92, 7.40, 2.75, 3.45, 0.93, 0.95, "furn_cerna")   # varná deska
    R("kuch_dig_h",  7.10, 7.42, 2.95, 3.30, 1.95, 2.35, "furn_nerez")   # digestoř (nerez)
    R("kuch_dig_d",  6.98, 7.42, 2.80, 3.42, 1.75, 1.95, "furn_nerez")
    R("kuch_drez",   6.98, 7.40, 4.55, 5.15, 0.90, 0.94, "furn_cerna")   # dřez
    R("kuch_vysoka", 6.82, 7.42, 5.15, 6.05, 0.00, 2.30, "furn_bila")    # vysoká skříň
    R("kuch_lednice",6.80, 7.42, 5.55, 6.03, 0.10, 2.10, "furn_nerez")   # nerez lednice
    R("kuch_trouby", 6.80, 6.83, 5.18, 5.52, 1.15, 1.85, "furn_cerna")   # vestavěné trouby

    # ============ KUCHYŇSKÝ OSTRŮVEK (po otočení západně od středu) ============
    R("ostruv_korp", 5.35, 6.15, 2.20, 4.60, 0.00, 0.90, "furn_bila")
    R("ostruv_deska",5.22, 6.28, 2.05, 4.75, 0.90, 0.95, "furn_dub")
    for i, yc in enumerate((2.55, 3.40, 4.25)):   # 3 barové židle
        sx0, sx1 = 4.80, 5.18
        R("stool%d_sed"%i, sx0, sx1, yc-0.19, yc+0.19, 0.75, 0.80, "furn_bila")
        for lx in (sx0+0.02, sx1-0.06):
            for ly in (yc-0.17, yc+0.11):
                R("stool%d_noha_%.0f_%.0f"%(i,lx*100,ly*100), lx, lx+0.04, ly, ly+0.04, 0.00, 0.75, "furn_dub")

    # ============ OBÝVACÍ ČÁST (po otočení východně, TV na VÝCHODNÍ stěně) ============
    R("tv_skrinka", 0.48, 0.82, 2.20, 4.40, 0.00, 0.48, "furn_dub_tm")
    R("tv_panel",   0.49, 0.53, 2.70, 4.05, 0.75, 1.55, "furn_cerna")
    # tmavě modrá rohová sedačka (L) – po otočení otevřená k SV, čelem k TV
    R("sofa_sed_S",  3.00, 3.72, 2.55, 4.45, 0.12, 0.46, "furn_modra")
    R("sofa_sed_Z",  2.30, 3.72, 4.05, 4.45, 0.12, 0.46, "furn_modra")
    R("sofa_zada_V", 3.72, 3.98, 2.55, 4.70, 0.12, 0.84, "furn_modra")
    R("sofa_zada_S", 2.30, 3.98, 4.45, 4.70, 0.12, 0.84, "furn_modra")
    R("sofa_pols_S", 3.05, 3.68, 2.60, 4.45, 0.46, 0.62, "furn_modra")
    R("sofa_pols_Z", 2.35, 3.05, 4.05, 4.42, 0.46, 0.62, "furn_modra")
    R("sofa_loket_J",3.00, 3.98, 2.55, 2.75, 0.12, 0.66, "furn_modra")
    # konferenční stolek
    R("konf_deska", 2.00, 2.85, 2.95, 3.90, 0.38, 0.43, "furn_dub")
    for lx in (2.04, 2.77):
        for ly in (2.99, 3.82):
            R("konf_noha_%.0f_%.0f"%(lx*100,ly*100), lx, lx+0.05, ly, ly+0.05, 0.00, 0.38, "furn_cerna")
    # otevřená dřevěná police (po otočení SV roh u východní stěny)
    R("police_korp", 0.48, 0.86, 0.55, 1.85, 0.00, 1.85, "furn_dub")
    for zc in (0.45, 0.90, 1.35):
        R("police_pol_%.0f"%(zc*100), 0.50, 0.86, 0.55, 1.85, zc, zc+0.03, "furn_dub_tm")
    R("police_svisla", 0.50, 0.86, 1.18, 1.22, 0.00, 1.85, "furn_dub_tm")

    # ============ JÍDELNÍ STŮL – zůstává u prosklených dveří (jih), NEotočený ============
    # židle jen z jihu (u dveří) a z boků; ze severu ne, ať nekolidují s otočenou sedačkou
    B("jidel_deska", 3.95, 5.95, 0.98, 1.92, 0.72, 0.77, "furn_dub")
    for lx in (4.01, 5.83):
        for ly in (1.04, 1.80):
            B("jidel_noha_%.0f_%.0f"%(lx*100,ly*100), lx, lx+0.06, ly, ly+0.06, 0.00, 0.72, "furn_dub")
    for i, xc in enumerate((4.45, 5.45)):   # 2 židle z jihu (u dveří)
        B("chair_S%d_sed"%i, xc-0.22, xc+0.22, 0.50, 0.92, 0.44, 0.48, "furn_bila")
        B("chair_S%d_opr"%i, xc-0.22, xc+0.22, 0.50, 0.54, 0.48, 0.90, "furn_bila")
        for lx in (xc-0.20, xc+0.16):
            for ly in (0.54, 0.86):
                B("chair_S%d_%.0f_%.0f"%(i,lx*100,ly*100), lx, lx+0.04, ly, ly+0.04, 0.00, 0.44, "furn_dub")
    for i, (ex, xc) in enumerate(((3.55, 3.79), (6.11, 6.35))):  # 2 židle na koncích stolu
        B("chair_E%d_sed"%i, ex, ex+0.42, 1.24, 1.66, 0.44, 0.48, "furn_bila")
        B("chair_E%d_opr"%i, (ex if i==0 else ex+0.38), (ex+0.04 if i==0 else ex+0.42), 1.24, 1.66, 0.48, 0.90, "furn_bila")
        for lx in (ex+0.02, ex+0.36):
            for ly in (1.28, 1.60):
                B("chair_E%d_%.0f_%.0f"%(i,lx*100,ly*100), lx, lx+0.04, ly, ly+0.04, 0.00, 0.44, "furn_dub")

    # dřevěné lamely – akcentní panel vedle krbu (svislé latě), krb se nehýbe
    for k in range(6):
        yy = 5.05 + k*0.16
        B("lamela_%d"%k, 3.72, 3.80, yy, yy+0.09, 0.00, 2.30, "furn_dub_tm")

    # ---- posuny kusů dle požadavků z nástěnky (nástroj „Posunout prvek") ----
    # Zadané ve three.js; přepočet do bpy §4:  ΔX = dx,  ΔY = -dz,  ΔZ = dy.
    # Srovnáno podle záměru, ať nevzniknou překryvy: kuchyňský ostrůvek se všemi
    # 3 barovými židlemi jede na jih jako jeden celek (0,70 m; rozestupy zůstávají),
    # gauč a konferenční stolek jedou do rohu společně stejným vektorem
    # (45 cm východ + 40 cm sever) → stolek zůstane před gaučem.
    MOVES = {
        "ostruv": (0.00, -0.70, 0.00),
        "stool0": (0.00, -0.70, 0.00),
        "stool1": (0.00, -0.70, 0.00),
        "stool2": (0.00, -0.70, 0.00),
        "sofa":   (0.45,  0.40, 0.00),
        "konf":   (0.45,  0.40, 0.00),
    }
    for o in list(col.objects):
        if o.type != 'MESH' or not o.name.startswith(PREFIX):
            continue
        key = o.name[len(PREFIX):].split('_')[0]
        d = MOVES.get(key)
        if d:
            o.location.x += d[0]; o.location.y += d[1]; o.location.z += d[2]

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_IN)
    scn = bpy.context.scene.collection
    smp = bpy.data.objects.get("podlaha_1np") or bpy.data.objects.get("RD_podlaha_1np")
    col = smp.users_collection[0] if smp and smp.users_collection else scn
    clear_prev()
    furnish(col)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', use_selection=False,
                              export_yup=True, export_apply=True,
                              export_draco_mesh_compression_enable=False)
    print("[RD] interiér hotovo → ", GLB_OUT)

main()
