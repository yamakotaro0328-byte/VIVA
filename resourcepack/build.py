"""VIVA-MC 公式リソースパックを、Minecraft 26.2 のバニラ素材を基準に組み立てる。

使い方（リポジトリの一番上で）:
    python3 resourcepack/build.py
→ VIVA-MC-resourcepack.zip が作り直される。

- 26.2 のクライアントjarをMojangの配布元から取ってきて、中の素材を基準にする
- すべてのテクスチャはバニラと同じパス・同じ縦横サイズで出力する（大きさズレを起こさない）
- 灰色の部分だけを「古地図」パレットに置き換え、色のついた部分（矢印・炎など）はそのまま残す
- スプライトの .mcmeta（九分割・伸縮の指定）はバニラのものを必ず同梱する
- 必要なもの: Python 3 と Pillow（pip install pillow）
"""
import glob, hashlib, io, json, os, shutil, sys, tempfile, urllib.request, zipfile
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from item_style import restyle  # noqa: E402

BASE_VERSION = '26.2'
EXTRA_ITEM_VERSIONS = ['26.3']  # pack.mcmeta の max_format と合わせる
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(tempfile.gettempdir(), 'viva-pack-build')
JAR = os.path.join(WORK, f'client-{BASE_VERSION}.jar')
V = os.path.join(WORK, 'vanilla', 'assets', 'minecraft') + os.sep
OUT = os.path.join(WORK, 'out')

os.makedirs(WORK, exist_ok=True)
if not os.path.exists(JAR):
    manifest = json.load(urllib.request.urlopen('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'))
    entry = next(v for v in manifest['versions'] if v['id'] == BASE_VERSION)
    ver = json.load(urllib.request.urlopen(entry['url']))
    print('downloading client', BASE_VERSION)
    urllib.request.urlretrieve(ver['downloads']['client']['url'], JAR)
if not os.path.isdir(V + 'textures/item'):
    with zipfile.ZipFile(JAR) as z:
        for n in z.namelist():
            if n.startswith(('assets/minecraft/textures/gui/', 'assets/minecraft/textures/block/',
                             'assets/minecraft/textures/item/')):
                z.extract(n, os.path.join(WORK, 'vanilla'))

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
written = []


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def ramp(anchors):
    pts = sorted((l, hexc(c)) for l, c in anchors)

    def f(L):
        if L <= pts[0][0]:
            return pts[0][1]
        for (l0, c0), (l1, c1) in zip(pts, pts[1:]):
            if L <= l1:
                t = (L - l0) / (l1 - l0) if l1 != l0 else 0
                return tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))
        return pts[-1][1]
    return f


def noise(x, y, salt, amp):
    h = hashlib.blake2b(f'{salt}:{x}:{y}'.encode(), digest_size=2).digest()
    return (int.from_bytes(h, 'big') % (2 * amp + 1)) - amp


def clamp(v):
    return max(0, min(255, v))


def out_path(rel):
    return os.path.join(OUT, 'assets/minecraft', rel)


def save(im, rel):
    p = out_path(rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)
    written.append(rel)
    meta = V + rel + '.mcmeta'
    if os.path.exists(meta):  # 九分割などの指定は同じパックに置かないと効かない
        shutil.copy(meta, p + '.mcmeta')


def recolor(rel, fn, sat_max=10, grain=None):
    """灰色（彩度が低い）画素だけを fn(明るさ) で塗り替える。"""
    im = Image.open(V + rel).convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or max(r, g, b) - min(r, g, b) > sat_max:
                continue
            L = round(0.299 * r + 0.587 * g + 0.114 * b)
            nr, ng, nb = fn(L)
            if grain and (r, g, b) == grain[0]:
                n = noise(x, y, rel, grain[1])
                nr, ng, nb = clamp(nr + n), clamp(ng + n), clamp(nb + n)
            px[x, y] = (nr, ng, nb, a)
    save(im, rel)


# ---------------------------------------------------------------- GUI 容器（インベントリ・チェストなど）
paper = ramp([(0x00, '#2F2010'), (0x37, '#5B4626'), (0x55, '#8A6A38'),
              (0x8B, '#B39458'), (0xC6, '#E4CF9F'), (0xFF, '#FBF3DD')])
container_files = sorted(set(
    glob.glob(V + 'textures/gui/container/**/*.png', recursive=True)
    + glob.glob(V + 'textures/gui/sprites/container/**/*.png', recursive=True)
    + glob.glob(V + 'textures/gui/sprites/recipe_book/**/*.png', recursive=True)
    + [V + 'textures/gui/recipe_book.png']))
for f in container_files:
    recolor(os.path.relpath(f, V), paper, grain=((0xC6, 0xC6, 0xC6), 3))

# ---------------------------------------------------------------- ボタン・入力欄など（白い文字が読める濃さに）
walnut = ramp([(0x00, '#1A1108'), (0x2C, '#3A2A18'), (0x6F, '#6B4F2F'), (0x75, '#77593A'),
               (0xA0, '#A07D48'), (0xFF, '#E6C877')])
for f in sorted(glob.glob(V + 'textures/gui/sprites/widget/*.png')):
    recolor(os.path.relpath(f, V), walnut)

# ---------------------------------------------------------------- ホットバー
for rel in ('textures/gui/sprites/hud/hotbar.png',
            'textures/gui/sprites/hud/hotbar_offhand_left.png',
            'textures/gui/sprites/hud/hotbar_offhand_right.png'):
    recolor(rel, walnut, sat_max=40)
gold = ramp([(0x00, '#2A1606'), (0x5F, '#7A4A12'), (0xA1, '#C99A3A'), (0xD5, '#F0CE70'), (0xFF, '#FFF1C4')])
recolor('textures/gui/sprites/hud/hotbar_selection.png', gold, sat_max=30)

# ---------------------------------------------------------------- 説明の吹き出し（ツールチップ）
im = Image.open(V + 'textures/gui/sprites/tooltip/background.png').convert('RGBA')
px = im.load()
for y in range(im.size[1]):
    for x in range(im.size[0]):
        r, g, b, a = px[x, y]
        if a:
            px[x, y] = (0x1C, 0x12, 0x09, a)
save(im, 'textures/gui/sprites/tooltip/background.png')

im = Image.open(V + 'textures/gui/sprites/tooltip/frame.png').convert('RGBA')
px = im.load()
lo, hi = hexc('#6E3F14'), hexc('#D9B25A')
for y in range(im.size[1]):
    for x in range(im.size[0]):
        r, g, b, a = px[x, y]
        if a:
            t = max(0.0, min(1.0, (b / 255 - 0.5) * 2))
            px[x, y] = tuple(round(l + (h - l) * t) for l, h in zip(lo, hi)) + (min(255, round(a * 2.2)),)
save(im, 'textures/gui/sprites/tooltip/frame.png')

# ---------------------------------------------------------------- 照準（羅針図の十字）
im = Image.new('RGBA', (15, 15), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
W = (255, 255, 255, 255)
d.point((7, 7), fill=W)
d.line([(7, 1), (7, 5)], fill=W)
d.line([(7, 9), (7, 13)], fill=W)
d.line([(1, 7), (5, 7)], fill=W)
d.line([(9, 7), (13, 7)], fill=W)
for x, y in ((5, 5), (9, 5), (5, 9), (9, 9)):
    d.point((x, y), fill=W)
save(im, 'textures/gui/sprites/hud/crosshair.png')

# ---------------------------------------------------------------- 鉱石：鉱物の粒に縁取りをつけて見つけやすく
def enhance_ore(ore_rel, base_rel):
    ore = Image.open(V + ore_rel).convert('RGBA')
    base = Image.open(V + base_rel).convert('RGBA')
    if ore.size != base.size:
        return False
    w, h = ore.size
    op, bp = ore.load(), base.load()
    # 鉱石のテクスチャは「元の石＋鉱物の粒」なので、石と1画素でも違うところが粒
    mineral = [[op[x, y][:3] != bp[x, y][:3] for x in range(w)] for y in range(h)]
    lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    mins = [lum(op[x, y]) for y in range(h) for x in range(w) if mineral[y][x]]
    bases = [lum(bp[x, y]) for y in range(h) for x in range(w)]
    dark_mineral = sum(mins) / len(mins) < sum(bases) / len(bases)  # 石炭のように粒の方が暗い
    rim = 1.22 if dark_mineral else 0.6
    out = ore.copy()
    q = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = op[x, y]
            if mineral[y][x]:
                if max(r, g, b) - min(r, g, b) > 20:  # 色のついた粒だけ鮮やかに
                    m = (r + g + b) / 3
                    q[x, y] = tuple(clamp(round(m + (c - m) * 1.3 + 8)) for c in (r, g, b)) + (a,)
                elif dark_mineral:
                    q[x, y] = (round(r * .78), round(g * .78), round(b * .78), a)
            elif any(mineral[(y + dy) % h][(x + dx) % w] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                q[x, y] = (clamp(round(r * rim)), clamp(round(g * rim)), clamp(round(b * rim)), a)
    save(out, ore_rel)
    return True

ores = ['coal', 'iron', 'copper', 'gold', 'redstone', 'emerald', 'lapis', 'diamond']
for o in ores:
    enhance_ore(f'textures/block/{o}_ore.png', 'textures/block/stone.png')
    enhance_ore(f'textures/block/deepslate_{o}_ore.png', 'textures/block/deepslate.png')
enhance_ore('textures/block/nether_gold_ore.png', 'textures/block/netherrack.png')
enhance_ore('textures/block/nether_quartz_ore.png', 'textures/block/netherrack.png')

# ---------------------------------------------------------------- アイテム：全部を同じタッチで描き直す
item_files = sorted(glob.glob(V + 'textures/item/**/*.png', recursive=True))
for f in item_files:
    save(restyle(Image.open(f)), os.path.relpath(f, V))
print('items restyled:', len(item_files))

# 対応範囲の上限（26.3）で増えたアイテムも描き直しておく
for extra in EXTRA_ITEM_VERSIONS:
    jar = os.path.join(WORK, f'client-{extra}.jar')
    if not os.path.exists(jar):
        manifest = json.load(urllib.request.urlopen('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'))
        entry = next(v for v in manifest['versions'] if v['id'] == extra)
        ver = json.load(urllib.request.urlopen(entry['url']))
        print('downloading client', extra)
        urllib.request.urlretrieve(ver['downloads']['client']['url'], jar)
    added = 0
    with zipfile.ZipFile(jar) as z:
        for n in z.namelist():
            if n.startswith('assets/minecraft/textures/item/') and n.endswith('.png'):
                rel = n[len('assets/minecraft/'):]
                if not os.path.exists(V + rel):
                    save(restyle(Image.open(io.BytesIO(z.read(n)))), rel)
                    added += 1
    print(f'items added from {extra}:', added)

# ---------------------------------------------------------------- タイトル画面の一言
splashes = """VIVA-MCへようこそ！
君だけの国家を！
憲法をつくろう！
関税は慎重に！
宣戦布告は正式な手続きで！
資源ワールドは毎月15日にリセット！
Landsで土地を守ろう！
/server build で建築サーバーへ！
地図を描き足そう！
Terra incognita!
羅針盤を信じて！
航海日誌をつけよう！
今日も市場は変動中！
投票ありがとう！
Discordで待ってます！
viva-mc.net
条約を結ぼう！
国境線は大事！
隣国と仲良く！
建国記念日おめでとう！
鉱石が見つけやすくなりました！
インベントリも古地図風！
村人と取引しよう！
カジノはほどほどに！
仕事で稼ごう！
手描きの地図のように！
王都はどこ？
港町に寄っていこう！
""".strip().split('\n')
p = out_path('texts/splashes.txt')
os.makedirs(os.path.dirname(p), exist_ok=True)
open(p, 'w', encoding='utf-8').write('\n'.join(splashes) + '\n')
written.append('texts/splashes.txt')

# ---------------------------------------------------------------- パックのアイコン
S = 128
icon = Image.new('RGBA', (S, S), hexc('#E9D8B0') + (255,))
d = ImageDraw.Draw(icon)
for i in range(0, S, 16):  # 方眼
    d.line([(i, 0), (i, S)], fill=(120, 88, 44, 40))
    d.line([(0, i), (S, i)], fill=(120, 88, 44, 40))
d.rectangle([2, 2, S - 3, S - 3], outline=hexc('#2F2010'), width=3)
d.rectangle([8, 8, S - 9, S - 9], outline=hexc('#937344'), width=1)
srv = Image.open(SITE + '/server-icon-512.png').convert('RGBA').resize((88, 88), Image.LANCZOS)
icon.alpha_composite(srv, ((S - 88) // 2, (S - 88) // 2))
for cx, cy in ((14, 14), (S - 15, 14), (14, S - 15), (S - 15, S - 15)):  # 四隅の菱形
    d.polygon([(cx, cy - 4), (cx + 4, cy), (cx, cy + 4), (cx - 4, cy)], fill=hexc('#93301C'))
icon.convert('RGB').save(os.path.join(OUT, 'pack.png'), optimize=True)

# ---------------------------------------------------------------- pack.mcmeta（26.2 = 88.0 〜 26.3 = 97.1）
meta = {
    "pack": {
        "description": "VIVA-MC 公式リソースパック\n§6全アイテム描き直し・古地図風GUI（26.2対応）",
        "min_format": 88,
        "max_format": 97
    }
}
open(os.path.join(OUT, 'pack.mcmeta'), 'w', encoding='utf-8').write(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')

print('textures written:', len([w for w in written if w.endswith('.png')]))


# ---------------------------------------------------------------- ZIPにまとめる（pack.mcmeta を先頭に）
files = []
for d, _, fs in os.walk(OUT):
    for f in fs:
        files.append(os.path.relpath(os.path.join(d, f), OUT))
files.sort(key=lambda p: (p != 'pack.mcmeta', p != 'pack.png', p))
dest = os.path.join(SITE, 'VIVA-MC-resourcepack.zip')
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in files:
        zi = zipfile.ZipInfo(f.replace(os.sep, '/'), date_time=(2026, 1, 1, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, open(os.path.join(OUT, f), 'rb').read())
print('wrote', dest, len(files), 'files')
