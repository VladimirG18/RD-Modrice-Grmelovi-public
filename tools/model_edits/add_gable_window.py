#!/usr/bin/env python
"""
Zalomená (spojená střešní+fasádní) okna na jižní straně RD Modřice.

Nahradí původní oddělená okna JEDNÍM zalomeným oknem, které přechází ze stěny
přes okap do šikmé tabule na střeše (svislá + šikmá tabule s rámem). Dělá se to
na dvou místech jižní strany:

  * ZÁPADNÍ štít – střešní okno S0 + fasádní okno S2_0 → jedno okno (X 0.55–1.70),
  * VÝCHODNÍ strana – 2 střešní okna S1, S2 + fasádní okno S2_1 → jedno okno
    (X 8.65–9.80), stejných rozměrů jako na západě.

Postup pro každé okno: odstranit původní okna (vč. síťky), prořezat otvor
(stěna + střecha), okap buď smazat (západ – krátký, přerušený terasou) nebo
naříznout (východ – dlouhý okap zůstává po stranách), vložit zasklení + rám a
doplnit omítku pod oknem (parapet) i po stranách (špalety), aby neprosvítal
interiér. Model se edituje přímo v hotovém RDModrice.glb (parametrický generátor
detailního modelu není k dispozici).

Použití (Blender jako Python modul – balík `bpy`):
    pip install bpy
    python add_gable_window.py [VSTUP.glb] [VYSTUP.glb]
Výchozí VSTUP i VYSTUP = ../../RDModrice.glb (uprav dle potřeby).

Souřadnice bpy po importu glTF: X západ→východ, Y jih(≈0)→sever, Z výška.
POZN.: model.html načítá glTF bez DRACOLoaderu → export MUSÍ být bez Draco.
"""
import bpy, bmesh, os, sys
from mathutils import Vector

_here = os.path.dirname(os.path.abspath(__file__))
_default = os.path.normpath(os.path.join(_here, "..", "..", "RDModrice.glb"))
argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else sys.argv[1:]
GLB_IN  = argv[0] if len(argv) > 0 else _default
GLB_OUT = argv[1] if len(argv) > 1 else _default

# ---- společné parametry okna ----
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

def cut(target_name, cutter):
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

def notch_trim(name, x0, x1):
    """Rozřízne osově zarovnaný kvádr (okapní lišta / žlab) na kus vlevo (…_a) a
    vpravo (…_b) od [x0,x1]. Boxy se REKONSTRUUJÍ z PŮVODNÍHO bboxu (ne po
    booleanu), aby se jejich rozměr „nenafoukl" – proto se lišta ani žlab
    NEbooleanují. Oba profily jsou osově zarovnané kvádry, takže tvar zůstane."""
    o = bpy.data.objects.get(name)
    if not o:
        return
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = [min(c[i] for c in bb) for i in range(3)]
    mx = [max(c[i] for c in bb) for i in range(3)]
    mat = o.data.materials[0] if o.data.materials else None
    col = o.users_collection[0] if o.users_collection else bpy.context.scene.collection
    bpy.data.objects.remove(o, do_unlink=True)
    if mn[0] < x0 - 0.01:
        box(name + "_a", mn[0], x0, mn[1], mx[1], mn[2], mx[2], mat, col)
    if mx[0] > x1 + 0.01:
        box(name + "_b", x1, mx[0], mn[1], mx[1], mn[2], mx[2], mat, col)

def add_bent_window(tag, OX0, OX1, remove_keys, orig_open, eave, gutter, eave_notch):
    """tag: přípona názvů nových objektů ('' západ, 'V' východ); OX0,OX1: X okna;
    remove_keys: substringy původních oken k odstranění; orig_open=(x0,x1): X
    původního fasádního otvoru (pro špalety); eave/gutter: okapní lišta+žlab;
    eave_notch: True=naříznout (zbytek okapu zůstane) / False=smazat celé."""
    scn = bpy.context.scene.collection
    smp = bpy.data.objects.get("RD_Obvod_stena_jih")
    tcol = smp.users_collection[0] if smp and smp.users_collection else scn
    sklo = get_mat("sklo_okna"); ram = get_mat("D_okna_antracit"); omit = get_mat("A_omitka_svetle_seda")

    # odstranit původní střešní i fasádní okna vč. jejich síťky
    for o in list(bpy.data.objects):
        if any(k in o.name for k in remove_keys):
            bpy.data.objects.remove(o, do_unlink=True)

    # prořez stěny (kvádr skrz stěnu)
    wc = box("wcut", OX0, OX1, -0.12, 0.57, ZSILL-0.7, ZCORNER+0.06, None, scn)
    cut("RD_Obvod_stena_jih", wc); bpy.data.objects.remove(wc, do_unlink=True)

    # prořez střechy (pás od přesahu až po spádu nahoru) – JEN střešní plocha
    rc = box("rcut", OX0, OX1, -0.75, SY_TOP+0.12, 3.9, 6.4, None, scn)
    cut("RD_strecha_strecha_jih", rc); bpy.data.objects.remove(rc, do_unlink=True)
    del_faces_box("RD_strecha_strecha_jih", OX0-0.03, OX1+0.03, -0.70, 0.05, 4.0, 4.8)

    # okapní lišta + žlab: naříznout (dlouhý okap) nebo smazat celé (krátký)
    if eave_notch:
        notch_trim(eave,   OX0-0.05, OX1+0.05)
        notch_trim(gutter, OX0-0.05, OX1+0.05)
    else:
        for tn in (eave, gutter):
            o = bpy.data.objects.get(tn)
            if o:
                bpy.data.objects.remove(o, do_unlink=True)

    # zasklení – svislá (stěna) + šikmá (střecha)
    box("vypln_okno_zal%s_svisla" % tag, OX0+FR, OX1-FR, WYG-0.006, WYG+0.006, ZSILL+FR, ZCORNER, sklo, tcol)
    sloped("vypln_okno_zal%s_sikma" % tag, OX0+FR, OX1-FR, SY_BOT, SY_TOP-FR, RA, RB, -0.005, 0.005, sklo, tcol)

    # rám (D_okna_antracit → na webu se barví ovladačem „Rámy oken")
    if ram:
        box("RD_Obvod_okno_zal%s_ram_L" % tag, OX0, OX0+FR, WYG-0.03, WYG+0.05, ZSILL, ZCORNER, ram, tcol)
        box("RD_Obvod_okno_zal%s_ram_P" % tag, OX1-FR, OX1, WYG-0.03, WYG+0.05, ZSILL, ZCORNER, ram, tcol)
        box("RD_Obvod_okno_zal%s_ram_D" % tag, OX0, OX1, WYG-0.03, WYG+0.05, ZSILL, ZSILL+FR, ram, tcol)
        sloped("RD_strecha_okno_zal%s_ram_Ls" % tag, OX0, OX0+FR, SY_BOT, SY_TOP, RA, RB, -0.04, 0.05, ram, tcol)
        sloped("RD_strecha_okno_zal%s_ram_Ps" % tag, OX1-FR, OX1, SY_BOT, SY_TOP, RA, RB, -0.04, 0.05, ram, tcol)
        sloped("RD_strecha_okno_zal%s_ram_H" % tag, OX0, OX1, SY_TOP-FR, SY_TOP, RA, RB, -0.04, 0.05, ram, tcol)
        box("RD_strecha_okno_zal%s_ram_ohyb" % tag, OX0, OX1, 0.00, WYG+0.05, ZCORNER-0.05, ZCORNER+0.02, ram, tcol)

    # výplň zdi: parapet pod oknem (řez šel pod parapet) + boční špalety
    # (nové okno je užší než původní otvor) – jinak prosvítá interiér
    if omit:
        ox0, ox1 = orig_open
        box("RD_Obvod_parapet_okno_zal%s" % tag,  OX0, OX1, 0.00, 0.45, ZSILL-0.70, ZSILL+0.01, omit, tcol)
        box("RD_Obvod_spaleta_okno_zal%s_L" % tag, ox0, OX0, 0.01, 0.45, 3.45, 4.06, omit, tcol)
        box("RD_Obvod_spaleta_okno_zal%s_P" % tag, OX1, ox1, 0.01, 0.45, 3.45, 4.06, omit, tcol)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_IN)

    # ZÁPADNÍ štít – střešní S0 + fasádní S2_0 (krátký okap jih0 se smaže celý)
    add_bent_window("", 0.55, 1.70,
        ("stresni_okno_S0", "stresni_okno_sklo_S0", "okno_S2_0", "sitka_S_0"),
        (0.45, 1.80),
        "RD_strecha_lista_okap_jih0", "RD_strecha_zlab_jih0", eave_notch=False)

    # VÝCHODNÍ strana – 2 střešní (S1,S2) + fasádní (S2_1) → jedno okno stejných
    # rozměrů, vycentrované na fasádní otvor (dlouhý okap jih1 se jen nařízne)
    add_bent_window("V", 8.65, 9.80,
        ("stresni_okno_S1", "stresni_okno_sklo_S1", "stresni_okno_S2", "stresni_okno_sklo_S2", "okno_S2_1", "sitka_S_1"),
        (8.45, 10.00),
        "RD_strecha_lista_okap_jih1", "RD_strecha_zlab_jih1", eave_notch=True)

    bpy.ops.object.select_all(action='DESELECT')
    # POZN.: model.html načítá glTF bez DRACOLoaderu → export MUSÍ být bez Draco.
    bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', use_selection=False,
                              export_yup=True, export_apply=True,
                              export_draco_mesh_compression_enable=False)
    print("[RD] hotovo → ", GLB_OUT)

main()
