"""ブロックを元のVIVA-MCパックのブロックと同じタッチにする。

元パックのブロックの特徴:
- 細かいノイズが少なく、色がやわらかい「かたまり」にまとまっている（羊毛・石・丸石など）
- かたまりの左上が少し明るく、右下が少し暗い（ふっくらした立体感）

描き方（ブロックはつなげて敷き詰めるので、端と端がつながるように計算する）:
1. 形を保ったまま細かいノイズをならす（色の近い画素どうしだけを平均）
2. 色数を5〜6色にまとめて、かたまりを作る（少しだけ元のグラデーションを残す）
3. かたまりの左上の縁を明るく、右下の縁を暗くして、ふっくらさせる
透明の形（花・葉・扉など）は1画素も変えない。草・葉など色を乗せる素材（灰色）は灰色のまま。
アニメーションは1コマずつ処理する。
"""
import numpy as np
from PIL import Image

from painterly import rgb_to_lab, lab_to_rgb

OFFS = [(dy, dx) for dy in range(-2, 3) for dx in range(-2, 3) if (dy, dx) != (0, 0) and dy * dy + dx * dx <= 5]


def _roll(a, dy, dx):
    return np.roll(np.roll(a, dy, 0), dx, 1)


def _smooth(lab, opaque, sigma_s=1.5, sigma_r=12.0, iters=3):
    x = lab.copy()
    for _ in range(iters):
        acc = x * opaque[..., None]
        wsum = opaque.astype(float).copy()
        for dy, dx in OFFS:
            nb = _roll(x, dy, dx)
            no = _roll(opaque, dy, dx)
            d2 = ((nb - x) ** 2).sum(-1)
            wgt = np.exp(-(dy * dy + dx * dx) / (2 * sigma_s ** 2)) * np.exp(-d2 / (2 * sigma_r ** 2)) * no * opaque
            acc += nb * wgt[..., None]
            wsum += wgt
        x = np.where(opaque[..., None], acc / np.maximum(wsum, 1e-6)[..., None], x)
    return x


def _kmeans(pts, k, iters=10):
    k = min(k, len(np.unique(pts.round(1), axis=0)))
    if k <= 1:
        return np.zeros(len(pts), int), pts.mean(0, keepdims=True)
    order = np.argsort(pts[:, 0])
    centers = pts[order[np.linspace(0, len(pts) - 1, k).astype(int)]].copy()
    for _ in range(iters):
        d = ((pts[:, None, :] - centers[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        for i in range(k):
            m = lab == i
            if m.any():
                centers[i] = pts[m].mean(0)
    return lab, centers


def stylize_frame(rgba):
    a = rgba[..., 3]
    opaque = a > 0
    if not opaque.any():
        return rgba
    lab = rgb_to_lab(rgba[..., :3].astype(float))
    # ほぼ全部が無彩色のときだけ「色を乗せる素材」とみなす（うすい水色のガラスなどを灰色にしない）
    gray = np.percentile(np.hypot(lab[..., 1], lab[..., 2])[opaque], 90) < 4

    sm = _smooth(lab, opaque)
    n_colors = len(np.unique(rgba[opaque][:, :3], axis=0))
    k = 7 if n_colors > 12 else max(2, min(5, n_colors))
    pts = sm[opaque]
    lab_idx, centers = _kmeans(pts, k)
    labels = np.full(a.shape, -1)
    labels[opaque] = lab_idx
    post = sm.copy()
    post[opaque] = centers[lab_idx] * 0.75 + pts * 0.25
    # 鉱石の粒や花びらのように、まわりと色の違う小さな部分はまとめずに残す
    orig = lab[opaque]
    far = np.sqrt(((orig - centers[lab_idx]) ** 2).sum(-1)) > 14
    keep = post[opaque]
    keep[far] = orig[far] * 0.7 + pts[far] * 0.3
    post[opaque] = keep
    labels_flat = labels[opaque]
    labels_flat[far] = k + np.arange(far.sum())  # 残した画素は、縁取りの計算で別のかたまり扱い
    labels[opaque] = labels_flat

    # かたまりの縁：左上を明るく、右下を暗く（隣が不透明のときだけ）
    L = post[..., 0]
    for dy, dx, amt in ((-1, 0, 5.0), (0, -1, 4.0), (1, 0, -6.0), (0, 1, -5.0)):
        nb = _roll(labels, -dy, -dx)
        no = _roll(opaque, -dy, -dx)
        edge = opaque & no & (nb != labels)
        L = L + amt * edge
    post[..., 0] = np.clip(L, 0, 100)

    rgb = lab_to_rgb(post)
    if gray:
        g = rgb @ np.array([0.299, 0.587, 0.114])
        rgb = np.stack([g, g, g], -1)
    out = rgba.copy()
    out[..., :3] = np.where(opaque[..., None], np.clip(rgb.round(), 0, 255), rgba[..., :3]).astype(np.uint8)
    return out


def stylize(img, animated=False, name=''):
    im = img.convert('RGBA')
    if 'glass' in name:  # ガラスは縁と光の筋が命なので、元の絵を残す
        return im
    arr = np.array(im)
    h, w = arr.shape[:2]
    if animated and h > w and h % w == 0:
        frames = [stylize_frame(arr[i * w:(i + 1) * w]) for i in range(h // w)]
        arr = np.concatenate(frames, 0)
    else:
        arr = stylize_frame(arr)
    return Image.fromarray(arr, 'RGBA')
