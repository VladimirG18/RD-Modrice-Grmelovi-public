#!/usr/bin/env python
"""
Zalomené okno na západním štítu (RD Modřice).

Spojí původní střešní okno (S0) a fasádní okno (S2_0) na západním konci jižní
strany do JEDNOHO zalomeného okna: svislá tabule ve stěně přechází přes okap do
šikmé tabule na střeše. Provede se prořez otvoru (stěna + okap + střecha) a vloží
se zasklení + rám. Model se edituje přímo v hotovém RDModrice.glb (parametrický
generátor detailního modelu není k dispozici).

Použití (Blender jako Python modul – balík `bpy`):
    pip install bpy
    python add_gable_window.py [VSTUP.glb] [VYSTUP.glb]
Výchozí VSTUP i VYSTUP = ../../RDModrice.glb (uprav dle potřeby).

Souřadnice bpy po importu glTF: X západ→východ, Y jih(≈0)→sever, Z výška.
"""
import bpy, bmesh, os, sys
from mathutils import Vector

_here = os.path.dirname(os.path.abspath(__file__))
_default = os.path.normpath(os.path.join(_here, "..", "..", "RDModrice.glb"))
argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else sys.argv[1:]
GLB_IN  = argv[0] if len(argv) > 0 else _default
GLB_OUT = argv[1] if len(argv) > 1 else _default

# ---- parametry okna ----
OX0, OX1 = 0.55, 1.70     # X rozsah okna (šířka)
FR   = 0.06               # rámeček
ZSILL   = 3.55            # spodek svislé části
ZCORNER = 4.52            # roh (přechod svislá→šikmá) u okapu
WYG     = 0.06            # Y svislé tabule (mírně před vnějším lícem stěny)
RA, RB  = 0.683, 4.52     # rovina horního líce střechy: Z = RA*Y + RB
SY_BOT, SY_TOP = 0.00, 1.95  # Y rozsah šikmé části

def get_mat(name):
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.materials:
            for m in o.data.materials:
                if m and m.name == name:
                    return m
    return None

def box(name, x0, x1, y0, y1, z0, z1, mat, col):
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    bm = bmesh.new(); vs = {}
    for xi, x in enumerate((x0, x1)):
        for yi, y in enumerate((y0, y1)):
            for zi, z in enumerate((z0, z1)):
                vs[(xi, yi, zi)] = bm.verts.new((x, y, z))
    q = [[(0,0,0),(0,1,0),(0,1,1),(0,0,1)], [(1,0,0),(1,0,1),(1,1,1),(1,1,0)],
         [(0,0,0),(1,0,0),(1,0,1),(0,0,1)], [(0,1,0),(0,1,1),(1,1,1),(1,1,0)],
         [(0,0,0),(0,1,0),(1,1,0),(1,0,0)], [(0,0,1),(1,0,1),(1,1,1),(0,1,1)]]
    for f in q:
        bm.faces.new([vs[k] for k in f])
    bm.normal_update(); bm.to_mesh(me); bm.free()
    if mat:
        me.materials.append(mat)
    return ob

def sloped(name, x0, x1, y0, y1, a, b, dz_lo, dz_hi, mat, col):
    """Deska v rovině Z = a*Y + b, od y0..y1, mezi offsety dz_lo..dz_hi."""
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    bm = bmesh.new()
    P = lambda x, y, dz: bm.verts.new((x, y, a*y + b + dz))
    lo = [P(x0,y0,dz_lo), P(x1,y0,dz_lo), P(x1,y1,dz_lo), P(x0,y1,dz_lo)]
    hi = [P(x0,y0,dz_hi), P(x1,y0,dz_hi), P(x1,y1,dz_hi), P(x0,y1,dz_hi)]
    bm.faces.new(lo); bm.faces.new(list(reversed(hi)))
    bm.faces.new([lo[0],lo[1],hi[1],hi[0]]); bm.faces.new([lo[2],lo[3],hi[3],hi[2]])
    bm.faces.new([lo[1],lo[2],hi[2],hi[1]]); bm.faces.new([lo[3],lo[0],hi[0],hi[3]])
    bm.normal_update(); bm.to_mesh(me); bm.free()
    if mat:
        me.materials.append(mat)
    return ob

def cut(target_name, cutter, scn):
    t = bpy.data.objects.get(target_name)
    if not t:
        return
    m = t.modifiers.new("bw", "BOOLEAN"); m.operation = 'DIFFERENCE'; m.solver = 'FLOAT'; m.object = cutter
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.modifier_apply(modifier=m.name)

def del_faces_box(objname, x0, x1, y0, y1, z0, z1):
    o = bpy.data.objects.get(objname)
    if not o:
        return
    me = o.data; bm = bmesh.new(); bm.from_mesh(me); mw = o.matrix_world
    kill = [f for f in bm.faces
            if x0 <= (mw @ f.calc_center_median()).x <= x1
            and y0 <= (mw @ f.calc_center_median()).y <= y1
            and z0 <= (mw @ f.calc_center_median()).z <= z1]
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me); bm.free()

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_IN)
    scn = bpy.context.scene.collection
    smp = bpy.data.objects.get("RD_Obvod_stena_jih")
    tcol = smp.users_collection[0] if smp and smp.users_collection else scn
    sklo = get_mat("sklo_okna"); ram = get_mat("D_okna_antracit")

    # odstranit původní střešní okno S0, fasádní okno S2_0 i jeho síťku (sitka_S_0),
    # jinak by na stěně zůstal viset prázdný rámeček síťky původního okna
    for o in list(bpy.data.objects):
        if any(k in o.name for k in ("stresni_okno_S0", "stresni_okno_sklo_S0", "okno_S2_0", "sitka_S_0")):
            bpy.data.objects.remove(o, do_unlink=True)

    # prořez stěny (kvádr skrz stěnu)
    wc = box("wcut", OX0, OX1, -0.12, 0.57, ZSILL-0.7, ZCORNER+0.06, None, scn)
    cut("RD_Obvod_stena_jih", wc, scn); bpy.data.objects.remove(wc, do_unlink=True)

    # prořez střechy (pás od přesahu až po spádu nahoru) – JEN střešní plocha.
    # Okapní lišta ani žlab se NEbooleanují: FLOAT solver by jejich tenký bbox
    # „nafoukl" na rozsah cutteru a v modelu by zůstaly vypadat jako kvádry.
    rc = box("rcut", OX0, OX1, -0.75, SY_TOP+0.12, 3.9, 6.4, None, scn)
    cut("RD_strecha_strecha_jih", rc, scn)
    bpy.data.objects.remove(rc, do_unlink=True)

    # pojistka: dořezat případné zbytky přesahu střechy v šířce okna
    del_faces_box("RD_strecha_strecha_jih", OX0-0.03, OX1+0.03, -0.70, 0.05, 4.0, 4.8)

    # okapní lišta + žlab u okna: západní segment (jih0) je stejně přerušený
    # terasou, tak ho celý odebereme – u okna tím nezůstane žádný přečnívající
    # kus (jinak konce visí jižně a vypadají jako kvádry navíc).
    for tn in ("RD_strecha_lista_okap_jih0", "RD_strecha_zlab_jih0"):
        o = bpy.data.objects.get(tn)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)

    # zasklení – svislá (stěna) + šikmá (střecha)
    box("vypln_okno_zal_svisla", OX0+FR, OX1-FR, WYG-0.006, WYG+0.006, ZSILL+FR, ZCORNER, sklo, tcol)
    sloped("vypln_okno_zal_sikma", OX0+FR, OX1-FR, SY_BOT, SY_TOP-FR, RA, RB, -0.005, 0.005, sklo, tcol)

    # rám (D_okna_antracit → na webu se barví ovladačem „Rámy oken")
    if ram:
        box("RD_Obvod_okno_zal_ram_L", OX0, OX0+FR, WYG-0.03, WYG+0.05, ZSILL, ZCORNER, ram, tcol)
        box("RD_Obvod_okno_zal_ram_P", OX1-FR, OX1, WYG-0.03, WYG+0.05, ZSILL, ZCORNER, ram, tcol)
        box("RD_Obvod_okno_zal_ram_D", OX0, OX1, WYG-0.03, WYG+0.05, ZSILL, ZSILL+FR, ram, tcol)
        sloped("RD_strecha_okno_zal_ram_Ls", OX0, OX0+FR, SY_BOT, SY_TOP, RA, RB, -0.04, 0.05, ram, tcol)
        sloped("RD_strecha_okno_zal_ram_Ps", OX1-FR, OX1, SY_BOT, SY_TOP, RA, RB, -0.04, 0.05, ram, tcol)
        sloped("RD_strecha_okno_zal_ram_H", OX0, OX1, SY_TOP-FR, SY_TOP, RA, RB, -0.04, 0.05, ram, tcol)
        box("RD_strecha_okno_zal_ram_ohyb", OX0, OX1, 0.00, WYG+0.05, ZCORNER-0.05, ZCORNER+0.02, ram, tcol)

    bpy.ops.object.select_all(action='DESELECT')
    # POZN.: model.html načítá glTF bez DRACOLoaderu → export MUSÍ být bez Draco.
    bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', use_selection=False,
                              export_yup=True, export_apply=True,
                              export_draco_mesh_compression_enable=False)
    print("[RD] hotovo → ", GLB_OUT)

main()
