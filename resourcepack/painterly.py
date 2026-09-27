"""元のVIVA-MCパックと同じ「絵画調」でアイテムを描く。

元パックの絵の特徴:
- 形ごとに、左上から光が当たったなめらかな陰影（色数が多い）
- 白く飛んだハイライト
- 決まった黒い輪郭線は無く、陰影の暗い縁で形が立つ
- 半透明は使わない（不透明か透明のどちらか）

描き方:
1. バニラの16px画像を、同じ色の部分がつながった「部品」に分ける（取っ手・刃・宝石など）
2. EPX を3回かけて128pxに拡大（色を混ぜない拡大なので形がなめらかになる）
3. 部品ごとに、中心から左上へ明るく、縁と右下へ暗くなる丸みのある陰影をつける
   （元の絵の細部も少しだけ残して、何のアイテムか分かるようにする）
4. 大きな部品には左上に白いハイライト
5. 16pxに縮小し、半透明を不透明/透明に振り分け、軽くシャープをかける
色を乗せる素材（革の防具など）は灰色のまま描く。
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SCALE = 8  # 16 -> 128


# ---------------------------------------------------------------- 色空間（sRGB <-> Lab）
def _srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255.0


_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_MI = np.linalg.inv(_M)
_WHITE = np.array([0.95047, 1.0, 1.08883])


def rgb_to_lab(rgb):
    xyz = _srgb_to_lin(rgb.astype(float)) @ _M.T / _WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1)


def lab_to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * _WHITE
    return _lin_to_srgb(xyz @ _MI.T)


# ---------------------------------------------------------------- EPX（色を混ぜない2倍拡大）
def epx(a):
    """a: (h, w) の整数ラベル配列を2倍にする。"""
    h, w = a.shape
    P = a
    pad = np.pad(a, 1, mode='constant', constant_values=-1)
    A = pad[0:h, 1:w + 1]      # 上
    B = pad[1:h + 1, 2:w + 2]  # 右
    C = pad[1:h + 1, 0:w]      # 左
    D = pad[2:h + 2, 1:w + 1]  # 下
    out = np.empty((h * 2, w * 2), a.dtype)
    e1 = np.where((C == A) & (C != D) & (A != B), A, P)
    e2 = np.where((A == B) & (A != C) & (B != D), B, P)
    e3 = np.where((D == C) & (D != B) & (C != A), C, P)
    e4 = np.where((B == D) & (B != A) & (D != C), D, P)
    out[0::2, 0::2], out[0::2, 1::2], out[1::2, 0::2], out[1::2, 1::2] = e1, e2, e3, e4
    return out


def upscale_labels(lab_img):
    x = lab_img
    for _ in range(3):
        x = epx(x)
    return x


# ---------------------------------------------------------------- 本体
def segment(rgba, thresh=34.0):
    """似た色でつながった画素を1つの部品にまとめる（union-find）。"""
    h, w, _ = rgba.shape
    opaque = rgba[..., 3] >= 128
    lab = rgb_to_lab(rgba[..., :3])
    parent = list(range(h * w))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for y in range(h):
        for x in range(w):
            if not opaque[y, x]:
                continue
            for dx, dy in ((1, 0), (0, 1)):
                nx, ny = x + dx, y + dy
                if nx < w and ny < h and opaque[ny, nx]:
                    if np.linalg.norm(lab[y, x] - lab[ny, nx]) < thresh:
                        ra, rb = find(y * w + x), find(ny * w + nx)
                        if ra != rb:
                            parent[ra] = rb
    labels = np.full((h, w), -1, int)
    ids = {}
    for y in range(h):
        for x in range(w):
            if opaque[y, x]:
                r = find(y * w + x)
                labels[y, x] = ids.setdefault(r, len(ids))
    return labels, lab


def paint(img, gray=False):
    src = np.array(img.convert('RGBA'), dtype=float)
    h, w = src.shape[:2]
    labels, lab = segment(src)
    n = labels.max() + 1
    if n <= 0:
        return img.convert('RGBA')

    # 16pxの画素番号を拡大して、128pxの各画素が「元のどの画素か」を得る
    idx = np.arange(h * w).reshape(h, w)
    idx = np.where(labels >= 0, idx, -1)
    big_idx = upscale_labels(idx)
    H, W = big_idx.shape
    valid = big_idx >= 0
    by, bx = np.divmod(np.where(valid, big_idx, 0), w)
    big_lab = lab[by, bx]                       # 元画素の色（細部として少し残す）
    big_reg = np.where(valid, labels[by, bx], -1)

    out_lab = np.zeros((H, W, 3))
    yy, xx = np.mgrid[0:H, 0:W]
    sil_dt = ndimage.distance_transform_edt(valid)  # 外形の縁からの距離
    for r in range(n):
        m = big_reg == r
        area = m.sum()
        if area == 0:
            continue
        cols = lab[labels == r]
        base = cols[np.argsort(cols[:, 0])[len(cols) // 2]]  # 明るさが中央の色を基調に
        cy, cx = yy[m].mean(), xx[m].mean()
        R = max(4.0, np.sqrt(area / np.pi))
        dt = ndimage.distance_transform_edt(m)
        t = ((xx - cx) + (yy - cy)) / (np.sqrt(2) * R)            # 左上が負、右下が正
        rim = np.clip(dt / (0.45 * R), 0, 1)                      # 縁ほど0
        shade = -17.0 * np.clip(t, -1.2, 1.2) + 16.0 * (rim - 0.62)
        detail = (big_lab[..., 0] - cols[:, 0].mean()) * 0.22       # 元の絵の凹凸を少し（宝石の面など）
        # 元パックの色味：明るめで、やわらかい
        L0 = base[0] + (100 - base[0]) * 0.16
        L = L0 + shade + detail
        chroma = 0.88 * (1.0 + 0.14 * (rim - 0.5))
        a = np.full((H, W), base[1]) * chroma
        b = np.full((H, W), base[2]) * chroma
        # 左上の白いハイライト（ある程度大きい部品だけ）
        if (labels == r).sum() >= 6:
            hx, hy = cx - 0.38 * R, cy - 0.38 * R
            d = np.sqrt((xx - hx) ** 2 + (yy - hy) ** 2) / (0.48 * R)
            spot = np.clip(1 - d, 0, 1) ** 1.3
            L = L + 44 * spot
            a = a * (1 - 0.7 * spot)
            b = b * (1 - 0.7 * spot)
        out_lab[m, 0] = L[m]
        out_lab[m, 1] = a[m]
        out_lab[m, 2] = b[m]

    # 外形のすぐ内側を少し沈めて、スロットの上でも形が読めるように
    edge = np.clip(1 - sil_dt / 7.0, 0, 1)
    out_lab[..., 0] -= 12 * edge
    out_lab[..., 0] = np.clip(out_lab[..., 0], 2, 100)

    rgb = lab_to_rgb(out_lab)
    if gray:
        g = rgb @ np.array([0.299, 0.587, 0.114])
        rgb = np.stack([g, g, g], -1)
    alpha = valid.astype(float)

    # 16pxへ縮小（アルファを掛けた平均）→ 半分以上覆われていれば不透明
    pre = rgb * alpha[..., None]
    k = SCALE
    pre16 = pre.reshape(h, k, w, k, 3).mean((1, 3))
    a16 = alpha.reshape(h, k, w, k).mean((1, 3))
    col = np.where(a16[..., None] > 0, pre16 / np.maximum(a16[..., None], 1e-6), 0)
    out = np.zeros((h, w, 4))
    out[..., :3] = np.clip(col, 0, 255)
    out[..., 3] = np.where(a16 >= 0.45, 255, 0)
    im = Image.fromarray(out.round().astype(np.uint8), 'RGBA')

    # 軽いシャープ（元パックの仕上げと同じ）。透明部分は近くの色で埋めてからかけ、縁に黒がにじまないように
    filled = out[..., :3].copy()
    if (out[..., 3] == 0).any() and (out[..., 3] > 0).any():
        _, (iy, ix) = ndimage.distance_transform_edt(out[..., 3] == 0, return_indices=True)
        filled = filled[iy, ix]
    rgb_im = Image.fromarray(filled.round().astype(np.uint8), 'RGB').filter(
        ImageFilter.UnsharpMask(radius=0.7, percent=55, threshold=0))
    res = Image.merge('RGBA', (*rgb_im.split(), im.split()[3]))
    return res
