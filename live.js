/* =========================================================
   VIVA-MC 公式サイト ― サーバーのデータを使うページ
   ランキング・プレイヤー・サーバーの様子・国家図鑑・年表・マップ・トップページの「いまのVIVA-MC」

   データはすべて /api/get-*.js（サーバーの VivaStatsAPI へ中継）から取る。
   サーバーが止まっている・プラグインが準備中のときは、作り物の数字は出さずに
   「いまは取得できません」と表示する。
   ========================================================= */
(function () {
  'use strict';

  var PAGE = document.body.getAttribute('data-page') || '';
  // 英語のページ（/en/）では、ここで出す文言も英語にする
  var EN = document.documentElement.lang === 'en';
  function L(ja, en) { return EN ? en : ja; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------------------------------------------------------------- 共通の部品 */
  function $(s, r) { return (r || document).querySelector(s); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 9000);
    return fetch(path, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        clearTimeout(timer);
        if (r.status === 404) { var e = new Error('NOT_FOUND'); e.code = 404; throw e; }
        if (!r.ok) throw new Error('HTTP_' + r.status);
        return r.json();
      }, function (e) { clearTimeout(timer); throw e; });
  }

  var NF = window.Intl ? new Intl.NumberFormat(EN ? 'en-US' : 'ja-JP') : { format: String };
  function num(n) { return NF.format(Math.round(Number(n) || 0)); }
  function money(n) { return '$' + NF.format(Math.floor(Number(n) || 0)); }
  function hours(ms) { return NF.format(Math.floor((Number(ms) || 0) / 3600000)) + L('時間', ' h'); }
  function hm(ms) {
    var m = Math.floor((Number(ms) || 0) / 60000);
    return NF.format(Math.floor(m / 60)) + L('時間', 'h ') + (m % 60) + L('分', 'm');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function hmTime(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function rel(ms) {
    if (!ms) return '—';
    var min = Math.floor(Math.max(0, Date.now() - ms) / 60000);
    if (min < 1) return L('たった今', 'just now');
    if (min < 60) return min + L('分前', ' min ago');
    var h = Math.floor(min / 60);
    if (h < 24) return h + L('時間前', ' h ago');
    var d = Math.floor(h / 24);
    if (d < 31) return d + L('日前', ' days ago');
    return ymd(ms);
  }
  function days(ms) { return Math.floor((Date.now() - ms) / 86400000); }

  /* スキンの画像（mc-heads.net）。読めないときはサーバーのアイコンにする */
  function headImg(name, px, cls) {
    return '<img class="' + (cls || 'face') + '" src="https://mc-heads.net/avatar/' + encodeURIComponent(name) + '/' + (px * 2) +
      '" width="' + px + '" height="' + px + '" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'/server-icon.png\'">';
  }
  function bodyImg(name, px) {
    return '<img class="body-shot" src="https://mc-heads.net/body/' + encodeURIComponent(name) + '/' + px +
      '" alt="' + esc(name) + L('のスキン" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'/server-icon-512.png\';this.classList.add(\'fallback\')">', '\'s skin" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'/server-icon-512.png\';this.classList.add(\'fallback\')">');
  }
  function playerHref(name) { return 'player.html?name=' + encodeURIComponent(name); }
  function holderHref(name, kind) { return 'nation.html?n=' + encodeURIComponent(name) + (kind === 'land' ? '&k=land' : ''); }

  /* 国・土地の色。Landsで色が決まっていなければ、名前から古地図に合う色を選ぶ */
  var CREST_COLORS = ['#93301C', '#375663', '#3C6836', '#8A6820', '#5B3E6E', '#3F7268', '#7A4A24', '#4A5A8A', '#8E4A5E', '#56602A'];
  var KNOWN_COLORS = {};
  function remember(d) {
    if (!d) return d;
    (d.lands || []).concat(d.nations || []).forEach(function (h) { if (h.color) KNOWN_COLORS[h.name] = h.color; });
    return d;
  }
  function colorOf(name, color) {
    color = color || KNOWN_COLORS[name];
    if (color && /^#[0-9A-F]{6}$/i.test(color) && color.toUpperCase() !== '#000000' && color.toUpperCase() !== '#FFFFFF') return color;
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return CREST_COLORS[h % CREST_COLORS.length];
  }
  /* 紋章（盾の形に、頭文字） */
  function crest(name, color, size) {
    var c = colorOf(name || '?', color);
    var ch = Array.from ? Array.from(name || '?')[0] : (name || '?').charAt(0);
    var s = size || 56;
    return '<svg class="crest" width="' + s + '" height="' + Math.round(s * 1.15) + '" viewBox="0 0 100 115" aria-hidden="true">' +
      '<path d="M50 4 L94 16 V52 C94 82 74 101 50 111 C26 101 6 82 6 52 V16 Z" fill="' + c + '" stroke="#2F2010" stroke-width="4"/>' +
      '<path d="M50 13 L85 22.5 V52 C85 76 69 92 50 101 C31 92 15 76 15 52 V22.5 Z" fill="none" stroke="rgba(251,244,228,.55)" stroke-width="2.5"/>' +
      '<text x="50" y="66" text-anchor="middle" font-size="42" font-weight="700" fill="#FBF4E4" font-family="Shippori Mincho, serif">' + esc(ch) + '</text></svg>';
  }

  function emptyBox(target, msg, icon) {
    if (!target) return;
    target.innerHTML = '<div class="empty"><i class="fa-solid ' + (icon || 'fa-cloud-moon') + '" aria-hidden="true"></i><p>' + msg + '</p></div>';
  }
  var OFFLINE_MSG = L('いまはサーバーからデータを取得できません。<br>サーバーが止まっているか、準備中です。少し時間をおいて開き直してください。', 'We can\'t get data from the server right now.<br>The server may be down or still being set up. Please try again in a little while.');

  /* 年表の1件を文章にする */
  function holderLink(name, kind) {
    if (!name) return '';
    return '<a href="' + holderHref(name, kind) + '">' + esc(name) + '</a>';
  }
  var LAND_DELETE = { UPKEEP: '維持費が払えず', INACTIVITY: '長く放置されたため', WAR_CAPTURED: '戦争で占領され', ADMIN: '運営の判断で', NO_CLAIMS: '領土がなくなり', MEMBER_LEAVE: 'メンバーがいなくなり' };
  var EVENT_KIND = {
    war_declare: 'war', war_start: 'war', war_end: 'war',
    ally: 'diplo', ally_end: 'diplo', enemy: 'diplo', enemy_end: 'diplo',
    nation_create: 'found', nation_delete: 'found', nation_join: 'found', nation_leave: 'found',
    land_create: 'found', land_delete: 'found', rename: 'found'
  };
  var EVENT_ICON = {
    war_declare: 'fa-scroll', war_start: 'fa-khanda', war_end: 'fa-flag-checkered',
    ally: 'fa-handshake', ally_end: 'fa-handshake-slash', enemy: 'fa-bolt', enemy_end: 'fa-dove',
    nation_create: 'fa-crown', nation_delete: 'fa-landmark', nation_join: 'fa-right-to-bracket', nation_leave: 'fa-right-from-bracket',
    land_create: 'fa-house-flag', land_delete: 'fa-house-crack', rename: 'fa-pen-nib'
  };
  var LAND_DELETE_EN = { UPKEEP: ' after failing to pay upkeep', INACTIVITY: ' after being abandoned', WAR_CAPTURED: ' after being captured in war', ADMIN: ' by the team', NO_CLAIMS: ' after losing all its territory', MEMBER_LEAVE: ' after all its members left' };
  function eventTextEn(ev) {
    var A = holderLink(ev.a, ev.a_kind), B = holderLink(ev.b, ev.b_kind);
    switch (ev.type) {
      case 'war_declare': return A + ' declared war on ' + B;
      case 'war_start': return 'War broke out between ' + A + ' and ' + B;
      case 'war_end':
        if (ev.detail === 'DRAW') return 'The war between ' + A + ' and ' + B + ' ended in a draw';
        if (ev.detail === 'SURRENDERED') return B + ' surrendered and ' + A + ' won';
        if (ev.detail === 'ADMIN') return 'The war between ' + A + ' and ' + B + ' was ended by the team';
        return A + ' won the war against ' + B;
      case 'ally': return A + ' and ' + B + ' formed an alliance';
      case 'ally_end': return 'The alliance between ' + A + ' and ' + B + ' ended';
      case 'enemy': return A + ' declared ' + B + ' an enemy';
      case 'enemy_end': return A + ' is no longer hostile to ' + B;
      case 'nation_create': return 'The nation of ' + A + ' was founded' + (ev.b ? ' (capital: ' + B + ')' : '');
      case 'nation_delete': return 'The nation of ' + esc(ev.a) + ' was dissolved';
      case 'nation_join': return A + ' joined the nation of ' + B;
      case 'nation_leave': return A + ' left the nation of ' + B + (ev.detail === 'TAXES' ? ' (unpaid taxes)' : '');
      case 'land_create': return 'A new land, ' + A + ', was founded';
      case 'land_delete': return 'The land of ' + esc(ev.a) + ' disappeared' + (LAND_DELETE_EN[ev.detail] || '');
      case 'rename': return esc(ev.a) + ' was renamed to ' + holderLink(ev.b, ev.b_kind);
      default: return esc(ev.a) + ' ' + esc(ev.b);
    }
  }
  function eventText(ev) {
    if (EN) return eventTextEn(ev);
    var A = holderLink(ev.a, ev.a_kind), B = holderLink(ev.b, ev.b_kind);
    switch (ev.type) {
      case 'war_declare': return A + ' が ' + B + ' に宣戦布告しました';
      case 'war_start': return A + ' と ' + B + ' の戦争が始まりました';
      case 'war_end':
        if (ev.detail === 'DRAW') return A + ' と ' + B + ' の戦争は、引き分けに終わりました';
        if (ev.detail === 'SURRENDERED') return B + ' が降伏し、' + A + ' が勝利しました';
        if (ev.detail === 'ADMIN') return A + ' と ' + B + ' の戦争は、運営により終了しました';
        return A + ' が ' + B + ' との戦争に勝利しました';
      case 'ally': return A + ' と ' + B + ' が同盟を結びました';
      case 'ally_end': return A + ' と ' + B + ' の同盟が解消されました';
      case 'enemy': return A + ' が ' + B + ' を敵対に指定しました';
      case 'enemy_end': return A + ' が ' + B + ' への敵対を解きました';
      case 'nation_create': return '国 ' + A + ' が建国されました' + (ev.b ? '（首都 ' + B + '）' : '');
      case 'nation_delete': return '国 ' + esc(ev.a) + ' が解体されました';
      case 'nation_join': return A + ' が国 ' + B + ' に加わりました';
      case 'nation_leave': return A + ' が国 ' + B + ' から離れました' + (ev.detail === 'TAXES' ? '（税金の未払い）' : '');
      case 'land_create': return '新しい土地 ' + A + ' が生まれました';
      case 'land_delete': return '土地 ' + esc(ev.a) + ' は' + (LAND_DELETE[ev.detail] || '') + '消えました';
      case 'rename': return esc(ev.a) + ' が ' + holderLink(ev.b, ev.b_kind) + ' に名前を変えました';
      default: return esc(ev.a) + ' ' + esc(ev.b);
    }
  }
  function eventRow(ev, withDate) {
    return '<li class="ev ev-' + (EVENT_KIND[ev.type] || 'found') + '">' +
      '<span class="ev-ico"><i class="fa-solid ' + (EVENT_ICON[ev.type] || 'fa-feather') + '" aria-hidden="true"></i></span>' +
      '<span class="ev-body"><span class="ev-text">' + eventText(ev) + '</span>' +
      '<span class="ev-when dot">' + (withDate ? ymd(ev.time) + ' ' : '') + hmTime(ev.time) + '</span></span></li>';
  }

  /* いまの戦争 */
  function warCards(wars) {
    return wars.map(function (w) {
      var total = Math.max(1, (w.attacker_points || 0) + (w.defender_points || 0));
      var aPct = Math.round((w.attacker_points || 0) / total * 100);
      var left = w.time_left > 0 ? L('残り ', 'Time left: ') + hm(w.time_left > 1e11 ? w.time_left - Date.now() : w.time_left) : '';
      return '<div class="war-card">' +
        '<div class="war-side">' + crest(w.attacker, '', 40) + '<a href="' + holderHref(w.attacker, w.attacker_kind) + '">' + esc(w.attacker) + L('</a><span class="war-role">攻撃側</span></div>', '</a><span class="war-role">Attacker</span></div>') +
        '<div class="war-mid"><span class="tag ' + (w.state === 'FIGHT' ? 'brick' : 'honey') + '">' + (w.state === 'FIGHT' ? L('交戦中', 'Fighting') : L('準備期間', 'Preparing')) + '</span>' +
        '<span class="war-x" aria-hidden="true"><i class="fa-solid fa-khanda"></i></span>' +
        '<span class="war-score dot">' + num(w.attacker_points) + ' : ' + num(w.defender_points) + '</span>' +
        L('<span class="war-bar" role="img" aria-label="ポイント ', '<span class="war-bar" role="img" aria-label="Points ') + num(w.attacker_points) + L(' 対 ', ' to ') + num(w.defender_points) + '"><i style="width:' + aPct + '%"></i></span>' +
        (left ? '<span class="war-left">' + left + '</span>' : '') + '</div>' +
        '<div class="war-side">' + crest(w.defender, '', 40) + '<a href="' + holderHref(w.defender, w.defender_kind) + '">' + esc(w.defender) + L('</a><span class="war-role">防衛側</span></div>', '</a><span class="war-role">Defender</span></div>') +
        '</div>';
    }).join('');
  }

  /* 中身が後から入るリストにも、順番に出てくる動きをつける */
  function stagger(list) {
    if (!list) return;
    Array.prototype.forEach.call(list.children, function (c, i) { c.style.setProperty('--k', i); });
    list.classList.add('loaded');
  }

  /* ================================================================ ランキング */
  var RANK_TYPES = [
    { k: 'playtime', label: L('プレイ時間', 'Playtime'), icon: 'fa-hourglass-half', fmt: hours },
    { k: 'balance', label: L('所持金', 'Money'), icon: 'fa-coins', fmt: money },
    { k: 'blocks_placed', label: L('設置ブロック', 'Blocks placed'), icon: 'fa-cubes', fmt: function (v) { return num(v) + L('個', ''); } },
    { k: 'blocks_broken', label: L('破壊ブロック', 'Blocks broken'), icon: 'fa-hammer', fmt: function (v) { return num(v) + L('個', ''); } },
    { k: 'mob_kills', label: L('モブ討伐', 'Mob kills'), icon: 'fa-dragon', fmt: function (v) { return num(v) + L('体', ''); } },
    { k: 'player_kills', label: L('PvPキル', 'PvP kills'), icon: 'fa-khanda', fmt: function (v) { return num(v) + L('回', ''); } },
    { k: 'login_count', label: L('ログイン回数', 'Logins'), icon: 'fa-door-open', fmt: function (v) { return num(v) + L('回', ''); } },
    { k: 'votes_month', label: L('今月の投票', 'Votes this month'), icon: 'fa-check-to-slot', fmt: function (v) { return num(v) + L('票', ' votes'); } },
    { k: 'votes', label: L('投票（累計）', 'Votes (total)'), icon: 'fa-box-archive', fmt: function (v) { return num(v) + L('票', ' votes'); } }
  ];

  function initRanking() {
    var tabs = $('#rankTabs'), out = $('#rankOut');
    if (!tabs || !out) return;
    var cache = {};
    tabs.innerHTML = RANK_TYPES.map(function (t) {
      return '<button type="button" role="tab" data-k="' + t.k + '"><i class="fa-solid ' + t.icon + '" aria-hidden="true"></i>' + t.label + '</button>';
    }).join('');
    stagger(tabs);

    function show(k) {
      var t = RANK_TYPES.filter(function (x) { return x.k === k; })[0] || RANK_TYPES[0];
      Array.prototype.forEach.call(tabs.children, function (b) {
        b.setAttribute('aria-selected', b.getAttribute('data-k') === t.k ? 'true' : 'false');
      });
      if (history.replaceState) history.replaceState(null, '', '#' + t.k);
      out.classList.add('busy');
      (cache[t.k] || (cache[t.k] = api('/api/get-ranking?type=' + t.k + '&limit=30')))
        .then(function (d) {
          var list = (d.ranking || []).filter(function (r) { return r.value > 0; });
          if (!list.length) {
            emptyBox(out, t.k.indexOf('votes') === 0
              ? L('まだ投票の記録がありません。<br><a href="https://mineportal.jp/servers/cmp2fhkzu0000125xdvf15hjv" target="_blank" rel="noopener noreferrer">MinePortalで投票</a>すると、ここに名前が載ります。', 'No votes recorded yet.<br><a href="https://mineportal.jp/servers/cmp2fhkzu0000125xdvf15hjv" target="_blank" rel="noopener noreferrer">Vote on MinePortal</a> to get your name here.')
              : L('まだ記録がありません。', 'No records yet.'), t.k.indexOf('votes') === 0 ? 'fa-check-to-slot' : 'fa-feather');
            return;
          }
          render(list, t);
        })
        .catch(function () { delete cache[t.k]; emptyBox(out, OFFLINE_MSG); })
        .then(function () { out.classList.remove('busy'); });
    }

    function render(list, t) {
      var top = list.slice(0, 3), rest = list.slice(3), max = list[0].value || 1;
      var order = [1, 0, 2];  // 表彰台は 2位・1位・3位 の並び
      var podium = '<ol class="podium">' + order.map(function (i) {
        var r = top[i];
        if (!r) return '<li class="pod pod-' + (i + 1) + ' none" aria-hidden="true"></li>';
        return '<li class="pod pod-' + (i + 1) + '"><a href="' + playerHref(r.player) + '" class="plain">' +
          bodyImg(r.player, 180) +
          '<span class="pod-name">' + esc(r.player) + '</span>' +
          '<span class="pod-val dot">' + esc(t.fmt(r.value)) + '</span>' +
          '<span class="pod-step"><span class="pod-rank disp">' + (i + 1) + '</span></span></a></li>';
      }).join('') + '</ol>';
      var rows = rest.length ? '<ol class="rank-list" start="4">' + rest.map(function (r) {
        return '<li><span class="rk dot">' + r.rank + '</span>' + headImg(r.player, 30) +
          '<a href="' + playerHref(r.player) + '">' + esc(r.player) + '</a>' +
          '<span class="rbar" aria-hidden="true"><i style="width:' + Math.max(2, Math.round(r.value / max * 100)) + '%"></i></span>' +
          '<span class="rv dot">' + esc(t.fmt(r.value)) + '</span></li>';
      }).join('') + '</ol>' : '';
      out.innerHTML = podium + rows;
      stagger($('.rank-list', out));
    }

    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-k]');
      if (b) show(b.getAttribute('data-k'));
    });
    show((location.hash || '').slice(1));
  }

  /* ================================================================ プレイヤー */
  // 運営メンバー（名前は小文字で）
  var STAFF = { kot0328: 'admin' };
  function isAdmin(n) { return STAFF[String(n || '').toLowerCase()] === 'admin'; }
  var BADGES = [
    { id: 'admin', icon: 'fa-crown', label: L('管理者', 'Admin'), why: L('VIVA-MCの管理者', 'VIVA-MC server admin'), test: function (p) { return isAdmin(p.name); } },
    { id: 'new', icon: 'fa-seedling', label: L('新入り', 'Newcomer'), why: L('初参加から14日以内', 'First joined within the last 14 days'), test: function (p) { return p.first_join && days(p.first_join) <= 14; } },
    { id: 'old', icon: 'fa-scroll', label: L('古参', 'Veteran'), why: L('初参加から180日以上', 'First joined 180+ days ago'), test: function (p) { return p.first_join && days(p.first_join) >= 180; } },
    { id: 'regular', icon: 'fa-mug-hot', label: L('常連', 'Regular'), why: L('ログイン100回以上', '100+ logins'), test: function (p) { return p.login_count >= 100; } },
    { id: 'resident', icon: 'fa-hourglass-half', label: L('住人', 'Resident'), why: L('プレイ時間100時間以上', '100+ hours of playtime'), test: function (p) { return p.active_playtime >= 360000000; } },
    { id: 'builder', icon: 'fa-trowel-bricks', label: L('建築家', 'Architect'), why: L('ブロックを1万個以上設置', 'Placed 10,000+ blocks'), test: function (p) { return p.placed >= 10000; } },
    { id: 'miner', icon: 'fa-hammer', label: L('鉱夫', 'Miner'), why: L('ブロックを2万個以上破壊', 'Broke 20,000+ blocks'), test: function (p) { return p.broken >= 20000; } },
    { id: 'hunter', icon: 'fa-dragon', label: L('狩人', 'Hunter'), why: L('モブを1,000体以上討伐', 'Defeated 1,000+ mobs'), test: function (p) { return p.mob >= 1000; } },
    { id: 'warrior', icon: 'fa-khanda', label: L('武人', 'Warrior'), why: L('PvPで50回以上勝利', 'Won 50+ PvP fights'), test: function (p) { return p.pk >= 50; } },
    { id: 'rich', icon: 'fa-coins', label: L('大富豪', 'Tycoon'), why: L('所持金 $1,000,000 以上', '$1,000,000+ in money'), test: function (p) { return p.balance >= 1000000; } },
    { id: 'citizen', icon: 'fa-flag', label: L('国民', 'Citizen'), why: L('国に属する土地のメンバー', 'Member of a land that belongs to a nation'), test: function (p) { return !!p.nation; } },
    { id: 'supporter', icon: 'fa-check-to-slot', label: L('応援団', 'Supporter'), why: L('サーバーに30回以上投票', 'Voted for the server 30+ times'), test: function (p) { return p.votes >= 30; } }
  ];

  function initPlayer() {
    var form = $('#pForm'), input = $('#pName'), out = $('#pOut'), list = $('#pSuggest');
    if (!form || !out) return;
    var name = (new URLSearchParams(location.search).get('name') || '').trim().slice(0, 32);
    input.value = name;

    // 入力しながら候補を出す
    var t = null;
    input.addEventListener('input', function () {
      clearTimeout(t);
      var q = input.value.trim();
      if (q.length < 2) return;
      t = setTimeout(function () {
        api('/api/get-players?limit=8&query=' + encodeURIComponent(q), 5000).then(function (d) {
          list.innerHTML = (d.players || []).map(function (p) { return '<option value="' + esc(p.player) + '">'; }).join('');
        }).catch(function () {});
      }, 300);
    });

    if (!name) { showRecent(); return; }
    document.title = name + L(' | プレイヤー | VIVA-MC', ' | Players | VIVA-MC');
    out.innerHTML = L('<p class="muted">読み込み中...</p>', '<p class="muted">Loading...</p>');

    var rankP = ['playtime', 'balance', 'blocks_placed'].map(function (k) {
      return api('/api/get-ranking?type=' + k + '&limit=100').then(function (d) {
        var hit = (d.ranking || []).filter(function (r) { return r.player.toLowerCase() === name.toLowerCase() && r.value > 0; })[0];
        return hit ? hit.rank : 0;
      }).catch(function () { return 0; });
    });
    var landsP = api('/api/get-lands').then(remember).catch(function () { return null; });

    api('/api/get-stats?player=' + encodeURIComponent(name))
      .then(function (d) {
        return Promise.all([landsP].concat(rankP)).then(function (r) { render(d, r[0], r.slice(1)); });
      })
      .catch(function (e) {
        if (e && e.code === 404) {
          emptyBox(out, L('「', '"') + esc(name) + L('」の記録は見つかりませんでした。<br>名前のつづり（大文字・小文字も）を確かめてください。統合版の人は、名前の前に記号が付くことがあります。', '" wasn\'t found.<br>Check the spelling (including upper/lower case). Bedrock players may have a symbol in front of their name.'), 'fa-magnifying-glass');
        } else emptyBox(out, OFFLINE_MSG);
      });

    function render(d, lands, ranks) {
      var kd = d.kill_data || {};
      var stats = d.stats || [];
      var bal = 0, town = '';
      stats.forEach(function (s) {
        if (s.name === 'balance') bal = Number(s.value) || 0;
        if (s.tableName === 'lands') town = s.value || '';
      });
      var p = {
        name: d.player || name, first_join: d.first_join, last_seen: d.last_seen, login_count: d.login_count || 0,
        active_playtime: d.active_playtime || 0, placed: kd.blocks_placed_total || 0, broken: kd.blocks_broken_total || 0,
        mob: kd.mob_kills_total || 0, pk: kd.player_kills_total || 0, deaths: kd.deaths_total || 0, balance: bal, votes: d.votes_total || 0
      };
      // 所属する土地と国（国家図鑑のメンバー一覧から探す）
      var myLands = [];
      if (lands && lands.lands) {
        lands.lands.forEach(function (l) {
          if ((l.member_names || []).some(function (m) { return m.toLowerCase() === p.name.toLowerCase(); })) myLands.push(l);
        });
      }
      if (!myLands.length && town && lands && lands.lands) {
        myLands = lands.lands.filter(function (l) { return l.name === town; });
      }
      p.nation = (myLands.filter(function (l) { return l.nation; })[0] || {}).nation || '';

      var badges = BADGES.filter(function (b) { return b.test(p); });
      var kdr = p.deaths ? (p.pk / p.deaths).toFixed(2) : (p.pk ? '∞' : '—');
      var rk = function (i) { return ranks[i] ? '<span class="rank-pill dot">#' + ranks[i] + '</span>' : ''; };

      var aff = '';
      if (p.nation) aff += '<a class="aff" href="' + holderHref(p.nation, 'nation') + '">' + crest(p.nation, '', 22) + '国 ' + esc(p.nation) + '</a>';
      myLands.slice(0, 4).forEach(function (l) {
        aff += '<a class="aff" href="' + holderHref(l.name, 'land') + '">' + crest(l.name, l.color, 22) + esc(l.name) + '</a>';
      });
      if (!aff && town) aff = '<span class="aff">' + esc(town) + '</span>';
      if (!aff) aff = L('<span class="aff muted-aff">どの土地にも属していません</span>', '<span class="aff muted-aff">Not a member of any land</span>');

      out.innerHTML =
        '<div class="profile">' +
          '<div class="portrait">' + bodyImg(p.name, 260) + '<span class="portrait-cap dot">' + (isAdmin(p.name) ? 'VIVA-MC ADMIN' : 'VIVA-MC CITIZEN') + '</span></div>' +
          '<div class="pinfo">' +
            '<h2 class="pname disp">' + headImg(p.name, 34) + esc(p.name) + '</h2>' +
            L('<p class="pmeta">初参加 <b class="dot">', '<p class="pmeta">First joined <b class="dot">') + ymd(p.first_join) + L('</b>　・　最後に見かけたのは <b>', '</b> · Last seen <b>') + rel(p.last_seen) + '</b></p>' +
            '<div class="affs">' + aff + '</div>' +
            '<ul class="badges">' + (badges.length ? badges.map(function (b) {
              return '<li class="badge b-' + b.id + '" title="' + esc(b.why) + '"><i class="fa-solid ' + b.icon + '" aria-hidden="true"></i>' + b.label + L('<span class="sr-only">（', '<span class="sr-only">(') + b.why + L('）</span></li>', ')</span></li>');
            }).join('') : L('<li class="badge none">称号はまだありません</li>', '<li class="badge none">No titles yet</li>')) + '</ul>' +
            '<dl class="pstats">' +
              L('<div><dt>プレイ時間', '<div><dt>Playtime') + rk(0) + '</dt><dd class="dot">' + hm(p.active_playtime) + '</dd></div>' +
              L('<div><dt>所持金', '<div><dt>Money') + rk(1) + '</dt><dd class="dot">' + money(p.balance) + '</dd></div>' +
              L('<div><dt>ログイン</dt><dd class="dot">', '<div><dt>Logins</dt><dd class="dot">') + num(p.login_count) + L('回</dd></div>', '</dd></div>') +
              L('<div><dt>設置ブロック', '<div><dt>Blocks placed') + rk(2) + '</dt><dd class="dot">' + num(p.placed) + '</dd></div>' +
              L('<div><dt>破壊ブロック</dt><dd class="dot">', '<div><dt>Blocks broken</dt><dd class="dot">') + num(p.broken) + '</dd></div>' +
              L('<div><dt>モブ討伐</dt><dd class="dot">', '<div><dt>Mob kills</dt><dd class="dot">') + num(p.mob) + '</dd></div>' +
              L('<div><dt>PvPキル</dt><dd class="dot">', '<div><dt>PvP kills</dt><dd class="dot">') + num(p.pk) + '</dd></div>' +
              L('<div><dt>デス</dt><dd class="dot">', '<div><dt>Deaths</dt><dd class="dot">') + num(p.deaths) + '</dd></div>' +
              '<div><dt>K/D</dt><dd class="dot">' + kdr + '</dd></div>' +
              L('<div><dt>今月の投票</dt><dd class="dot">', '<div><dt>Votes this month</dt><dd class="dot">') + num(d.votes_month || 0) + L('票</dd></div>', '</dd></div>') +
              L('<div><dt>投票（累計）</dt><dd class="dot">', '<div><dt>Votes (total)</dt><dd class="dot">') + num(d.votes_total || 0) + L('票</dd></div>', '</dd></div>') +
              L('<div><dt>初参加から</dt><dd class="dot">', '<div><dt>Days since joining</dt><dd class="dot">') + (p.first_join ? num(days(p.first_join)) + L('日', '') : '—') + '</dd></div>' +
            '</dl>' +
          '</div>' +
        '</div>' +
        L('<details class="badge-help"><summary>称号の条件を見る</summary><ul>', '<details class="badge-help"><summary>How titles are earned</summary><ul>') + BADGES.map(function (b) {
          return '<li><i class="fa-solid ' + b.icon + '" aria-hidden="true"></i><b>' + b.label + L('</b>… ', '</b> — ') + b.why + '</li>';
        }).join('') + '</ul></details>';
    }

    // 名前が無いときは、最近来た人を並べる
    function showRecent() {
      api('/api/get-history').then(function (d) {
        var seen = {}, names = [];
        (d.events || []).forEach(function (ev) { if (!seen[ev.player]) { seen[ev.player] = 1; names.push(ev.player); } });
        if (!names.length) { out.innerHTML = ''; return; }
        out.innerHTML = L('<h2 class="sec disp">最近あそびに来た人</h2><ul class="faces big">', '<h2 class="sec disp">Recently played</h2><ul class="faces big">') + names.slice(0, 24).map(function (n) {
          return '<li><a href="' + playerHref(n) + '" class="plain">' + headImg(n, 48) + '<span>' + esc(n) + '</span></a></li>';
        }).join('') + '</ul>';
        stagger($('.faces', out));
      }).catch(function () { out.innerHTML = ''; });
    }
  }

  /* ================================================================ サーバーの様子 */
  var SERVER = 'viva-mc.net';
  function mcstatus(edition) {
    var url = edition === 'java'
      ? 'https://api.mcstatus.io/v2/status/java/' + SERVER
      : 'https://api.mcstatus.io/v2/status/bedrock/' + SERVER + ':19132';
    return api(url, 8000).catch(function () { return null; });
  }

  function initStatus() {
    var box = $('#srvBoxes');
    if (box) {
      Promise.all([mcstatus('java'), mcstatus('bedrock')]).then(function (r) {
        var j = r[0], b = r[1];
        var card = function (label, icon, d, port) {
          var on = d && d.online;
          var ver = d && d.version ? (d.version.name_clean || d.version.name || '') : '';
          var motd = d && d.motd ? (d.motd.clean || '').replace(/\s+/g, ' ').trim() : '';
          return '<div class="srv ' + (on ? 'on' : 'off') + '">' +
            '<div class="srv-top"><i class="fa-solid ' + icon + '" aria-hidden="true"></i><span>' + label + '</span>' +
            '<span class="srv-state"><span class="dot-live' + (on ? ' on' : '') + '"></span>' + (d ? (on ? L('オンライン', 'Online') : L('オフライン', 'Offline')) : L('確認できません', 'Unknown')) + '</span></div>' +
            '<div class="srv-n dot">' + (on && d.players ? num(d.players.online) + '<small> / ' + num(d.players.max) + L('人</small>', '</small>') : '—') + '</div>' +
            '<div class="srv-sub">' + esc(SERVER) + '：' + port + (ver ? L('　・　', ' · ') + esc(ver) : '') + '</div>' +
            (motd ? '<div class="srv-motd">' + esc(motd) + '</div>' : '') + '</div>';
        };
        box.innerHTML = card(L('Java版', 'Java Edition'), 'fa-desktop', j, 25565) + card(L('統合版（Bedrock）', 'Bedrock Edition'), 'fa-mobile-screen', b, 19132);
        stagger(box);
      });
    }

    var faces = $('#onlineFaces'), chart = $('#onlineChart');
    api('/api/get-online').then(function (d) {
      if (faces) {
        var names = d.players || [];
        $('#onlineCount') && ($('#onlineCount').textContent = num(names.length) + L('人', ''));
        faces.innerHTML = names.length ? '<ul class="faces big">' + names.map(function (n) {
          return '<li><a href="' + playerHref(n) + '" class="plain">' + headImg(n, 48) + '<span>' + esc(n) + '</span></a></li>';
        }).join('') + '</ul>' : L('<p class="muted">いまメインサーバーにいる人はいません。</p>', '<p class="muted">Nobody is on the main server right now.</p>');
        stagger($('.faces', faces));
      }
      if (chart) drawOnline(chart, d.samples || [], d.peak, d.peak_at);
    }).catch(function () {
      emptyBox(faces, OFFLINE_MSG);
      if (chart) emptyBox(chart, L('グラフのデータを取得できませんでした。', 'Couldn\'t get the graph data.'));
    });

    var hist = $('#statusHistory');
    if (hist) {
      api('/api/get-history').then(function (d) {
        var ev = d.events || [];
        if (!ev.length) { hist.innerHTML = L('<p class="muted">まだ記録がありません。</p>', '<p class="muted">No records yet.</p>'); return; }
        hist.innerHTML = '<ul>' + ev.map(function (e) {
          return '<li class="' + (e.type === 'join' ? 'on' : '') + '"><a class="who" href="' + playerHref(e.player) + '">' + esc(e.player) + '</a>' +
            '<span class="at">' + (e.type === 'join' ? L(' が参加 · ', ' joined · ') : L(' が退出 · ', ' left · ')) + rel(e.time) + '</span></li>';
        }).join('') + '</ul>';
      }).catch(function () { hist.innerHTML = L('<p class="muted">接続履歴を取得できませんでした。</p>', '<p class="muted">Couldn\'t get the join log.</p>'); });
    }
  }

  /* 直近7日の人数（1本の面グラフ。ホバーで時刻と人数） */
  function drawOnline(box, samples, peak, peakAt) {
    if (samples.length < 2) {
      emptyBox(box, L('グラフはまだ準備中です。記録が貯まると、ここに直近7日の人数が出ます。', 'The graph isn\'t ready yet. Once enough data is recorded, player counts for the last 7 days will show here.'), 'fa-chart-area');
      return;
    }
    var W = 760, H = 240, L = 34, R = 12, T = 14, B = 30;
    var now = Date.now(), t0 = now - 7 * 86400000;
    var maxN = 0;
    samples.forEach(function (s) { if (s[1] > maxN) maxN = s[1]; });
    var step = maxN <= 5 ? 1 : maxN <= 10 ? 2 : maxN <= 25 ? 5 : maxN <= 50 ? 10 : 20;
    var top = Math.max(step * 2, Math.ceil(maxN / step) * step);
    var x = function (t) { return L + (t - t0) / (now - t0) * (W - L - R); };
    var y = function (n) { return T + (1 - n / top) * (H - T - B); };

    // 記録の間が30分以上あいたら（サーバー停止など）線を切る
    var segs = [], cur = [];
    samples.forEach(function (s, i) {
      if (s[0] < t0) return;
      if (cur.length && s[0] - samples[i - 1][0] > 30 * 60000) { segs.push(cur); cur = []; }
      cur.push(s);
    });
    if (cur.length) segs.push(cur);

    var grid = '', labels = '';
    for (var v = 0; v <= top; v += step) {
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g' + (v === 0 ? ' base' : '') + '"/>';
      labels += '<text x="' + (L - 7) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    }
    var d0 = new Date(t0); d0.setHours(24, 0, 0, 0);
    for (var t = d0.getTime(); t < now; t += 86400000) {
      var dd = new Date(t);
      grid += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + T + '" y2="' + (H - B) + '" class="g v"/>';
      labels += '<text x="' + x(t) + '" y="' + (H - 9) + '" text-anchor="middle">' + (dd.getMonth() + 1) + '/' + dd.getDate() + '</text>';
    }
    var area = '', line = '';
    segs.forEach(function (sg) {
      var pts = sg.map(function (s) { return x(s[0]).toFixed(1) + ',' + y(s[1]).toFixed(1); });
      line += '<polyline points="' + pts.join(' ') + '" class="ln"/>';
      area += '<polygon points="' + x(sg[0][0]).toFixed(1) + ',' + y(0) + ' ' + pts.join(' ') + ' ' + x(sg[sg.length - 1][0]).toFixed(1) + ',' + y(0) + '" class="ar"/>';
    });

    box.innerHTML = '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + L('" class="ochart" role="img" aria-label="直近7日の接続人数のグラフ">', '" class="ochart" role="img" aria-label="Graph of players online over the last 7 days">') +
      grid + area + line + labels +
      '<line class="xh off" y1="' + T + '" y2="' + (H - B) + '" x1="0" x2="0"/><circle class="xd off" r="4.5" cx="0" cy="0"/>' +
      '<rect class="hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + L('" tabindex="0" aria-label="グラフを左右の矢印キーでたどれます"/></svg>', '" tabindex="0" aria-label="Use the left and right arrow keys to move through the graph"/></svg>') +
      '<div class="tip" hidden></div></div>' +
      L('<p class="chart-note">最高記録 <b class="dot">', '<p class="chart-note">Record: <b class="dot">') + num(peak || maxN) + L('人</b>', ' players</b>') + (peakAt ? L('（', ' (') + ymd(peakAt) + ' ' + hmTime(peakAt) + '）' : '') +
      L('　・　メインサーバーの人数を5分ごとに記録しています</p>', ' · Main server players, recorded every 5 minutes</p>') +
      L('<details class="chart-table"><summary>表で見る（日ごとの最大人数）</summary><table class="spec"><tbody>', '<details class="chart-table"><summary>Show as a table (daily peak)</summary><table class="spec"><tbody>') + dailyRows(samples, t0) + '</tbody></table></details>';

    var svg = $('svg', box), tip = $('.tip', box), xh = $('.xh', box), xd = $('.xd', box), hit = $('.hit', box);
    var pts = samples.filter(function (s) { return s[0] >= t0; });
    var idx = pts.length - 1;
    function at(i) {
      idx = Math.max(0, Math.min(pts.length - 1, i));
      var s = pts[idx], px = x(s[0]), py = y(s[1]);
      xh.classList.remove('off'); xd.classList.remove('off');
      xh.setAttribute('x1', px); xh.setAttribute('x2', px);
      xd.setAttribute('cx', px); xd.setAttribute('cy', py);
      var d = new Date(s[0]);
      tip.textContent = '';
      var b = document.createElement('b'); b.textContent = num(s[1]) + L('人', '');
      var sp = document.createElement('span'); sp.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hmTime(s[0]);
      tip.appendChild(b); tip.appendChild(sp);
      tip.hidden = false;
      var r = svg.getBoundingClientRect(), k = r.width / W;
      var left = px * k, w = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r.width - w, left - w / 2)) + 'px';
      tip.style.top = Math.max(0, py * k - 54) + 'px';
    }
    function nearest(clientX) {
      var r = svg.getBoundingClientRect();
      var t = t0 + ((clientX - r.left) / r.width * W - L) / (W - L - R) * (now - t0);
      var best = 0, bd = Infinity;
      pts.forEach(function (s, i) { var dd = Math.abs(s[0] - t); if (dd < bd) { bd = dd; best = i; } });
      return best;
    }
    function hide() { tip.hidden = true; xh.classList.add('off'); xd.classList.add('off'); }
    hit.addEventListener('pointermove', function (e) { at(nearest(e.clientX)); });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', function () { at(idx); });
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { at(idx - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { at(idx + 1); e.preventDefault(); }
    });
  }
  function dailyRows(samples, t0) {
    var byDay = {};
    samples.forEach(function (s) {
      if (s[0] < t0) return;
      var k = ymd(s[0]);
      byDay[k] = Math.max(byDay[k] || 0, s[1]);
    });
    return Object.keys(byDay).sort().reverse().map(function (k) {
      return '<tr><th class="dot">' + k + '</th><td class="dot">' + num(byDay[k]) + L('人</td></tr>', '</td></tr>');
    }).join('');
  }

  /* ================================================================ 国家図鑑 */
  function initNations() {
    var out = $('#natOut');
    if (!out) return;
    api('/api/get-lands').then(remember).then(function (d) {
      if (!d.available) { emptyBox(out, L('国家図鑑は準備中です。サーバーとの連携が整うと、ここに国と土地が並びます。', 'The nation directory isn\'t ready yet. Nations and lands will appear here once the server is connected.'), 'fa-flag'); return; }
      var nations = d.nations || [], lands = d.lands || [], wars = d.wars || [];
      var chunks = lands.reduce(function (a, l) { return a + (l.chunks || 0); }, 0);
      $('#natFacts').innerHTML =
        '<div><dt>' + nations.length + L('</dt><dd>国</dd></div>', '</dt><dd>Nations</dd></div>') +
        '<div><dt>' + lands.length + L('</dt><dd>土地</dd></div>', '</dt><dd>Lands</dd></div>') +
        '<div><dt>' + num(chunks) + L('</dt><dd>領土のチャンク</dd></div>', '</dt><dd>Claimed chunks</dd></div>') +
        '<div><dt>' + wars.length + L('</dt><dd>いまの戦争</dd></div>', '</dt><dd>Active wars</dd></div>');
      $('#natFacts').hidden = false;

      var warBox = $('#natWars');
      if (warBox) {
        warBox.innerHTML = wars.length ? L('<h2 class="sec disp">いま起きている戦争</h2><div class="wars">', '<h2 class="sec disp">Wars in progress</h2><div class="wars">') + warCards(wars) + '</div>' : '';
      }

      var q = $('#natQ'), sort = $('#natSort');
      function card(n, kind) {
        var sub = kind === 'nation'
          ? L('首都 ', 'Capital: ') + esc(n.capital || '—') + L('　・　土地 ', ' · Lands: ') + (n.lands || []).length
          : (n.owner ? L('持ち主 ', 'Owner: ') + esc(n.owner) : '');
        return '<li><a class="ncard plain" href="' + holderHref(n.name, kind) + '" style="--c:' + colorOf(n.name, n.color) + '">' +
          crest(n.name, n.color, 52) +
          '<span class="nbody"><span class="nname">' + esc(n.name) + (n.in_war ? L(' <span class="tag brick">戦争中</span>', ' <span class="tag brick">At war</span>') : '') + '</span>' +
          '<span class="nsub">' + sub + '</span>' +
          L('<span class="nnums dot"><span title="メンバー"><i class="fa-solid fa-user-group" aria-hidden="true"></i>', '<span class="nnums dot"><span title="Members"><i class="fa-solid fa-user-group" aria-hidden="true"></i>') + num(n.members) + '</span>' +
          L('<span title="チャンク"><i class="fa-solid fa-map" aria-hidden="true"></i>', '<span title="Chunks"><i class="fa-solid fa-map" aria-hidden="true"></i>') + num(n.chunks) + '</span>' +
          L('<span title="銀行"><i class="fa-solid fa-coins" aria-hidden="true"></i>', '<span title="Bank"><i class="fa-solid fa-coins" aria-hidden="true"></i>') + money(n.balance) + '</span>' +
          (n.allies && n.allies.length ? L('<span title="同盟"><i class="fa-solid fa-handshake" aria-hidden="true"></i>', '<span title="Allies"><i class="fa-solid fa-handshake" aria-hidden="true"></i>') + n.allies.length + '</span>' : '') +
          '</span></span></a></li>';
      }
      function sorter(a, b) {
        var k = sort ? sort.value : 'chunks';
        if (k === 'name') return a.name.localeCompare(b.name, 'ja');
        if (k === 'created') return (b.created || 0) - (a.created || 0);
        return (b[k] || 0) - (a[k] || 0);
      }
      function render() {
        var word = (q && q.value || '').trim().toLowerCase();
        var hitN = nations.filter(function (n) { return !word || n.name.toLowerCase().indexOf(word) >= 0 || (n.lands || []).join(' ').toLowerCase().indexOf(word) >= 0; }).sort(sorter);
        var free = lands.filter(function (l) { return !l.nation && (!word || l.name.toLowerCase().indexOf(word) >= 0 || (l.owner || '').toLowerCase().indexOf(word) >= 0); }).sort(sorter);
        out.innerHTML =
          L('<h2 class="sec disp">国 <span class="count dot">', '<h2 class="sec disp">Nations <span class="count dot">') + hitN.length + '</span></h2>' +
          (hitN.length ? '<ul class="ncards">' + hitN.map(function (n) { return card(n, 'nation'); }).join('') + '</ul>' : '<p class="muted">' + (word ? L('見つかりませんでした。', 'Nothing found.') : L('まだ国はありません。最初の国をつくるのはあなたかもしれません。', 'No nations yet. Maybe you\'ll found the first one.')) + '</p>') +
          L('<h2 class="sec disp">国に属さない土地 <span class="count dot">', '<h2 class="sec disp">Independent lands <span class="count dot">') + free.length + '</span></h2>' +
          (free.length ? '<ul class="ncards small">' + free.map(function (n) { return card(n, 'land'); }).join('') + '</ul>' : L('<p class="muted">ありません。</p>', '<p class="muted">None.</p>'));
        Array.prototype.forEach.call(out.querySelectorAll('.ncards'), stagger);
      }
      if (q) q.addEventListener('input', render);
      if (sort) sort.addEventListener('change', render);
      $('#natTools').hidden = false;
      render();
    }).catch(function () { emptyBox(out, OFFLINE_MSG); });
  }

  function initNation() {
    var out = $('#natOne');
    if (!out) return;
    var qs = new URLSearchParams(location.search);
    var name = (qs.get('n') || '').trim(), kind = qs.get('k') === 'land' ? 'land' : 'nation';
    if (!name) { location.replace('nations.html'); return; }
    document.title = name + L(' | 国家図鑑 | VIVA-MC', ' | Nations | VIVA-MC');
    $('#natTitle').textContent = name;
    $('#natKind').textContent = kind === 'nation' ? L('NATION ・ 国', 'NATION') : L('LAND ・ 土地', 'LAND');

    Promise.all([api('/api/get-lands').then(remember), api('/api/get-events?limit=300').catch(function () { return { events: [] }; })])
      .then(function (r) {
        var d = r[0], events = r[1].events || [];
        var pool = kind === 'nation' ? (d.nations || []) : (d.lands || []);
        var h = pool.filter(function (x) { return x.name === name; })[0];
        if (!h) {
          var other = (kind === 'nation' ? d.lands : d.nations) || [];
          if (other.some(function (x) { return x.name === name; })) {
            location.replace(holderHref(name, kind === 'nation' ? 'land' : 'nation'));
            return;
          }
          emptyBox(out, L('「', '"') + esc(name) + L('」は見つかりませんでした。名前が変わったか、解体された可能性があります。<br><a href="nations.html">国家図鑑に戻る</a>', '" wasn\'t found. It may have been renamed or dissolved.<br><a href="nations.html">Back to the nation directory</a>'), 'fa-map');
          return;
        }
        $('#natCrest').innerHTML = crest(h.name, h.color, 64);

        var members = (h.member_names || []).slice();
        var landRows = '';
        if (kind === 'nation') {
          var mine = (d.lands || []).filter(function (l) { return l.nation === h.name; });
          mine.forEach(function (l) { (l.member_names || []).forEach(function (m) { if (members.indexOf(m) < 0) members.push(m); }); });
          landRows = L('<section><h2 class="sec disp">この国の土地 <span class="count dot">', '<section><h2 class="sec disp">Lands in this nation <span class="count dot">') + mine.length + '</span></h2><ul class="ncards small">' +
            mine.map(function (l) {
              return '<li><a class="ncard plain" href="' + holderHref(l.name, 'land') + '" style="--c:' + colorOf(l.name, l.color) + '">' + crest(l.name, l.color, 40) +
                '<span class="nbody"><span class="nname">' + esc(l.name) + (l.name === h.capital ? L(' <span class="tag honey">首都</span>', ' <span class="tag honey">Capital</span>') : '') + '</span>' +
                '<span class="nnums dot"><span><i class="fa-solid fa-user-group" aria-hidden="true"></i>' + num(l.members) + '</span><span><i class="fa-solid fa-map" aria-hidden="true"></i>' + num(l.chunks) + '</span></span></span></a></li>';
            }).join('') + '</ul></section>';
        }
        var ws = h.war_stats || {};
        var rel = function (arr, cls) {
          if (!arr || !arr.length) return L('<p class="muted left">なし</p>', '<p class="muted left">None</p>');
          return '<ul class="rel-chips">' + arr.map(function (n) {
            var isNation = (d.nations || []).some(function (x) { return x.name === n; });
            return '<li class="' + cls + '"><a class="plain" href="' + holderHref(n, isNation ? 'nation' : 'land') + '">' + crest(n, '', 20) + esc(n) + '</a></li>';
          }).join('') + '</ul>';
        };
        var mine2 = events.filter(function (e) { return e.a === h.name || e.b === h.name; });
        var war = (d.wars || []).filter(function (w) { return w.attacker === h.name || w.defender === h.name; });

        out.innerHTML =
          '<dl class="facts nat-facts">' +
            '<div><dt>' + num(h.members) + L('</dt><dd>メンバー</dd></div>', '</dt><dd>Members</dd></div>') +
            '<div><dt>' + num(h.chunks) + L('</dt><dd>チャンク</dd></div>', '</dt><dd>Chunks</dd></div>') +
            '<div><dt>' + money(h.balance) + L('</dt><dd>銀行</dd></div>', '</dt><dd>Bank</dd></div>') +
            '<div><dt>' + num(ws.won || 0) + L('<small>勝</small> ', '<small>W</small> ') + num(ws.lost || 0) + L('<small>敗</small></dt><dd>戦績</dd></div>', '<small>L</small></dt><dd>War record</dd></div>') +
          '</dl>' +
          '<table class="spec nat-spec"><tbody>' +
            (kind === 'nation' ? L('<tr><th>首都</th><td>', '<tr><th>Capital</th><td>') + (h.capital ? holderLink(h.capital, 'land') : '—') + '</td></tr>' : '') +
            (kind === 'land' ? L('<tr><th>所属する国</th><td>', '<tr><th>Nation</th><td>') + (h.nation ? holderLink(h.nation, 'nation') : L('なし（独立）', 'None (independent)')) + '</td></tr>' : '') +
            '<tr><th>' + (kind === 'nation' ? L('代表', 'Leader') : L('持ち主', 'Owner')) + '</th><td>' + ((h.leader || h.owner) ? '<a href="' + playerHref(h.leader || h.owner) + '">' + esc(h.leader || h.owner) + '</a>' : '—') + '</td></tr>' +
            L('<tr><th>できた日</th><td class="dot">', '<tr><th>Founded</th><td class="dot">') + ymd(h.created) + '</td></tr>' +
            (h.level ? L('<tr><th>レベル</th><td>', '<tr><th>Level</th><td>') + esc(h.level) + '</td></tr>' : '') +
            L('<tr><th>戦争での記録</th><td class="dot">キル ', '<tr><th>In war</th><td class="dot">Kills ') + num(ws.kills || 0) + L('　・　デス ', ' · Deaths ') + num(ws.deaths || 0) + L('　・　旗の占領 ', ' · Flags captured ') + num(ws.captures || 0) + '</td></tr>' +
          '</tbody></table>' +
          (war.length ? L('<section><h2 class="sec disp">いまの戦争</h2><div class="wars">', '<section><h2 class="sec disp">Current war</h2><div class="wars">') + warCards(war) + '</div></section>' : '') +
          landRows +
          L('<section><h2 class="sec disp">外交</h2><div class="rel-cols"><div><h3><i class="fa-solid fa-handshake" aria-hidden="true"></i>同盟</h3>', '<section><h2 class="sec disp">Diplomacy</h2><div class="rel-cols"><div><h3><i class="fa-solid fa-handshake" aria-hidden="true"></i>Allies</h3>') + rel(h.allies, 'ally') + '</div>' +
          L('<div><h3><i class="fa-solid fa-bolt" aria-hidden="true"></i>敵対</h3>', '<div><h3><i class="fa-solid fa-bolt" aria-hidden="true"></i>Enemies</h3>') + rel(h.enemies, 'enemy') + '</div></div></section>' +
          L('<section><h2 class="sec disp">メンバー <span class="count dot">', '<section><h2 class="sec disp">Members <span class="count dot">') + members.length + '</span></h2>' +
            (members.length ? '<ul class="faces">' + members.map(function (m) {
              return '<li><a href="' + playerHref(m) + '" class="plain">' + headImg(m, 40) + '<span>' + esc(m) + '</span></a></li>';
            }).join('') + '</ul>' : '<p class="muted left">—</p>') + '</section>' +
          L('<section><h2 class="sec disp">年表</h2>', '<section><h2 class="sec disp">Chronicle</h2>') +
            (mine2.length ? '<ul class="chron">' + mine2.slice(0, 40).map(function (e) { return eventRow(e, true); }).join('') + '</ul>' : L('<p class="muted left">まだ記録がありません。</p>', '<p class="muted left">No records yet.</p>')) + '</section>';
        Array.prototype.forEach.call(out.querySelectorAll('.faces, .ncards, .chron'), stagger);
      })
      .catch(function () { emptyBox(out, OFFLINE_MSG); });
  }

  /* ================================================================ 年表 */
  function initChronicle() {
    var out = $('#chronOut'), chips = $('#chronFilter');
    if (!out) return;
    var all = [], filter = 'all';
    function render() {
      var list = all.filter(function (e) { return filter === 'all' || EVENT_KIND[e.type] === filter; });
      if (!list.length) { emptyBox(out, all.length ? L('この種類の出来事はまだありません。', 'Nothing of this type yet.') : L('まだ年表に書くことがありません。<br>宣戦布告・同盟・建国などが起きると、ここに記録されていきます。', 'Nothing in the chronicle yet.<br>Declarations of war, alliances, new nations and more will be recorded here.'), 'fa-feather'); return; }
      var html = '', day = '';
      list.forEach(function (e) {
        var k = ymd(e.time);
        if (k !== day) {
          if (day) html += '</ul></div>';
          day = k;
          html += '<div class="chron-day"><h3 class="chron-date dot">' + k + '</h3><ul class="chron">';
        }
        html += eventRow(e, false);
      });
      out.innerHTML = html + '</ul></div>';
      Array.prototype.forEach.call(out.querySelectorAll('.chron'), stagger);
    }
    if (chips) chips.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-f]');
      if (!b) return;
      filter = b.getAttribute('data-f');
      Array.prototype.forEach.call(chips.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
      render();
    });
    api('/api/get-events?limit=300').then(function (d) {
      all = d.events || [];
      render();
    }).catch(function () { emptyBox(out, OFFLINE_MSG); });

    var warBox = $('#chronWars');
    if (warBox) api('/api/get-lands').then(remember).then(function (d) {
      if (d.wars && d.wars.length) warBox.innerHTML = L('<h2 class="sec disp">いま起きている戦争</h2><div class="wars">', '<h2 class="sec disp">Wars in progress</h2><div class="wars">') + warCards(d.wars) + '</div>';
    }).catch(function () {});
  }

  /* ================================================================ マップ */
  function initMap() {
    var stage = $('#mapStage');
    if (!stage) return;
    // 地図のサーバー（viva-mc.net の80番。vercel.json で /map/ に中継）が答えるかを確かめてから出す
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
    fetch('/map/', ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
      clearTimeout(timer);
      var type = r.headers.get('content-type') || '';
      if (!r.ok || type.indexOf('text/html') < 0) throw new Error('MAP_DOWN');
    }).then(function () {
      stage.innerHTML = L('<iframe src="/map/" title="VIVA-MCのワールドマップ" loading="lazy" allow="fullscreen"></iframe>', '<iframe src="/map/" title="VIVA-MC world map" loading="lazy" allow="fullscreen"></iframe>');
      stage.classList.add('ready');
      var open = $('#mapOpen');
      if (open) open.hidden = false;
    }).catch(function () {
      stage.innerHTML = '<div class="map-off"><svg viewBox="0 0 200 120" aria-hidden="true" class="map-doodle"><path d="M20 90 C40 60 60 80 80 55 S120 30 140 50 S175 70 185 40" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 6"/><circle cx="80" cy="55" r="5" fill="currentColor"/><circle cx="140" cy="50" r="5" fill="currentColor"/><path d="M178 30 l14 8 -14 8 z" fill="currentColor"/></svg>' +
        L('<p><b>マップはいま表示できません。</b><br>地図のサーバーが止まっているか、準備中です。</p></div>', '<p><b>The map can\'t be shown right now.</b><br>The map server may be down or still being set up.</p></div>');
    });
    var legend = $('#mapLegend');
    if (legend) api('/api/get-lands').then(remember).then(function (d) {
      var ns = (d.nations || []).slice().sort(function (a, b) { return (b.chunks || 0) - (a.chunks || 0); });
      if (!ns.length) return;
      legend.innerHTML = L('<h2 class="sec disp">国の色</h2><ul class="rel-chips">', '<h2 class="sec disp">Nation colors</h2><ul class="rel-chips">') + ns.map(function (n) {
        return '<li><a class="plain" href="' + holderHref(n.name, 'nation') + '"><span class="swatch" style="background:' + colorOf(n.name, n.color) + '"></span>' + esc(n.name) + '</a></li>';
      }).join('') + '</ul>';
    }).catch(function () {});
  }

  /* ================================================================ トップページ「いまのVIVA-MC」 */
  function initHome() {
    var on = $('#homeOnline'), rk = $('#homeRank'), ch = $('#homeChron'), tv = $('#topVoters');
    var hc = $('#homeCal');
    if (hc) api('/api/calendar', 9000).catch(function () { return { events: [] }; }).then(function (d) {
      var from = Date.now() - 3 * 3600000;
      var up = localDays(d.events).concat(resetEvents(from, from + 62 * 86400000, d.resetDay || 15))
        .filter(function (e) { return evEnd(e) >= from; })
        .sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); }).slice(0, 3);
      hc.innerHTML = '<ul class="mini-cal">' + up.map(function (e) {
        var s = new Date(e.start);
        return '<li><span class="mc-d dot">' + (s.getMonth() + 1) + '/' + s.getDate() + '<small>' + WD[s.getDay()] + '</small></span><span class="mc-t">' + esc(evTitle(e)) +
          '<small>' + evTime(e) + '</small></span></li>';
      }).join('') + '</ul>';
    });
    if (tv) api('/api/get-ranking?type=votes_month&limit=5').then(function (d) {
      var list = (d.ranking || []).filter(function (r) { return r.value > 0; });
      if (!list.length) return;
      $('#topVotersList').innerHTML = list.map(function (r) {
        return '<li><span class="rk dot">' + r.rank + '</span>' + headImg(r.player, 26) + '<a href="' + playerHref(r.player) + '">' + esc(r.player) + '</a><span class="rv dot">' + num(r.value) + L('票</span></li>', ' votes</span></li>');
      }).join('');
      tv.hidden = false;
    }).catch(function () {});
    if (!on && !rk && !ch) return;
    if (on) api('/api/get-online').then(function (d) {
      var names = d.players || [];
      on.innerHTML = '<p class="live-big dot">' + num(names.length) + L('<small>人</small></p>', '<small> online</small></p>') +
        (names.length ? '<ul class="faces mini">' + names.slice(0, 14).map(function (n) {
          return '<li><a href="' + playerHref(n) + '" class="plain" title="' + esc(n) + '">' + headImg(n, 30) + '<span class="sr-only">' + esc(n) + '</span></a></li>';
        }).join('') + (names.length > 14 ? '<li class="more dot">+' + (names.length - 14) + '</li>' : '') + '</ul>' : L('<p class="live-sub">いまは誰もいません。一番乗りのチャンス。</p>', '<p class="live-sub">Nobody\'s on right now. Be the first!</p>'));
    }).catch(function () { on.innerHTML = L('<p class="live-sub">いまは取得できません</p>', '<p class="live-sub">Not available right now</p>'); });

    if (rk) api('/api/get-ranking?type=playtime&limit=3').then(function (d) {
      var list = (d.ranking || []).filter(function (r) { return r.value > 0; });
      if (!list.length) { rk.innerHTML = L('<p class="live-sub">まだ記録がありません</p>', '<p class="live-sub">No records yet</p>'); return; }
      rk.innerHTML = '<ol class="mini-rank">' + list.map(function (r) {
        return '<li><span class="rk dot">' + r.rank + '</span>' + headImg(r.player, 26) + '<a href="' + playerHref(r.player) + '">' + esc(r.player) + '</a><span class="rv dot">' + hours(r.value) + '</span></li>';
      }).join('') + '</ol>';
    }).catch(function () { rk.innerHTML = L('<p class="live-sub">いまは取得できません</p>', '<p class="live-sub">Not available right now</p>'); });

    if (ch) api('/api/get-events?limit=4').then(function (d) {
      var ev = d.events || [];
      if (!ev.length) { ch.innerHTML = L('<p class="live-sub">まだ記録がありません。最初の歴史をつくりましょう。</p>', '<p class="live-sub">Nothing recorded yet. Go make some history.</p>'); return; }
      ch.innerHTML = '<ul class="chron mini">' + ev.map(function (e) { return eventRow(e, true); }).join('') + '</ul>';
    }).catch(function () { ch.innerHTML = L('<p class="live-sub">いまは取得できません</p>', '<p class="live-sub">Not available right now</p>'); });
  }


  /* ================================================================ お知らせ（Discordから） */
  function linkify(text) {
    return esc(text)
      .replace(/(https?:\/\/[^\s<]+[^\s<.,)」』])/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }
  function initNews() {
    var box = $('#discordNews'), list = $('#discordList');
    if (!box || !list) return;
    api('/api/discord-news', 8000).then(function (d) {
      var posts = (d && d.posts) || [];
      if (!d.available || !posts.length) return;
      list.innerHTML = posts.slice(0, 8).map(function (p) {
        var imgs = (p.images || []).map(function (im) {
          return '<a class="plain" href="' + esc(im.url) + '" target="_blank" rel="noopener noreferrer"><img src="' + esc(im.url) + '" alt="" loading="lazy" decoding="async"></a>';
        }).join('');
        var embeds = (p.embeds || []).map(function (e) {
          return '<div class="dn-embed">' + (e.title ? '<b>' + esc(e.title) + '</b>' : '') + (e.text ? '<p>' + linkify(e.text) + '</p>' : '') + '</div>';
        }).join('');
        return '<li><div class="when dot">' + ymd(p.time) + '<small>' + hmTime(p.time) + '</small></div><div class="dn-body">' +
          (p.text ? '<p>' + linkify(p.text) + '</p>' : '') + embeds +
          (imgs ? '<div class="dn-imgs">' + imgs + '</div>' : '') +
          (p.author ? '<span class="dn-by">— ' + esc(p.author) + '</span>' : '') + '</div></li>';
      }).join('');
      box.hidden = false;
      stagger(list);
    }).catch(function () {});
  }


  /* ================================================================ VIVA Portal */
  var UA = navigator.userAgent || '';
  var IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function isStandalone() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function postJSON(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'HTTP_' + r.status); return d; }); });
  }
  function b64ToBytes(b64) {
    var s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function loadChron(el, n) {
    if (!el) return;
    api('/api/get-events?limit=' + n).then(function (d) {
      var ev = d.events || [];
      if (!ev.length) { el.innerHTML = L('<p class="live-sub">まだ記録がありません。最初の歴史をつくりましょう。</p>', '<p class="live-sub">Nothing recorded yet. Go make some history.</p>'); return; }
      el.innerHTML = '<ul class="chron mini">' + ev.map(function (e) { return eventRow(e, true); }).join('') + '</ul>';
    }).catch(function () { el.innerHTML = L('<p class="live-sub">いまは取得できません</p>', '<p class="live-sub">Not available right now</p>'); });
  }

  function initPortal() {
    /* --- サーバー --- */
    var dot = $('#psDot'), txt = $('#psText'), numEl = $('#psNum'), faces = $('#psFaces');
    function refreshStatus() {
      mcstatus('java').then(function (d) {
        var on = d && d.online;
        dot.classList.toggle('on', !!on);
        txt.textContent = d ? (on ? L('オンライン', 'Online') : L('オフライン', 'Offline')) : L('確認できません', 'Unknown');
        numEl.innerHTML = on && d.players ? num(d.players.online) + '<small> / ' + num(d.players.max) + L('人</small>', '</small>') : '—';
        $('#pStatus').classList.toggle('is-on', !!on);
      });
      api('/api/get-online').then(function (d) {
        var names = d.players || [];
        faces.innerHTML = names.slice(0, 16).map(function (n) {
          return '<li><a href="' + playerHref(n) + '" class="plain" title="' + esc(n) + '">' + headImg(n, 30) + '<span class="sr-only">' + esc(n) + '</span></a></li>';
        }).join('') + (names.length > 16 ? '<li class="more dot">+' + (names.length - 16) + '</li>' : '');
      }).catch(function () { faces.innerHTML = ''; });
    }
    refreshStatus();
    setInterval(refreshStatus, 60000);

    /* --- あなた --- */
    var meBody = $('#meBody');
    function renderMe() {
      var me = store('viva-me');
      if (!me) {
        meBody.innerHTML = L('<p class="live-sub">ゲーマーIDを登録すると、自分の記録と国がここに出ます（この端末の中にだけ保存します）。</p>', '<p class="live-sub">Register your gamer ID to see your stats and nation here (saved only on this device).</p>') +
          L('<form class="me-form"><label class="sr-only" for="meName">ゲーマーID</label><input id="meName" maxlength="32" placeholder="ゲーマーID" autocomplete="off" required>', '<form class="me-form"><label class="sr-only" for="meName">Gamer ID</label><input id="meName" maxlength="32" placeholder="Gamer ID" autocomplete="off" required>') +
          L('<button class="btn fill" type="submit">登録</button></form>', '<button class="btn fill" type="submit">Save</button></form>');
        $('.me-form', meBody).addEventListener('submit', function (e) {
          e.preventDefault();
          var v = $('#meName').value.trim();
          if (v) { store('viva-me', v); renderMe(); }
        });
        return;
      }
      meBody.innerHTML = L('<p class="live-sub">読み込み中...</p>', '<p class="live-sub">Loading...</p>');
      Promise.all([api('/api/get-stats?player=' + encodeURIComponent(me)), api('/api/get-lands').then(remember).catch(function () { return null; })])
        .then(function (r) {
          var d = r[0], lands = r[1], bal = 0;
          (d.stats || []).forEach(function (s) { if (s.name === 'balance') bal = Number(s.value) || 0; });
          var land = null;
          if (lands && lands.lands) land = lands.lands.filter(function (l) { return (l.member_names || []).some(function (m) { return m.toLowerCase() === me.toLowerCase(); }); })[0];
          meBody.innerHTML = '<a class="me-card plain" href="' + playerHref(d.player || me) + '">' + headImg(d.player || me, 48) +
            '<span><b>' + esc(d.player || me) + L('</b><small>最後に見かけたのは ', '</b><small>Last seen ') + rel(d.last_seen) + '</small></span></a>' +
            L('<dl class="me-stats"><div><dt>プレイ時間</dt><dd class="dot">', '<dl class="me-stats"><div><dt>Playtime</dt><dd class="dot">') + hours(d.active_playtime) + '</dd></div>' +
            L('<div><dt>所持金</dt><dd class="dot">', '<div><dt>Money</dt><dd class="dot">') + money(bal) + '</dd></div>' +
            L('<div><dt>所属</dt><dd>', '<div><dt>Nation</dt><dd>') + (land ? (land.nation ? holderLink(land.nation, 'nation') : holderLink(land.name, 'land')) : L('なし', 'None')) + '</dd></div></dl>' +
            L('<button type="button" class="linkish" id="meChange">名前を変える</button>', '<button type="button" class="linkish" id="meChange">Change name</button>');
          $('#meChange').addEventListener('click', function () { store('viva-me', null); renderMe(); });
        })
        .catch(function (e) {
          meBody.innerHTML = '<p class="live-sub">' + (e && e.code === 404 ? L('「', '"') + esc(me) + L('」の記録が見つかりませんでした。', '" wasn\'t found.') : L('いまは記録を取得できません。', 'Can\'t get your stats right now.')) + '</p>' +
            L('<button type="button" class="linkish" id="meChange">名前を変える</button>', '<button type="button" class="linkish" id="meChange">Change name</button>');
          $('#meChange').addEventListener('click', function () { store('viva-me', null); renderMe(); });
        });
    }
    renderMe();

    /* --- 通知 --- */
    var nb = $('#notifyBody');
    var TOPIC_LABEL = { open: L('サーバーが開いたとき', 'When the server opens'), war: L('宣戦布告・開戦のとき', 'When war is declared or begins') };
    var pushKey = null;
    function topicsSaved() {
      var t = store('viva-push-topics');
      return t ? t.split(',').filter(Boolean) : ['open', 'war'];
    }
    function swReady() {
      return Promise.race([navigator.serviceWorker.ready, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('SW_TIMEOUT')); }, 8000); })]);
    }
    function renderNotify(msg) {
      var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) {
        nb.innerHTML = IS_IOS && !isStandalone()
          ? L('<p class="live-sub">iPhone・iPad では、このページを<b>ホーム画面に追加</b>して、追加したアプリから開くと通知を使えます（iOS 16.4以降）。</p>', '<p class="live-sub">On iPhone and iPad, <b>add this page to your home screen</b> and open it from there to use alerts (iOS 16.4 or later).</p>')
          : L('<p class="live-sub">このブラウザでは通知を使えません。Chrome・Edge・Safari（ホーム画面に追加したもの）などで開いてください。</p>', '<p class="live-sub">This browser doesn\'t support alerts. Try Chrome, Edge or Safari (added to your home screen).</p>');
        return;
      }
      if (!pushKey) { nb.innerHTML = L('<p class="live-sub">通知は準備中です。使えるようになったらお知らせします。</p>', '<p class="live-sub">Alerts are coming soon. We\'ll let you know when they\'re ready.</p>'); return; }
      if (Notification.permission === 'denied') {
        nb.innerHTML = L('<p class="live-sub">通知がブロックされています。ブラウザ（またはスマホ）の設定で、このサイトの通知を「許可」にしてください。</p>', '<p class="live-sub">Alerts are blocked. Allow notifications for this site in your browser (or phone) settings.</p>');
        return;
      }
      swReady().then(function (reg) { return reg.pushManager.getSubscription().then(function (sub) { return [reg, sub]; }); })
        .then(function (r) {
          var reg = r[0], sub = r[1], topics = topicsSaved();
          nb.innerHTML = (sub ? L('<p class="nt-on"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>この端末に通知が届きます</p>', '<p class="nt-on"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>Alerts are on for this device</p>') : L('<p class="live-sub">オンにすると、アプリを閉じていても知らせが届きます。</p>', '<p class="live-sub">Turn them on to get alerts even when the app is closed.</p>')) +
            '<ul class="switches">' + ['open', 'war'].map(function (t) {
              return '<li><label><input type="checkbox" data-topic="' + t + '"' + (topics.indexOf(t) >= 0 ? ' checked' : '') + '><span class="sw" aria-hidden="true"></span>' + TOPIC_LABEL[t] + '</label></li>';
            }).join('') + '</ul>' +
            (sub ? L('<div class="nt-actions"><button type="button" class="btn plain" id="ntTest">試しに送る</button><button type="button" class="linkish" id="ntOff">通知をやめる</button></div>', '<div class="nt-actions"><button type="button" class="btn plain" id="ntTest">Send a test</button><button type="button" class="linkish" id="ntOff">Turn off alerts</button></div>')
                 : L('<button type="button" class="btn fill" id="ntOn"><i class="fa-solid fa-bell" aria-hidden="true"></i>通知をオンにする</button>', '<button type="button" class="btn fill" id="ntOn"><i class="fa-solid fa-bell" aria-hidden="true"></i>Turn on alerts</button>')) +
            (msg ? '<p class="nt-msg" role="status">' + esc(msg) + '</p>' : '');

          function chosen() {
            return Array.prototype.filter.call(nb.querySelectorAll('[data-topic]'), function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-topic'); });
          }
          Array.prototype.forEach.call(nb.querySelectorAll('[data-topic]'), function (c) {
            c.addEventListener('change', function () {
              var t = chosen();
              store('viva-push-topics', t.join(','));
              if (!sub) return;
              if (!t.length) { off(reg, sub, L('どちらもオフにしたので、通知をやめました。', 'Both are off, so alerts have been turned off.')); return; }
              postJSON('/api/push?action=subscribe', { subscription: sub.toJSON(), topics: t })
                .then(function () { renderNotify(L('保存しました。', 'Saved.')); })
                .catch(function (e) { renderNotify(e.message); });
            });
          });
          var on = $('#ntOn', nb);
          if (on) on.addEventListener('click', function () {
            var t = chosen();
            if (!t.length) { renderNotify(L('通知を受け取りたいものを選んでください。', 'Choose which alerts you want.')); return; }
            on.disabled = true;
            Notification.requestPermission().then(function (p) {
              if (p !== 'granted') throw new Error(L('通知が許可されませんでした。', 'Notifications weren\'t allowed.'));
              var opts = { userVisibleOnly: true, applicationServerKey: b64ToBytes(pushKey) };
              return reg.pushManager.subscribe(opts).catch(function () {
                // 前に別の鍵で登録していたときは、いったん外してから登録し直す
                return reg.pushManager.getSubscription().then(function (old) { return old ? old.unsubscribe() : null; })
                  .then(function () { return reg.pushManager.subscribe(opts); });
              });
            }).then(function (s) {
              store('viva-push-topics', t.join(','));
              return postJSON('/api/push?action=subscribe', { subscription: s.toJSON(), topics: t });
            }).then(function () { renderNotify(L('通知をオンにしました。', 'Alerts are on.')); })
              .catch(function (e) { renderNotify(e.message || L('通知をオンにできませんでした。', 'Couldn\'t turn on alerts.')); });
          });
          var test = $('#ntTest', nb);
          if (test) test.addEventListener('click', function () {
            test.disabled = true;
            postJSON('/api/push?action=test', { endpoint: sub.endpoint })
              .then(function () { renderNotify(L('試しの通知を送りました。数秒で届きます。', 'Test alert sent. It should arrive in a few seconds.')); })
              .catch(function (e) { renderNotify(e.message); });
          });
          var offBtn = $('#ntOff', nb);
          if (offBtn) offBtn.addEventListener('click', function () { off(reg, sub, L('通知をやめました。', 'Alerts turned off.')); });
        })
        .catch(function () { nb.innerHTML = L('<p class="live-sub">通知の準備ができませんでした。ページを開き直してください。</p>', '<p class="live-sub">Couldn\'t set up alerts. Please reload the page.</p>'); });
    }
    function off(reg, sub, msg) {
      postJSON('/api/push?action=unsubscribe', { endpoint: sub.endpoint }).catch(function () {})
        .then(function () { return sub.unsubscribe(); })
        .then(function () { renderNotify(msg); });
    }
    api('/api/push?action=key', 6000).then(function (d) { pushKey = d && d.available ? d.publicKey : null; })
      .catch(function () { pushKey = null; })
      .then(function () { renderNotify(); });

    /* --- ホーム画面に追加 --- */
    var ib = $('#installBody'), deferred = null;
    function renderInstall(justNow) {
      if (isStandalone() || justNow) {
        ib.innerHTML = '<p class="nt-on"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>' + (justNow ? L('追加しました。ホーム画面から開けます。', 'Added. Open it from your home screen.') : L('アプリとして開いています。', 'You\'re using the app.')) + '</p>';
        $('#pInstall').classList.add('done');
        return;
      }
      if (deferred) {
        ib.innerHTML = L('<p class="live-sub">ホーム画面のアイコンから、アプリのようにすぐ開けます。</p><button type="button" class="btn fill" id="doInstall"><i class="fa-solid fa-download" aria-hidden="true"></i>ホーム画面に追加</button>', '<p class="live-sub">Open it instantly from an icon on your home screen, just like an app.</p><button type="button" class="btn fill" id="doInstall"><i class="fa-solid fa-download" aria-hidden="true"></i>Add to home screen</button>');
        $('#doInstall').addEventListener('click', function () {
          deferred.prompt();
          deferred.userChoice.then(function (c) { deferred = null; renderInstall(c && c.outcome === 'accepted'); });
        });
        return;
      }
      if (IS_IOS) {
        ib.innerHTML = L('<ol class="wiz-steps small"><li>Safari でこのページを開きます。</li><li>下の <i class="fa-solid fa-arrow-up-from-bracket" aria-label="共有"></i> 共有ボタンを押します。</li><li>「<b>ホーム画面に追加</b>」を選びます。</li></ol>', '<ol class="wiz-steps small"><li>Open this page in Safari.</li><li>Tap the <i class="fa-solid fa-arrow-up-from-bracket" aria-label="Share"></i> Share button.</li><li>Choose "<b>Add to Home Screen</b>".</li></ol>');
        return;
      }
      ib.innerHTML = L('<p class="live-sub">ブラウザのメニュー（<i class="fa-solid fa-ellipsis-vertical" aria-label="メニュー"></i>）から「<b>アプリをインストール</b>」か「<b>ホーム画面に追加</b>」を選んでください。</p>', '<p class="live-sub">From your browser menu (<i class="fa-solid fa-ellipsis-vertical" aria-label="menu"></i>), choose "<b>Install app</b>" or "<b>Add to Home screen</b>".</p>');
    }
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; renderInstall(); });
    window.addEventListener('appinstalled', function () { deferred = null; renderInstall(true); });
    renderInstall();

    /* --- 国と戦争 --- */
    api('/api/get-lands').then(remember).then(function (d) {
      if (d.wars && d.wars.length) $('#pWars').innerHTML = '<div class="wars">' + warCards(d.wars.slice(0, 2)) + '</div>';
    }).catch(function () {}).then(function () { loadChron($('#homeChron'), 4); });
  }


  /* ================================================================ イベントカレンダー */
  var WD = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : [L('日', ''), '月', '火', '水', '木', '金', '土'];
  function resetEvents(fromMs, toMs, day) {
    var out = [], d = new Date(fromMs);
    d = new Date(d.getFullYear(), d.getMonth() - 1, day || 15);
    while (d.getTime() <= toMs) {
      if (d.getTime() >= fromMs) out.push({ id: 'reset-' + d.getTime(), source: 'reset', title: L('資源ワールドのリセット', 'Resource world reset'), start: d.toISOString(), allDay: true, url: 'resource.html' });
      d = new Date(d.getFullYear(), d.getMonth() + 1, day || 15);
    }
    return out;
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function evHref(e) { return e.url ? (/^https:/.test(e.url) ? e.url : e.url) : ''; }
  function evTitle(e) { return EN && e.title_en ? e.title_en : e.title; }
  function evDesc(e) { return EN && e.description_en ? e.description_en : (e.description || ''); }
  function dayKey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function evEnd(e) { return e.end ? Date.parse(e.end) : Date.parse(e.start); }
  // 終日の予定は、見ている人の時間帯に関係なくその日付で出す（サーバーは日本時間）
  function localDays(list) {
    return (list || []).map(function (e) {
      if (!e.allDay || !e.dateStart) return e;
      var a = e.dateStart.split('-'), b = (e.dateEnd || e.dateStart).split('-'), o = {};
      for (var k in e) o[k] = e[k];
      o.start = new Date(+a[0], a[1] - 1, +a[2]).toISOString();
      o.end = new Date(+b[0], b[1] - 1, +b[2], 23, 59, 59).toISOString();
      return o;
    });
  }
  function multiDay(e) { return e.end && dayKey(new Date(e.start)) !== dayKey(new Date(e.end)); }
  function md(ms) { var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + L('（' + WD[d.getDay()] + '）', ' (' + WD[d.getDay()] + ')'); }
  function evStyle(e) {
    if (!e.color) return '';
    var n = parseInt(e.color.slice(1), 16);
    return ' style="--ec:' + e.color + ';--ecbg:rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',.16)"';
  }
  function evTime(e) {
    if (e.allDay && multiDay(e)) return md(Date.parse(e.start)) + L(' 〜 ', ' – ') + md(evEnd(e));
    if (e.allDay) return e.source === 'reset' ? L('終日（0時）', 'All day (from 00:00)') : L('終日', 'All day');
    var s = new Date(e.start), t = hmTime(e.start);
    if (e.end) t += L(' 〜 ', ' – ') + (sameDay(s, new Date(e.end)) ? hmTime(e.end) : ymd(Date.parse(e.end)) + ' ' + hmTime(e.end));
    return t;
  }

  function initCalendar() {
    var grid = $('#calGrid'), title = $('#calTitle'), list = $('#calList');
    if (!grid) return;
    var now = new Date(), view = new Date(now.getFullYear(), now.getMonth(), 1);
    var events = [], resetDay = 15;

    // その期間に少しでもかかる予定（複数日の予定は、始まった後も終わるまで入る）
    function all(fromMs, toMs) {
      return events.concat(resetEvents(fromMs, toMs, resetDay)).filter(function (e) {
        return Date.parse(e.start) < toMs && evEnd(e) >= fromMs;
      }).sort(function (a, b) {
        return (multiDay(b) ? 1 : 0) - (multiDay(a) ? 1 : 0) || Date.parse(a.start) - Date.parse(b.start);
      });
    }

    function render() {
      var y = view.getFullYear(), m = view.getMonth();
      title.textContent = EN ? MON[m] + ' ' + y : y + '年' + (m + 1) + '月';
      var first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
      var end = new Date(start.getTime()); end.setDate(end.getDate() + 42);
      var evs = all(start.getTime(), end.getTime());
      var html = '<div class="cal-head">' + WD.map(function (w, i) { return '<span class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</span>'; }).join('') + '</div><div class="cal-days">';
      for (var i = 0; i < 42; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        var dk = dayKey(d);
        var mine = evs.filter(function (e) { return dayKey(new Date(e.start)) <= dk && dk <= dayKey(new Date(evEnd(e))); });
        var cls = 'cday' + (d.getMonth() !== m ? ' out' : '') + (sameDay(d, now) ? ' today' : '') + (d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : '') + (mine.length ? ' has' : '');
        html += '<div class="' + cls + '"><span class="dnum dot">' + d.getDate() + '</span>' + mine.slice(0, 3).map(function (e) {
          var h = evHref(e);
          var cls = 'cev k-' + e.source + (e.color ? ' has-color' : '') + (multiDay(e) ? ' span' : '') + (multiDay(e) && dayKey(new Date(e.start)) !== dk ? ' cont' : '');
          return (h ? '<a class="' + cls + '"' + evStyle(e) + ' href="' + esc(h) + '"' + (/^https:/.test(h) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' : '<span class="' + cls + '"' + evStyle(e) + ' title="' + esc(evTitle(e)) + '">') +
            '<span class="cev-t">' + (e.allDay ? '' : hmTime(e.start) + ' ') + esc(evTitle(e)) + '</span>' + (h ? '</a>' : '</span>');
        }).join('') + (mine.length > 3 ? '<span class="cev more">+' + (mine.length - 3) + '</span>' : '') + '</div>';
      }
      grid.innerHTML = html + '</div>';
    }

    function renderList() {
      var from = Date.now() - 3 * 3600000, to = from + 120 * 86400000;
      var seenReset = false;
      var up = all(from, to).filter(function (e) {
        if (e.source !== 'reset') return true;
        if (seenReset) return false;
        seenReset = true;
        return true;
      }).sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); }).slice(0, 16);
      if (!up.length) { emptyBox(list, L('いまのところ予定はありません。', 'Nothing scheduled right now.'), 'fa-calendar'); return; }
      list.innerHTML = '<ul class="cal-up">' + up.map(function (e) {
        var s = new Date(e.start), h = evHref(e), ext = /^https:/.test(h);
        var nowMs = Date.now(), live = e.live || (multiDay(e) && Date.parse(e.start) <= nowMs && nowMs <= evEnd(e));
        return '<li class="k-' + e.source + (live ? ' live' : '') + (e.color ? ' has-color' : '') + '"' + evStyle(e) + '>' +
          '<div class="cu-date"><span class="m dot">' + (EN ? MON[s.getMonth()] : (s.getMonth() + 1) + '月') + '</span><span class="d dot">' + s.getDate() + '</span><span class="w">' + WD[s.getDay()] + '</span></div>' +
          '<div class="cu-body">' + (e.image ? '<img src="' + esc(e.image) + '" alt="" loading="lazy">' : '') +
          '<h3>' + (live ? L('<span class="tag brick">開催中</span> ', '<span class="tag brick">Live</span> ') : '') + esc(evTitle(e)) + '</h3>' +
          '<p class="cu-meta"><i class="fa-regular fa-clock" aria-hidden="true"></i>' + evTime(e) + (e.place ? '　<i class="fa-solid fa-location-dot" aria-hidden="true"></i>' + esc(e.place) : '') +
          (e.interested ? L('　<i class="fa-solid fa-star" aria-hidden="true"></i>興味あり ', '　<i class="fa-solid fa-star" aria-hidden="true"></i>Interested: ') + num(e.interested) + L('人', '') : '') + '</p>' +
          (evDesc(e) ? '<p class="cu-desc">' + esc(evDesc(e)).replace(/\n/g, '<br>') + '</p>' : '') +
          (h ? '<a class="cu-go" href="' + esc(h) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + (e.source === 'discord' ? L('Discordで見る', 'View on Discord') : L('くわしく見る', 'Details')) + ' &rarr;</a>' : '') +
          '</div></li>';
      }).join('') + '</ul>';
      stagger($('.cal-up', list));
    }

    $('#calPrev').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
    $('#calNext').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
    $('#calToday').addEventListener('click', function () { view = new Date(now.getFullYear(), now.getMonth(), 1); render(); });
    render();
    api('/api/calendar', 9000).then(function (d) {
      events = localDays(d.events);
      resetDay = d.resetDay || 15;
    }).catch(function () {}).then(function () { render(); renderList(); });
  }

  /* ---------------------------------------------------------------- 起動 */
  var INIT = { ranking: initRanking, player: initPlayer, status: initStatus, nations: initNations, nation: initNation, chronicle: initChronicle, map: initMap, home: initHome, news: initNews, portal: initPortal, calendar: initCalendar };
  if (INIT[PAGE]) INIT[PAGE]();
})();
