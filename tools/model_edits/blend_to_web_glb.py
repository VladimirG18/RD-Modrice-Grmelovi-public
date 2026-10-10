#!/usr/bin/env python
"""
Převod detailního Blender modelu (RD_Modrice_model.blend) na webový RDModrice.glb.

Co dělá (aby fungoval konfigurátor barev, vrstvy i nástěnka požadavků na webu):
  * zruší natočení pozemku (RD_Site) – web používá lokální souřadnice domu,
  * odstraní kamery, světla, prázdné objekty a stromy (těžké, na webu zbytečné),
  * propeče modifikátory a všechny transformace do geometrie,
  * rozdělí objekty po materiálech (kvůli barvení a vrstvě „sklo"),
  * přejmenuje objekty podle konvence vrstev (RD_Obvod_*, RD_strecha_*, RD_teren_*,
    RD_teren_soused_*, vypln_*, int_1NP_*, int_2NP_*, txt_*),
  * přemapuje materiály na názvy z konfigurátoru (A_omitka_svetle_seda, ...),
  * textury nahradí plnou barvou (web jede bez textur, soubor zůstane malý),
  * exportuje GLB bez Draco komprese.

    pip install bpy
    python blend_to_web_glb.py RD_Modrice_model.blend RDModrice.glb
"""
import bpy, bmesh, sys, re, json, struct, os
from mathutils import Matrix

SRC = sys.argv[-2] if len(sys.argv) >= 3 else "RD_Modrice_model.blend"
DST = sys.argv[-1] if len(sys.argv) >= 3 else "RDModrice.glb"

# ------------------------------------------------------------------ materiály
WEB_MAT = {
    "A_Omitka_silikatova_bila": "A_omitka_svetle_seda",
    "B_Krytina_keramicka_tmave_seda": "B_krytina_tmave_seda",
    "C_Klempir_tmave_seda": "C_lista_tmava_seda",
    "D_Hlinik_ram_tmave_sedy": "D_ramy_oken",
    "D_Sklo_izolacni_dvojsklo": "sklo_okna",
    "E_Sokl_tmave_seda_omitka": "E_sokl_tmavy",
    "F_Keramicky_obklad_tmave_sedy": "F_obklad_tmavy",
    "G_Nerez": "G_ocel",
    "G_Sklo_zabradli": "sklo_zabradli",
    "H_Garazova_vrata_tmave_seda": "H_vrata_tmava",
    "Betonova_dlazba_terasa": "beton_dlazba",
    "A_Omitka_interier": "interier_bily",
    "Podhled_SDK_bily": "interier_bily",
    "Podlaha_drevo_vinyl": "podlaha_drevo",
    "Podlaha_keramicka_dlazba": "podlaha_dlazba",
    "Podlaha_garaz_dlazba": "podlaha_dlazba",
    "Travnik": "travnik",
}
GLASS = {"sklo_okna", "sklo_zabradli"}
KEEP_OBJ = re.compile(r"^(int_1NP|int_2NP|RD_|txt_|vypln)")


# Textury nejsou součástí .blend (odkazy //textures/...), proto odhad jejich průměrné
# jasnosti (lineárně) podle Poly Haven souborů – použije se jen pro výslednou plnou barvu.
TEX_AVG = {"grey_roof_tiles": 0.10, "plastered_wall_04": 0.50, "sparse_grass": 0.13,
           "wood_floor": 0.26, "concrete_pavement_02": 0.30, "brick_pavement_02": 0.22,
           "grey_tiles": 0.26, "patterned_paving": 0.30}


def tex_avg(node_tree):
    for n in node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            for k, v in TEX_AVG.items():
                if n.image.name.startswith(k) and "diff" in n.image.name:
                    return v
    return 0.3


def inp(node, ident):
    return next((i for i in node.inputs if i.identifier == ident), None)


def flat_materials():
    """Textury pryč: barva = odstín × (1-f + f·průměr textury), vazby na obrázky se odpojí."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        bc = bsdf.inputs["Base Color"]
        if bc.is_linked and bc.links[0].from_node.type == "MIX":
            mul = bc.links[0].from_node                       # odstín × textura
            a, b = inp(mul, "A_Color"), inp(mul, "B_Color")
            tint = tuple(a.default_value)[:3] if a is not None and not a.is_linked else None
            f = 0.6
            src = b.links[0].from_node if b is not None and b.is_linked else None
            if src is not None and src.type == "MIX":
                f = inp(src, "Factor_Float").default_value
            if tint:
                t = tex_avg(nt)
                k = (1 - f) + f * t
                bc.default_value = (tint[0] * k, tint[1] * k, tint[2] * k, 1.0)
        for sock in ("Base Color", "Roughness", "Normal", "Metallic"):
            s_ = bsdf.inputs[sock]
            if s_.is_linked:
                for l in list(s_.links):
                    nt.links.remove(l)
                if sock == "Roughness":
                    s_.default_value = 0.75


def web_name_for(mat_name, obj_name):
    """Materiál -> název v konfigurátoru, s výjimkami podle názvu objektu."""
    if mat_name == "D_Hlinik_ram_tmave_sedy":
        if "dvere" in obj_name.lower() and "okn" not in obj_name.lower():
            return "D_okna_antracit"          # vstupní/terasové dveře
        if obj_name.lower().startswith("vrata"):
            return "H_vrata_tmava"            # rám vrat = jako vrata
    return WEB_MAT.get(mat_name, mat_name)


# ------------------------------------------------------------------ pojmenování
def layer_prefix(n):
    nl = n.lower()
    if KEEP_OBJ.match(n):
        return ""
    if n.startswith(("Strecha_", "Stresni_", "Klempir_", "FVE_", "Pergola_strecha")):
        return "RD_strecha_"
    if n.startswith(("Protejsi", "Soused_")):
        return "RD_teren_soused_"
    if n.startswith(("Pozemek", "Teren", "Chodnik", "Sjezd", "Plot_", "Lampa_", "HUP_", "Rozvodna",
                     "Zahrada_", "TC_", "Ulice_", "Sloupy_", "Terasa_", "Pergola_")):
        return "RD_teren_"
    if n.startswith(("Steny_", "Sokl", "Komin", "Lodzie_", "Zavetri_", "Vrata_", "Okna_")):
        return "RD_Obvod_"
    return ""


def bake_modifiers_and_transforms(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
        me.transform(o.matrix_world)
        o.modifiers.clear()
        o.data = me
        o.parent = None
        o.matrix_world = Matrix.Identity(4)


def split_object(o, keyfn):
    """Rozdělí objekt podle klíče plochy -> {klíč: nový objekt}. Originál smaže."""
    keys = set()
    bm = bmesh.new(); bm.from_mesh(o.data)
    for f in bm.faces:
        keys.add(keyfn(o, f))
    bm.free()
    out = {}
    for k in keys:
        bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        kill = [f for f in bm.faces if keyfn(o, f) != k]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        me = o.data.copy(); bm.to_mesh(me); bm.free()
        no = bpy.data.objects.new(o.name, me)
        for c in o.users_collection:
            c.objects.link(no)
        out[k] = no
    bpy.data.objects.remove(o)
    return out


def main():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    sc = bpy.data.scenes["RD Modřice"] if "RD Modřice" in bpy.data.scenes else bpy.data.scenes[0]
    print("scene ctx", bpy.context.scene.name, "->", sc.name)
    site = bpy.data.objects.get("RD_Site")
    if site:
        site.rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update()

    # zbytečné: kamery, světla, prázdné objekty, stromy
    for o in list(bpy.data.objects):
        if o.type != "MESH" or o.name.startswith("Stromy"):
            bpy.data.objects.remove(o)
    bpy.context.view_layer.update()

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bake_modifiers_and_transforms(meshes)
    flat_materials()

    # Podlahy a stropy dělíme podle patra (kvůli přepínačům vrstev), schodiště = 1NP
    for o in [o for o in bpy.data.objects if o.name in ("Podlahy", "Stropni_desky", "Schodiste")]:
        if o.name == "Schodiste":
            o.name = "int_1NP_schodiste"
            continue
        zthr, nm = (1.5, "podlahy") if o.name == "Podlahy" else (4.0, "stropy")
        parts = split_object(o, lambda ob, f: 2 if f.calc_center_median().z > zthr else 1)
        for k, no in parts.items():
            no.name = f"int_{k}NP_{nm}"

    # rozdělení po materiálech + přejmenování
    renamed = {}
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        mats = [s.material for s in o.material_slots]
        base = o.name
        pre = layer_prefix(base)
        # Stěny: omítka exteriéru (obvod) vs. interiér (int_NP)
        parts = (split_object(o, lambda ob, f: f.material_index)
                 if len(mats) > 1 else {0: o})
        for idx, no in parts.items():
            mat = mats[idx] if idx < len(mats) else None
            mname = web_name_for(mat.name, base) if mat else None
            suffix = ""
            if len(mats) > 1 and mname:
                suffix = "_" + re.sub(r"[^A-Za-z0-9]+", "", mname)[:14]
            if base.startswith("Steny_") and mname == "interier_bily":
                np_ = "2NP" if "podkrovi" in base else "1NP"
                new = f"int_{np_}_{base.lower()}"
            elif mname in GLASS and not KEEP_OBJ.match(base):
                new = f"vypln_{base}{suffix}"
            else:
                new = f"{pre}{base}{suffix}"
            no.name = new
            no.data.name = new
            no.data.materials.clear()
            if mat:
                if mname == mat.name:
                    mm = mat
                else:
                    mm = renamed.get((mat.name, mname))
                    if mm is None:
                        mm = mat.copy(); mm.name = mname
                        renamed[(mat.name, mname)] = mm
                no.data.materials.append(mm)

    # export bez Draco
    bpy.ops.export_scene.gltf(
        filepath=DST, export_format="GLB", export_apply=False,
        export_cameras=False, export_lights=False, export_yup=True,
        export_draco_mesh_compression_enable=False,
        export_image_format="NONE", export_texcoords=False, export_normals=True,
        export_extras=False, use_visible=False)
    strip_material_suffixes(DST)
    print("hotovo", DST, os.path.getsize(DST))


def strip_material_suffixes(path):
    """Blender pro dvě instance stejného jména přidá .001 – web chce čisté názvy."""
    d = open(path, "rb").read()
    jl = struct.unpack("<I", d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    for m in j.get("materials", []):
        m["name"] = re.sub(r"\.\d{3}$", "", m["name"])
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    rest = d[20 + jl:]
    total = 12 + 8 + len(js) + len(rest)
    open(path, "wb").write(d[:8] + struct.pack("<I", total) + struct.pack("<I", len(js)) + b"JSON" + js + rest)


if __name__ == "__main__":
    main()
