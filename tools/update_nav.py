#!/usr/bin/env python3
"""Přegeneruje hlavičku s navigací na všech stránkách webu.

Navigace je na všech stránkách stejná a je v HTML napevno (bez JS se tak
neztratí a nic neproblikne). Aby se nemusela upravovat ručně na dvaceti
místech, je její podoba jen tady – po změně `GROUPS` spusť:

    python3 tools/update_nav.py

Skript v každém `*.html` v kořeni repa nahradí blok
`<header class="site-header">…</header>`. Stránky bez hlavičky
(`model.html`) nechává být.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# (název skupiny, [(soubor, ikona, popisek)])
GROUPS = [
    ("Dům", [
        ("model.html", "🏠", "3D model"),
        ("informace.html", "ℹ️", "Informace o domě"),
        ("material.html", "🧱", "Materiály"),
        ("dokumentace.html", "📐", "Dokumentace"),
        ("vykresy.html", "🖍️", "Editor výkresů"),
    ]),
    ("Stavba", [
        ("stavba.html", "🏗️", "Postup stavby"),
        ("harmonogram.html", "📅", "Harmonogram"),
        ("fotky-stavby.html", "📷", "Fotky ze stavby"),
        ("pripojky.html", "🔌", "Přípojky"),
    ]),
    ("Nápady", [
        ("vizualizace.html", "🖼️", "Vizualizace"),
        ("inspirace.html", "💡", "Inspirace"),
        ("pozadavky.html", "✏️", "Požadavky na model"),
    ]),
    ("Plánování", [
        ("rozpocet.html", "💰", "Rozpočet"),
        ("checklist.html", "✅", "Úkoly"),
        ("poznamky.html", "📝", "Poznámky"),
    ]),
]


def header_html() -> str:
    out = [
        '<header class="site-header">',
        '  <nav class="nav" aria-label="Hlavní navigace">',
        '    <a class="brand" href="index.html"><span class="logo">⌂</span>'
        '<span>RD Modřice<small>projekt rodiny Grmelových</small></span></a>',
        '    <div class="navlinks" id="navlinks">',
        '      <a class="navhome" href="index.html" data-ic="🏡">Přehled</a>',
    ]
    for name, links in GROUPS:
        out.append('      <div class="navgroup">')
        out.append(f'        <button class="navgroup-btn" type="button" aria-expanded="false">{name}</button>')
        out.append('        <div class="navmenu">')
        for href, icon, label in links:
            out.append(f'          <a href="{href}" data-ic="{icon}">{label}</a>')
        out.append('        </div>')
        out.append('      </div>')
    out += [
        '    </div>',
        '    <button class="search-btn" type="button" data-search-open title="Hledat na webu (Ctrl+K)" '
        'aria-label="Hledat na webu"><span aria-hidden="true">🔍</span><span class="search-lbl">Hledat</span></button>',
        '    <button class="theme-btn" title="Přepnout světlý / tmavý režim" aria-label="Přepnout vzhled">🌙</button>',
        '    <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded="false" '
        'aria-controls="navlinks"><span aria-hidden="true">☰</span></button>',
        '  </nav>',
        '</header>',
    ]
    return "\n".join(out)


def main() -> int:
    pattern = re.compile(r'<header class="site-header">.*?</header>', re.S)
    new = header_html()
    changed = 0
    for path in sorted(ROOT.glob("*.html")):
        src = path.read_text(encoding="utf-8")
        if not pattern.search(src):
            print(f"  –  {path.name}: bez hlavičky, přeskočeno")
            continue
        out = pattern.sub(lambda _m: new, src, count=1)
        if out != src:
            path.write_text(out, encoding="utf-8")
            changed += 1
            print(f"  ✓  {path.name}")
        else:
            print(f"  =  {path.name}")
    print(f"Hotovo, změněno {changed} souborů.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
