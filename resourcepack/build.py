"""VIVA-MC 公式リソースパックを組み立てる（Minecraft 26.2 基準）。

使い方（リポジトリの一番上で）:
    pip install pillow numpy scipy
    python3 resourcepack/build.py
→ VIVA-MC-resourcepack.zip が作り直される。

土台は resourcepack/original/ にある「元々のVIVA-MCパック」の絵:
- 手描き風のアイテム77種・ブロック48種はそのまま使う
- 濃い木目＋VIVAオレンジのGUI、夕焼けのタイトル画面、旗のアイコンもそのまま活かす

そのうえで:
- 元パックに無いアイテム（26.2・26.3の全アイテム）を、元の絵と同じ絵画調で描き足す（painterly.py）
- 画面（インベントリ・チェストなど26種）は、元の木目の見た目で、26.2の正しい配置・大きさに描き直す
  （元のインベントリは 176×166 で作られていて、ゲームが前提にしている 256×256 と合わず、ズレていた）
- ボタン・ホットバー・選択枠は元の絵を、26.2の正しい場所・形式に置き直す
- 暗い木目の上だと画面の見出し（「インベントリ」など、ゲームが濃い灰色で描く文字）が読めないので、
  見出しの位置にだけ紙の名札を敷く
"""
import glob, hashlib, io, json, math, os, shutil, sys, tempfile, urllib.request, zipfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from painterly import paint  # noqa: E402

BASE_VERSION = '26.2'
EXTRA_ITEM_VERSIONS = ['26.3']      # pack.mcmeta の max_format と合わせる
MIN_FORMAT, MAX_FORMAT = 88, 97     # 26.2 = 88.0 / 26.3 = 97.1
SITE = os.path.dirname(HERE)
ORIG = os.path.join(HERE, 'original', 'assets', 'minecraft') + os.sep
WORK = os.path.join(tempfile.gettempdir(), 'viva-pack-build')
V = os.path.join(WORK, 'vanilla', 'assets', 'minecraft') + os.sep
OUT = os.path.join(WORK, 'out')


def client_jar(version):
    jar = os.path.join(WORK, f'client-{version}.jar')
    if not os.path.exists(jar):
        manifest = json.load(urllib.request.urlopen('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'))
        entry = next(v for v in manifest['versions'] if v['id'] == version)
        ver = json.load(urllib.request.urlopen(entry['url']))
        print('downloading client', version)
        urllib.request.urlretrieve(ver['downloads']['client']['url'], jar)
    return jar


os.makedirs(WORK, exist_ok=True)
if not os.path.isdir(V + 'items'):
    with zipfile.ZipFile(client_jar(BASE_VERSION)) as z:
        for n in z.namelist():
            if n.startswith(('assets/minecraft/textures/', 'assets/minecraft/items/', 'assets/minecraft/models/item/')):
                z.extract(n, os.path.join(WORK, 'vanilla'))

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
written = []


# ================================================================ 共通
def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c0, c1, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))


def noise(x, y, salt, amp):
    h = hashlib.blake2b(f'{salt}:{x}:{y}'.encode(), digest_size=2).digest()
    return (int.from_bytes(h, 'big') / 65535.0 * 2 - 1) * amp


def out_path(rel):
    return os.path.join(OUT, 'assets/minecraft', rel)


def save(im, rel, meta_from=None):
    p = out_path(rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)
    written.append(rel)
    meta = (meta_from or V + rel) + '.mcmeta'
    if os.path.exists(meta):  # 九分割などの指定は同じパックに置かないと効かない
        shutil.copy(meta, p + '.mcmeta')


def copy_orig(rel_from, rel_to=None):
    im = Image.open(ORIG + rel_from)
    save(im, rel_to or rel_from)


# 元パックのGUIから採った色
WOOD = [hexc(c) for c in ('#1F150C', '#2A1D11', '#352516', '#41301D', '#4E3923')]
SLOT = hexc('#25180E')
SLOT_DARK = hexc('#120B06')
BEVEL_LIGHT = hexc('#604428')
BEVEL_DARK = hexc('#180F09')
OUTLINE = hexc('#0E0905')
ORANGE = hexc('#E8570C')
PAPER, PAPER_EDGE = hexc('#DCC89C'), hexc('#6E4F28')


# ================================================================ 1. 画面（コンテナ）
def wood_at(x, y, salt):
    """縦の木目（元パックの板と同じ向き）。"""
    wave = math.sin(y / 9.0 + x * 0.7) * 0.6
    band = math.sin((x + wave) * 0.55) * 0.5 + math.sin((x + wave) * 0.23 + 1.7) * 0.5
    v = 0.5 + 0.35 * band + noise(x // 1, y // 3, salt, 0.12)
    v = max(0.0, min(0.999, v))
    i = v * (len(WOOD) - 1)
    return mix(WOOD[int(i)], WOOD[min(int(i) + 1, len(WOOD) - 1)], i - int(i))


GRAY_MAP = {  # バニラの灰色 → 元パックの木目GUIの色
    0xC6: None,          # 板（木目で塗る）
    0xFF: BEVEL_LIGHT,   # 明るい面取り
    0x55: BEVEL_DARK,    # 暗い面取り
    0x00: OUTLINE,       # 外枠・プレイヤー表示の窓
    0x8B: SLOT,          # スロットの中
    0x37: SLOT_DARK,     # スロットの影
}
RAMP_PTS = sorted([(0x00, OUTLINE), (0x37, SLOT_DARK), (0x55, BEVEL_DARK), (0x8B, SLOT),
                   (0xC6, WOOD[2]), (0xFF, BEVEL_LIGHT)])


def ramp_gray(L):
    for (l0, c0), (l1, c1) in zip(RAMP_PTS, RAMP_PTS[1:]):
        if L <= l1:
            return mix(c0, c1, (L - l0) / (l1 - l0))
    return RAMP_PTS[-1][1]


def label_bands(px, w, h, rel):
    """見出しの文字が描かれる帯を探して、紙の名札を敷く範囲を返す。"""
    panel = [[px[x, y][:3] == (0xC6, 0xC6, 0xC6) and px[x, y][3] == 255 for x in range(w)] for y in range(h)]

    def clear_run(y0, y1, prefer_x):
        runs, start = [], None
        for x in range(w + 1):
            ok = x < w and all(panel[y][x] for y in range(y0, y1 + 1))
            if ok and start is None:
                start = x
            elif not ok and start is not None:
                runs.append((start, x - 1))
                start = None
        for a, b in runs:
            if a <= prefer_x <= b and b - a >= 30:
                return a + 1, b - 1
        return None
    bands = []
    name = os.path.basename(rel)
    # 画面タイトル（ふつうは左上 x=8, y=6。画面によって位置が違うものは個別に）
    tx, ty = {'inventory.png': (97, 5), 'anvil.png': (60, 5), 'smithing.png': (44, 14)}.get(name, (8, 5))
    r = clear_run(ty, ty + 9, tx)
    if r:
        bands.append((r[0], ty, r[1], ty + 9))
    # 「インベントリ」の見出し：手持ちの3段の少し上
    slots = []
    for y in range(h - 15):
        for x in range(w - 15):
            S = (0x8B, 0x8B, 0x8B)
            # 16×16 の中身がそろっている所だけをスロットとみなす（角の1画素などを拾わない）
            if px[x, y][:3] == S and all(px[x + dx, y + dy][:3] == S
                                         for dx, dy in ((15, 0), (0, 15), (15, 15), (1, 1), (8, 8))) \
                    and (x == 0 or px[x - 1, y][:3] != S) and (y == 0 or px[x, y - 1][:3] != S):
                slots.append((x, y))
    if name != 'inventory.png' and slots:
        rows = sorted(set(y for _, y in slots))
        # 下から4段（ホットバー＋3段）がそろっている場合だけ
        if len(rows) >= 4:
            top = rows[-4]
            r = clear_run(top - 12, top - 3, 8)
            if r:
                bands.append((r[0], top - 12, r[1], top - 3))
    return bands


def build_container(rel):
    im = Image.open(V + rel).convert('RGBA')
    w, h = im.size
    px = im.load()
    bands = label_bands(px, w, h, rel) if rel.startswith('textures/gui/container/') else []
    out = im.copy()
    q = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if (r, g, b) == (255, 0, 0):  # 金床の入力欄の下地（本来は隠れる仮置き）
                q[x, y] = SLOT_DARK + (a,)
                continue
            if max(r, g, b) - min(r, g, b) > 10:
                continue  # 色のついた部分（矢印・炎など）はそのまま
            if (r, g, b) == (0xC6, 0xC6, 0xC6):
                c = wood_at(x, y, rel)
            elif r == g == b and r in GRAY_MAP and GRAY_MAP[r] is not None:
                c = GRAY_MAP[r]
            else:
                c = ramp_gray(round(0.299 * r + 0.587 * g + 0.114 * b))
            q[x, y] = c + (a,)
    # 見出しの名札
    for x0, y0, x1, y1 in bands:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if px[x, y][:3] != (0xC6, 0xC6, 0xC6):
                    continue
                if y in (y0, y1) or x in (x0, x1):
                    c = PAPER_EDGE
                else:
                    c = mix(PAPER, (255, 250, 235), 0.25) if y == y0 + 1 else PAPER
                    c = tuple(max(0, min(255, round(v + noise(x, y, 'paper', 5)))) for v in c)
                q[x, y] = c + (255,)
    save(out, rel)
    return len(bands)


container_files = sorted(set(
    glob.glob(V + 'textures/gui/container/**/*.png', recursive=True)
    + glob.glob(V + 'textures/gui/sprites/container/**/*.png', recursive=True)
    + glob.glob(V + 'textures/gui/sprites/recipe_book/**/*.png', recursive=True)
    + [V + 'textures/gui/recipe_book.png']))
plates = 0
for f in container_files:
    plates += build_container(os.path.relpath(f, V))
print('containers:', len(container_files), 'label plates:', plates)


# ================================================================ 2. ボタン・入力欄など
ow = Image.open(ORIG + 'textures/gui/widgets.png').convert('RGBA')
for name, y in (('button', 0), ('button_highlighted', 20), ('button_disabled', 40)):
    save(ow.crop((0, y, 200, y + 20)), f'textures/gui/sprites/widget/{name}.png')

WIDGET_PTS = sorted([(0x00, hexc('#120B06')), (0x2C, hexc('#2A1D11')), (0x6F, hexc('#644422')),
                     (0x75, hexc('#6E4B27')), (0xA0, hexc('#8A6238')), (0xFF, ORANGE)])


def widget_ramp(L):
    for (l0, c0), (l1, c1) in zip(WIDGET_PTS, WIDGET_PTS[1:]):
        if L <= l1:
            return mix(c0, c1, (L - l0) / (l1 - l0))
    return WIDGET_PTS[-1][1]


def recolor(rel, fn, sat_max=10):
    im = Image.open(V + rel).convert('RGBA')
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) <= sat_max:
                px[x, y] = fn(round(0.299 * r + 0.587 * g + 0.114 * b)) + (a,)
    save(im, rel)


for f in sorted(glob.glob(V + 'textures/gui/sprites/widget/*.png')):
    rel = os.path.relpath(f, V)
    if os.path.basename(f) not in ('button.png', 'button_highlighted.png', 'button_disabled.png'):
        recolor(rel, widget_ramp)


# ================================================================ 3. ホットバー・照準
# 元パックは旧形式の場所（gui/hud/）に置いていて効いていなかったので、26.2の場所へ
copy_orig('textures/gui/hud/hotbar.png', 'textures/gui/sprites/hud/hotbar.png')
copy_orig('textures/gui/hud/hotbar_selection.png', 'textures/gui/sprites/hud/hotbar_selection.png')
for side in ('left', 'right'):
    recolor(f'textures/gui/sprites/hud/hotbar_offhand_{side}.png', widget_ramp, sat_max=40)

# 照準：元の「4本の棒」を、26.2の 15×15 に合わせて描き直し（中心が1画素ずれないように）
ch = Image.new('RGBA', (15, 15), (0, 0, 0, 0))
d = ImageDraw.Draw(ch)
light, mid = (236, 236, 236, 255), (170, 170, 170, 255)
for a, b in ((0, 4), (10, 14)):
    d.line([(7, a), (7, b)], fill=light)
    d.line([(a, 7), (b, 7)], fill=light)
for p in ((7, 2), (7, 12), (2, 7), (12, 7)):
    d.point(p, fill=mid)
save(ch, 'textures/gui/sprites/hud/crosshair.png')

# ================================================================ 4. 説明の吹き出し
im = Image.open(V + 'textures/gui/sprites/tooltip/background.png').convert('RGBA')
px = im.load()
for y in range(im.size[1]):
    for x in range(im.size[0]):
        if px[x, y][3]:
            px[x, y] = (0x1E, 0x14, 0x0B, px[x, y][3])
save(im, 'textures/gui/sprites/tooltip/background.png')
im = Image.open(V + 'textures/gui/sprites/tooltip/frame.png').convert('RGBA')
px = im.load()
for y in range(im.size[1]):
    for x in range(im.size[0]):
        r, g, b, a = px[x, y]
        if a:
            t = max(0.0, min(1.0, (b / 255 - 0.5) * 2))
            px[x, y] = mix(hexc('#7A2E08'), ORANGE, t) + (min(255, round(a * 2.4)),)
save(im, 'textures/gui/sprites/tooltip/frame.png')

# ================================================================ 5. タイトル画面（元の夕焼け）
for i in range(6):
    copy_orig(f'textures/gui/title/background/panorama_{i}.png')

# ================================================================ 6. ブロック（元の手描き48種）
for f in sorted(glob.glob(ORIG + 'textures/block/*.png')):
    copy_orig(os.path.relpath(f, ORIG))

# ================================================================ 7. アイテム
tinted = set()   # ゲームが色を乗せる素材（革の防具など）は灰色で描く


def _walk(o):
    if isinstance(o, dict):
        if 'tints' in o and 'model' in o:
            yield o['model'], len(o['tints'])
        for v in o.values():
            yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)


def _model_textures(name, depth=0):
    p = V + 'models/item/' + name.split('/')[-1] + '.json'
    if depth > 5 or not os.path.exists(p):
        return {}
    j = json.load(open(p))
    t = dict(j.get('textures', {}))
    if str(j.get('parent', '')).startswith(('minecraft:item/', 'item/')):
        base = _model_textures(j['parent'], depth + 1)
        base.update(t)
        t = base
    return t


for f in glob.glob(V + 'items/*.json'):
    for model, n in _walk(json.load(open(f))):
        tex = _model_textures(model)
        for i in range(n):
            v = tex.get(f'layer{i}')
            if v:
                tinted.add(v.split('/')[-1])


def gray_of(im):
    im = im.convert('RGBA')
    g = im.convert('L')
    return Image.merge('RGBA', (g, g, g, im.split()[3]))


orig_items = {os.path.basename(f)[:-4] for f in glob.glob(ORIG + 'textures/item/*.png')}
done = set()
for f in sorted(glob.glob(ORIG + 'textures/item/*.png')):
    name = os.path.basename(f)[:-4]
    im = Image.open(f)
    save(gray_of(im) if name in tinted else im, f'textures/item/{name}.png')
    done.add(name)

drawn = 0
for f in sorted(glob.glob(V + 'textures/item/**/*.png', recursive=True)):
    rel = os.path.relpath(f, V)
    name = os.path.basename(f)[:-4]
    if name in done:
        continue
    save(paint(Image.open(f), gray=name in tinted), rel)
    done.add(name)
    drawn += 1

for extra in EXTRA_ITEM_VERSIONS:
    with zipfile.ZipFile(client_jar(extra)) as z:
        for n in z.namelist():
            if n.startswith('assets/minecraft/textures/item/') and n.endswith('.png'):
                name = os.path.basename(n)[:-4]
                if name in done:
                    continue
                save(paint(Image.open(io.BytesIO(z.read(n)))), n[len('assets/minecraft/'):])
                done.add(name)
                drawn += 1
print('items: original', len(orig_items), '+ drawn', drawn, '=', len(done))

# ================================================================ 8. タイトル画面の一言
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
航海日誌をつけよう！
今日も市場は変動中！
投票ありがとう！
Discordで待ってます！
viva-mc.net
条約を結ぼう！
国境線は大事！
隣国と仲良く！
建国記念日おめでとう！
全部のアイテム、描き直しました！
村人と取引しよう！
カジノはほどほどに！
仕事で稼ごう！
夕焼けの国へ！
王都はどこ？
港町に寄っていこう！
""".strip().split('\n')
p = out_path('texts/splashes.txt')
os.makedirs(os.path.dirname(p), exist_ok=True)
open(p, 'w', encoding='utf-8').write('\n'.join(splashes) + '\n')

# ================================================================ 9. アイコン・pack.mcmeta
shutil.copy(os.path.join(HERE, 'original', 'pack.png'), os.path.join(OUT, 'pack.png'))
meta = {"pack": {
    "description": "VIVA-MC 公式リソースパック\n§6全アイテム手描き風・木目のGUI（26.2対応）",
    "min_format": MIN_FORMAT,
    "max_format": MAX_FORMAT,
}}
open(os.path.join(OUT, 'pack.mcmeta'), 'w', encoding='utf-8').write(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')

# ================================================================ ZIPにまとめる（pack.mcmeta を先頭に）
files = []
for dp, _, fs in os.walk(OUT):
    for f in fs:
        files.append(os.path.relpath(os.path.join(dp, f), OUT))
files.sort(key=lambda p: (p != 'pack.mcmeta', p != 'pack.png', p))
dest = os.path.join(SITE, 'VIVA-MC-resourcepack.zip')
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in files:
        zi = zipfile.ZipInfo(f.replace(os.sep, '/'), date_time=(2026, 1, 1, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, open(os.path.join(OUT, f), 'rb').read())
print('wrote', dest, len(files), 'files')
