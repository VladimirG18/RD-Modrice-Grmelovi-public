"""
RD Modřice – Grmelovi  ·  parametrický generátor domu pro Blender
==================================================================

Postaví celý dům z dat v `house_data.json` (rozměry, místnosti, okna,
střecha, terén). Objekty pojmenuje přesně podle konvencí, které čte
prohlížeč v `model.html`, takže přepínání vrstev na webu funguje samo:

    RD_strecha*      → vrstva "Střecha"
    RD_Obvod*        → vrstva "Obvodové stěny"
    vypln_*          → vrstva "Výplně oken"
    RD_teren*        → vrstva "Terén"
    *1NP* / *2NP*    → vrstvy "1. patro" / "2. patro"
    txt_*            → vrstva "Popisky místností"

Použití
-------
A) V Blenderu ručně:
   1. Otevři kartu "Scripting", New, vlož obsah tohoto souboru (nebo Open).
   2. Stiskni "Run Script" (▶). Dům se postaví do kolekce "RD_Modrice".
   Pozn.: aby se načetla externí data, ulož .blend do složky `generator/`,
   nebo nastav HOUSE_DATA_PATH níže. Bez souboru se použije vestavěná kopie.

B) Přes Blender MCP (Claude Desktop):
   Řekni Claudovi, ať obsah skriptu pošle do nástroje `execute_blender_code`.
   Funguje i bez JSON souboru – data má skript zabudovaná jako DEFAULT_DATA.

Export na web
-------------
Po kontrole spusť v konzoli / dalším běhu:
    export_glb("/cesta/k/RDModrice.glb")
(viz funkce export_glb na konci – Draco komprese, +Y up, zachované názvy).
"""

import bpy
import bmesh
import json
import math
import os

# --- konfigurace ------------------------------------------------------------
COLLECTION = "RD_Modrice"
HOUSE_DATA_PATH = ""   # nepovinné: absolutní cesta k house_data.json


# --- vestavěná záloha dat (kopie house_data.json kvůli běhu přes MCP) -------
DEFAULT_DATA = {
    "params": {
        "tloustka_obvodove_steny": 0.30,
        "tloustka_pricky": 0.10,
        "tloustka_stropu": 0.30,
        "vyska_popisku": 0.40,
    },
    "footprint": [[0.0, 0.0], [11.2, 0.0], [11.2, 11.0], [0.0, 11.0]],
    "floors": [
        {"id": "1NP", "level_z": 0.00, "height": 2.95, "rooms": [
            {"num": "107", "name": "Garáž",             "x": 0.0, "y": 0.0, "w": 4.0, "d": 5.0},
            {"num": "104", "name": "Obývací pokoj + KK","x": 4.2, "y": 0.0, "w": 7.0, "d": 5.1},
            {"num": "103", "name": "Pracovna",          "x": 0.0, "y": 5.2, "w": 4.0, "d": 2.85},
            {"num": "101", "name": "Zádveří / hala",    "x": 4.2, "y": 5.2, "w": 2.2, "d": 2.9},
            {"num": "106", "name": "Schodiště",         "x": 6.5, "y": 5.2, "w": 1.3, "d": 2.85},
            {"num": "102", "name": "WC + sprcha",       "x": 7.9, "y": 5.2, "w": 0.8, "d": 3.0},
            {"num": "105", "name": "Spíž",              "x": 8.8, "y": 5.2, "w": 0.6, "d": 3.0},
        ]},
        {"id": "2NP", "level_z": 3.25, "height": 2.70, "rooms": [
            {"num": "207", "name": "Ložnice",         "x": 0.0,  "y": 0.0, "w": 4.0, "d": 4.125},
            {"num": "205", "name": "Dětský pokoj",    "x": 4.2,  "y": 0.0, "w": 3.8, "d": 3.5},
            {"num": "204", "name": "Dětský pokoj",    "x": 8.1,  "y": 0.0, "w": 3.1, "d": 3.97},
            {"num": "208", "name": "Šatna",           "x": 0.0,  "y": 4.2, "w": 2.0, "d": 2.4},
            {"num": "203", "name": "Koupelna",        "x": 2.1,  "y": 4.2, "w": 2.9, "d": 3.0},
            {"num": "202", "name": "Technická míst.", "x": 5.1,  "y": 4.2, "w": 2.2, "d": 3.05},
            {"num": "201", "name": "Chodba",          "x": 7.4,  "y": 4.2, "w": 2.6, "d": 2.8},
            {"num": "206", "name": "WC",              "x": 10.1, "y": 4.2, "w": 1.1, "d": 1.27},
        ]},
    ],
    "windows": [
        {"floor": "1NP", "side": "S", "pos": 5.0, "width": 3.0, "sill": 0.4, "height": 2.1},
        {"floor": "1NP", "side": "S", "pos": 0.8, "width": 2.4, "sill": 1.2, "height": 1.4},
        {"floor": "1NP", "side": "E", "pos": 1.0, "width": 2.0, "sill": 0.9, "height": 1.5},
        {"floor": "1NP", "side": "W", "pos": 5.5, "width": 1.2, "sill": 1.2, "height": 1.2},
        {"floor": "2NP", "side": "S", "pos": 0.7, "width": 1.6, "sill": 0.9, "height": 1.5},
        {"floor": "2NP", "side": "S", "pos": 4.6, "width": 1.6, "sill": 0.9, "height": 1.5},
        {"floor": "2NP", "side": "S", "pos": 8.3, "width": 1.6, "sill": 0.9, "height": 1.5},
        {"floor": "2NP", "side": "N", "pos": 0.5, "width": 1.6, "sill": 0.9, "height": 1.5},
        {"floor": "2NP", "side": "E", "pos": 1.0, "width": 1.2, "sill": 0.9, "height": 1.4},
    ],
    "roof": {"typ": "sedlova", "eave_z": 6.25, "ridge_z": 8.85, "overhang": 0.5},
    "terrain": {"width": 22.0, "depth": 22.0, "thickness": 0.6},
    "materials": {
        "fasada":  {"color": [0.82, 0.82, 0.80], "roughness": 0.9},
        "strecha": {"color": [0.18, 0.19, 0.21], "roughness": 0.7},
        "pricka":  {"color": [0.90, 0.89, 0.86], "roughness": 0.95},
        "podlaha": {"color": [0.55, 0.45, 0.35], "roughness": 0.6},
        "sklo":    {"color": [0.60, 0.75, 0.85], "roughness": 0.05, "alpha": 0.30},
        "teren":   {"color": [0.30, 0.42, 0.22], "roughness": 1.0},
        "popisek": {"color": [0.05, 0.05, 0.05], "roughness": 0.8},
    },
}


# --- načtení dat ------------------------------------------------------------
def get_data():
    candidates = []
    if HOUSE_DATA_PATH:
        candidates.append(HOUSE_DATA_PATH)
    if bpy.data.filepath:
        candidates.append(os.path.join(os.path.dirname(bpy.data.filepath), "house_data.json"))
    try:
        candidates.append(os.path.join(os.path.dirname(__file__), "house_data.json"))
    except NameError:
        pass
    for path in candidates:
        if path and os.path.exists(path):
            print("[RD] Načítám data z:", path)
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    print("[RD] house_data.json nenalezen → používám vestavěná DEFAULT_DATA.")
    return DEFAULT_DATA


# --- kolekce a materiály ----------------------------------------------------
def get_collection():
    col = bpy.data.collections.get(COLLECTION)
    if col is None:
        col = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(col)
    else:
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    return col


def make_material(name, spec):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    color = spec.get("color", [0.8, 0.8, 0.8])
    alpha = spec.get("alpha", 1.0)
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], alpha)
    bsdf.inputs["Roughness"].default_value = spec.get("roughness", 0.8)
    bsdf.inputs["Metallic"].default_value = spec.get("metallic", 0.0)
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        mat.blend_method = 'BLEND'
        # sklo: trochu průhlednosti i přes Transmission (název se liší dle verze)
        for key in ("Transmission Weight", "Transmission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = 0.6
                break
    return mat


def build_materials(data):
    return {key: make_material("RD_mat_" + key, spec)
            for key, spec in data["materials"].items()}


# --- geometrické pomocníky --------------------------------------------------
def add_prism(name, poly, z0, z1, material, col):
    """Svislý hranol z 2D půdorysného polygonu, vytažený z z0 do z1."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, z0)) for (x, y) in poly]
    top = [bm.verts.new((x, y, z1)) for (x, y) in poly]
    bm.faces.new(bottom)
    bm.faces.new(list(reversed(top)))
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bottom[i], bottom[j], top[j], top[i]])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    if material:
        obj.data.materials.append(material)
    return obj


def wall_poly(a, b, thickness):
    """Obdélníkový půdorys stěny okolo úsečky a→b o dané tloušťce."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return None
    nx = -dy / length * thickness / 2.0
    ny = dx / length * thickness / 2.0
    return [(ax + nx, ay + ny), (bx + nx, by + ny),
            (bx - nx, by - ny), (ax - nx, ay - ny)]


def add_wall(name, a, b, z0, height, thickness, material, col):
    poly = wall_poly(a, b, thickness)
    if poly is None:
        return None
    return add_prism(name, poly, z0, z0 + height, material, col)


# --- stavební bloky ---------------------------------------------------------
def footprint_bbox(fp):
    xs = [p[0] for p in fp]
    ys = [p[1] for p in fp]
    return min(xs), max(xs), min(ys), max(ys)


def build_terrain(data, mats, col):
    t = data["terrain"]
    x0, x1, y0, y1 = footprint_bbox(data["footprint"])
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    hw, hd = t["width"] / 2.0, t["depth"] / 2.0
    poly = [(cx - hw, cy - hd), (cx + hw, cy - hd),
            (cx + hw, cy + hd), (cx - hw, cy + hd)]
    add_prism("RD_teren", poly, -t["thickness"], 0.0, mats["teren"], col)


def build_exterior_walls(data, mats, col):
    fp = data["footprint"]
    th = data["params"]["tloustka_obvodove_steny"]
    for floor in data["floors"]:
        z0 = floor["level_z"]
        h = floor["height"]
        fid = floor["id"]
        for i in range(len(fp)):
            a = fp[i]
            b = fp[(i + 1) % len(fp)]
            add_wall("RD_Obvod_%s_%d" % (fid, i), a, b, z0, h, th, mats["fasada"], col)


def build_floor_slabs(data, mats, col):
    x0, x1, y0, y1 = footprint_bbox(data["footprint"])
    poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for floor in data["floors"]:
        slab = data["params"]["tloustka_stropu"]
        z_top = floor["level_z"]
        add_prism("RD_%s_podlaha" % floor["id"], poly, z_top - slab, z_top,
                  mats["podlaha"], col)


def _room_edges(room):
    x, y, w, d = room["x"], room["y"], room["w"], room["d"]
    c = [(x, y), (x + w, y), (x + w, y + d), (x, y + d)]
    return [(c[i], c[(i + 1) % 4]) for i in range(4)]


def _on_boundary(a, b, bbox, eps=0.05):
    x0, x1, y0, y1 = bbox
    return ((abs(a[0] - x0) < eps and abs(b[0] - x0) < eps) or
            (abs(a[0] - x1) < eps and abs(b[0] - x1) < eps) or
            (abs(a[1] - y0) < eps and abs(b[1] - y0) < eps) or
            (abs(a[1] - y1) < eps and abs(b[1] - y1) < eps))


def build_interior_walls(data, mats, col):
    bbox = footprint_bbox(data["footprint"])
    th = data["params"]["tloustka_pricky"]
    for floor in data["floors"]:
        z0 = floor["level_z"]
        h = floor["height"]
        fid = floor["id"]
        seen = set()
        idx = 0
        for room in floor["rooms"]:
            for a, b in _room_edges(room):
                if _on_boundary(a, b, bbox):
                    continue  # tato hrana leží na obvodu → řeší ji obvodová stěna
                key = tuple(sorted([(round(a[0], 3), round(a[1], 3)),
                                    (round(b[0], 3), round(b[1], 3))]))
                if key in seen:
                    continue  # sdílená příčka mezi dvěma místnostmi → jen jednou
                seen.add(key)
                add_wall("RD_%s_pricka_%d" % (fid, idx), a, b, z0, h, th,
                         mats["pricka"], col)
                idx += 1


def build_windows(data, mats, col):
    x0, x1, y0, y1 = footprint_bbox(data["footprint"])
    levels = {f["id"]: f["level_z"] for f in data["floors"]}
    glass_t = 0.08
    counters = {}
    for win in data["windows"]:
        fid = win["floor"]
        base_z = levels[fid] + win["sill"]
        top_z = base_z + win["height"]
        pos, wdt, side = win["pos"], win["width"], win["side"]
        if side == "S":
            a, b = (x0 + pos, y0), (x0 + pos + wdt, y0)
        elif side == "N":
            a, b = (x0 + pos, y1), (x0 + pos + wdt, y1)
        elif side == "E":
            a, b = (x1, y0 + pos), (x1, y0 + pos + wdt)
        else:  # "W"
            a, b = (x0, y0 + pos), (x0, y0 + pos + wdt)
        counters[fid] = counters.get(fid, 0) + 1
        poly = wall_poly(a, b, glass_t)
        add_prism("vypln_%s_%d" % (fid, counters[fid]), poly, base_z, top_z,
                  mats["sklo"], col)


def build_roof(data, mats, col):
    r = data["roof"]
    eave, ridge, ov = r["eave_z"], r["ridge_z"], r["overhang"]
    x0, x1, y0, y1 = footprint_bbox(data["footprint"])
    mesh = bpy.data.meshes.new("RD_strecha")
    obj = bpy.data.objects.new("RD_strecha", mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    if (x1 - x0) >= (y1 - y0):           # hřeben podél X
        ymid = (y0 + y1) / 2.0
        sa = bm.verts.new((x0 - ov, y0 - ov, eave))
        sb = bm.verts.new((x1 + ov, y0 - ov, eave))
        na = bm.verts.new((x0 - ov, y1 + ov, eave))
        nb = bm.verts.new((x1 + ov, y1 + ov, eave))
        ra = bm.verts.new((x0 - ov, ymid, ridge))
        rb = bm.verts.new((x1 + ov, ymid, ridge))
        bm.faces.new([sa, sb, rb, ra])   # jižní rovina
        bm.faces.new([nb, na, ra, rb])   # severní rovina
        bm.faces.new([sa, ra, na])       # západní štít
        bm.faces.new([sb, nb, rb])       # východní štít
    else:                                # hřeben podél Y
        xmid = (x0 + x1) / 2.0
        wa = bm.verts.new((x0 - ov, y0 - ov, eave))
        wb = bm.verts.new((x0 - ov, y1 + ov, eave))
        ea = bm.verts.new((x1 + ov, y0 - ov, eave))
        eb = bm.verts.new((x1 + ov, y1 + ov, eave))
        ra = bm.verts.new((xmid, y0 - ov, ridge))
        rb = bm.verts.new((xmid, y1 + ov, ridge))
        bm.faces.new([wa, wb, rb, ra])
        bm.faces.new([ea, ra, rb, eb])
        bm.faces.new([wa, ra, ea])
        bm.faces.new([wb, eb, rb])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(mats["strecha"])


def build_labels(data, mats, col):
    size = data["params"]["vyska_popisku"]
    to_convert = []
    for floor in data["floors"]:
        z = floor["level_z"] + 0.02
        for room in floor["rooms"]:
            cx = room["x"] + room["w"] / 2.0
            cy = room["y"] + room["d"] / 2.0
            name = "txt_%s" % room["num"]
            cur = bpy.data.curves.new(name, type="FONT")
            cur.body = "%s %s" % (room["num"], room["name"])
            cur.size = size
            cur.align_x = 'CENTER'
            cur.align_y = 'CENTER'
            cur.extrude = 0.01
            obj = bpy.data.objects.new(name, cur)
            obj.location = (cx, cy, z)
            col.objects.link(obj)
            obj.data.materials.append(mats["popisek"])
            to_convert.append(obj)
    # převod textu na mesh, aby se popisky vyexportovaly do GLB
    try:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in to_convert:
            obj.select_set(True)
        if to_convert:
            bpy.context.view_layer.objects.active = to_convert[0]
            bpy.ops.object.convert(target='MESH')
    except Exception as exc:  # pragma: no cover - závisí na kontextu Blenderu
        print("[RD] Popisky zůstaly jako text (převod na mesh selhal):", exc)


# --- hlavní běh -------------------------------------------------------------
def main():
    data = get_data()
    col = get_collection()
    mats = build_materials(data)

    build_terrain(data, mats, col)
    build_floor_slabs(data, mats, col)
    build_exterior_walls(data, mats, col)
    build_interior_walls(data, mats, col)
    build_windows(data, mats, col)
    build_roof(data, mats, col)
    build_labels(data, mats, col)

    print("[RD] Hotovo. Objektů v kolekci '%s': %d" % (COLLECTION, len(col.objects)))


def export_glb(filepath):
    """Vyexportuje scénu do GLB pro web (Draco, +Y up, zachované názvy)."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_draco_mesh_compression_enable=True,
    )
    print("[RD] Vyexportováno do:", filepath)


if __name__ == "__main__":
    main()
