# 日本語のページから、英語のページ（/en/）を作る
#
#   python3 tools/i18n/build_en.py
#
# 訳は tools/i18n/en.json（日本語の文 → 英語の文）。日本語のページを書き換えたら、これを実行し直す。
# 訳が見つからない文があると一覧を出して止まるので、en.json に足してからもう一度実行する。
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
T = json.load(open(os.path.join(ROOT, 'tools', 'i18n', 'en.json')))

JP = re.compile(r'[぀-ヿ㐀-鿿「」『』（）、。]')
SKIP = {'google3630dc8da5c689b6.html', 'en.html', '404.html', 'offline.html'}
INLINE = r'(a|strong|b|em|code|br|small|mark|kbd)'
missing = {}


def tr_text(raw, page):
    key = re.sub(r'\s+', ' ', raw).strip()
    if not key or not JP.search(key):
        return raw
    if key in T:
        lead = raw[:len(raw) - len(raw.lstrip())]
        trail = raw[len(raw.rstrip()):]
        return lead + T[key] + trail
    missing.setdefault(key, set()).add(page)
    return raw


def tr_attr(m, page):
    name, val = m.group(1), m.group(2)
    if JP.search(val):
        if val.strip() in T:
            return f'{name}="{T[val.strip()]}"'
        missing.setdefault(val.strip(), set()).add(page)
    return m.group(0)


def fix_paths(html):
    """/en/ の下に置くので、画像・CSS・JS は / から始まる場所にする（ページへのリンクはそのまま）"""
    def rep(m):
        attr, val = m.group(1), m.group(2)
        if val == '' or re.match(r'^(https?:|mailto:|webcal:|#|/|data:|javascript:)', val):
            return m.group(0)
        if val.split('#')[0].split('?')[0].endswith('.html'):
            return m.group(0)
        return f'{attr}="/{val}"'
    return re.sub(r'\b(href|src)="([^"]*)"', rep, html)


def build(path):
    page = os.path.basename(path)
    ja_url = '/' if page == 'index.html' else '/' + page
    s = open(path).read()
    keep = []

    def stash(m):
        keep.append(m.group(0))
        return f'\x03{len(keep) - 1}\x03'
    s = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->', stash, s)
    # 言語の切り替え（日本語のページでは「英語へ」→ 英語のページでは「日本語へ」）
    s = re.sub(r'href="en/[^"]*" lang="en" hreflang="en">English</a>', 'href="@@LANG@@" lang="en" hreflang="en">English</a>', s)
    s = re.sub(r'<a class="lang-switch"[^>]*>EN</a>', '\x04LS\x04', s)
    s = re.sub(r'<a class="m-lang"[^>]*>(<i[^>]*></i>)English</a>', '\x04ML\x04', s)
    s = re.sub(r'\b(content|alt|title|placeholder|aria-label|label)="([^"]*)"', lambda m: tr_attr(m, page), s)
    parts = re.split(r'(<(?!/?' + INLINE + r'[\s>/])[^>]+>)', s)
    out = []
    for p in parts:
        if p is None:
            continue
        if p.startswith('<') and not re.match(r'</?' + INLINE + r'[\s>/]', p):
            out.append(p)
        else:
            out.append(tr_text(p, page))
    s = ''.join(out)
    s = re.sub(r'\x03(\d+)\x03', lambda m: keep[int(m.group(1))], s)
    s = s.replace('\x04LS\x04', f'<a class="lang-switch" href="{ja_url}" lang="ja" hreflang="ja" title="日本語">JA</a>')
    s = s.replace('\x04ML\x04', f'<a class="m-lang" href="{ja_url}" lang="ja" hreflang="ja"><i class="fa-solid fa-language" aria-hidden="true"></i>日本語</a>')
    s = s.replace('<html lang="ja">', '<html lang="en">')
    s = s.replace('@@LANG@@', ja_url)
    s = re.sub(r'href="en\.html"', 'href="index.html"', s)
    s = s.replace('href="/manifest.webmanifest"', 'href="/manifest-en.webmanifest"')
    s = fix_paths(s)
    s = s.replace('<meta property="og:type"', '<meta property="og:locale" content="en_US">\n<meta property="og:type"', 1)
    return s


def main():
    os.makedirs(os.path.join(ROOT, 'en'), exist_ok=True)
    pages = [p for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))) if os.path.basename(p) not in SKIP]
    built = {os.path.basename(p): build(p) for p in pages}
    if missing:
        print('訳が見つからない文があります。tools/i18n/en.json に足してください：')
        for k, v in missing.items():
            print(' -', json.dumps(k, ensure_ascii=False), '←', ', '.join(sorted(v)))
        sys.exit(1)
    for name, html in built.items():
        open(os.path.join(ROOT, 'en', name), 'w').write(html)
    print('英語のページを', len(built), 'ページ作りました')


if __name__ == '__main__':
    main()
