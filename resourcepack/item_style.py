"""アイテム画像を「インクで描き直した」タッチに変換する（ぼかしは一切使わない）。

1. EPX（Scale2x）で2倍に：斜めの線がなめらかになる。色は混ぜないので、ぼやけない
2. 線画を引き直す：外周1画素を墨色に。2倍にして2画素になった元の輪郭の内側は中の色で埋め、
   線を細くして「描いた」印象に（1画素幅の細い部分はそのまま残す）
3. 古地図の色調：影は茶の墨寄り、明るい所はクリーム寄りに少しだけ寄せる
4. 左上側の内側に1画素のハイライト
灰色の画素は灰色のまま（革の防具やポーションなど、ゲームが色を乗せる素材を壊さない）
"""
from PIL import Image

INK = (38, 24, 12)


def is_clear(c):
    return c[3] < 16


def epx(im):
    w, h = im.size
    src = im.load()
    out = Image.new('RGBA', (w * 2, h * 2))
    dst = out.load()

    def get(x, y):
        if 0 <= x < w and 0 <= y < h:
            c = src[x, y]
            return (0, 0, 0, 0) if is_clear(c) else c
        return (0, 0, 0, 0)
    for y in range(h):
        for x in range(w):
            P = get(x, y)
            A, B, C, D = get(x, y - 1), get(x + 1, y), get(x - 1, y), get(x, y + 1)
            e1 = e2 = e3 = e4 = P
            if C == A and C != D and A != B:
                e1 = A
            if A == B and A != C and B != D:
                e2 = B
            if D == C and D != B and C != A:
                e3 = C
            if B == D and B != A and D != C:
                e4 = D
            dst[2 * x, 2 * y], dst[2 * x + 1, 2 * y] = e1, e2
            dst[2 * x, 2 * y + 1], dst[2 * x + 1, 2 * y + 1] = e3, e4
    return out


def sat(c):
    return max(c[:3]) - min(c[:3])


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def grade(c):
    r, g, b, a = c
    if sat(c) <= 12:  # 灰色は灰色のまま（明るさの調子だけ整える）
        L = lum(c)
        k = 0.94 if L < 90 else 1.0
        v = max(0, min(255, round(L * k)))
        d = v - round(L)
        return (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)), a)
    L = lum(c) / 255
    # 影は墨色へ、明るい所はクリームへ、少しだけ
    if L < 0.5:
        t = (0.5 - L) * 0.36
        tgt = (59, 42, 20)
    else:
        t = (L - 0.5) * 0.22
        tgt = (251, 240, 214)
    return tuple(round(v + (w - v) * t) for v, w in zip((r, g, b), tgt)) + (a,)


def ink_of(c):
    if sat(c) <= 12:
        v = round(lum(c) * 0.22)
        return (v, v, v, 255)
    # 色味をほんの少し残した墨
    return tuple(round(i * 0.8 + v * 0.2 * 0.35) for i, v in zip(INK, c[:3])) + (255,)


def restyle(src):
    src = src.convert('RGBA')
    w, h = src.size
    sp = src.load()
    opaque = [[not is_clear(sp[x, y]) for x in range(w)] for y in range(h)]

    def op(x, y):
        return 0 <= x < w and 0 <= y < h and opaque[y][x]
    edge = [[opaque[y][x] and not all(op(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
             for x in range(w)] for y in range(h)]

    n_op = sum(map(sum, opaque))
    n_edge = sum(map(sum, edge))
    thin = n_op == 0 or n_edge / n_op > 0.82   # 糸・羽根のように、ほぼ全部が輪郭
    big = epx(src)
    W, H = big.size
    bp = big.load()
    bo = [[not is_clear(bp[x, y]) for x in range(W)] for y in range(H)]

    def bop(x, y):
        return 0 <= x < W and 0 <= y < H and bo[y][x]
    outer = [[bo[y][x] and not all(bop(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
              for x in range(W)] for y in range(H)]

    out = Image.new('RGBA', (W, H))
    q = out.load()
    for y in range(H):
        for x in range(W):
            c = bp[x, y]
            if not bo[y][x]:
                q[x, y] = (0, 0, 0, 0)
                continue
            sx, sy = x // 2, y // 2
            if c[3] < 250:  # ガラスなど半透明はそのまま（色調だけ）
                q[x, y] = grade(c)
                continue
            if outer[y][x]:
                if thin:
                    q[x, y] = tuple(round(v * 0.62) for v in c[:3]) + (255,)
                else:
                    q[x, y] = ink_of(c)
                continue
            if edge[sy][sx] and not thin:
                # 元の輪郭が2倍で太くなった内側：内側の隣の色で埋めて線を細く
                cand = [(sx + dx, sy + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                        if op(sx + dx, sy + dy) and not edge[sy + dy][sx + dx]]
                if cand:
                    # 2倍画素の位置に近い方の隣を選ぶ
                    fx, fy = (x % 2) * 2 - 1, (y % 2) * 2 - 1
                    cand.sort(key=lambda p: -((p[0] - sx) * fx + (p[1] - sy) * fy))
                    c = sp[cand[0]]
            g = grade(c)
            # 左上側の内側に細いハイライト
            if bop(x, y) and ((bop(x - 1, y) and outer[y][x - 1]) or (bop(x, y - 1) and outer[y - 1][x])) \
                    and not (bop(x + 1, y) and outer[y][x + 1]) and not (bop(x, y + 1) and outer[y + 1][x]):
                g = tuple(min(255, v + 22) for v in g[:3]) + (g[3],)
            q[x, y] = g
    return out
