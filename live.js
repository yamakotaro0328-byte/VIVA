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

  var NF = window.Intl ? new Intl.NumberFormat('ja-JP') : { format: String };
  function num(n) { return NF.format(Math.round(Number(n) || 0)); }
  function money(n) { return '$' + NF.format(Math.floor(Number(n) || 0)); }
  function hours(ms) { return NF.format(Math.floor((Number(ms) || 0) / 3600000)) + '時間'; }
  function hm(ms) {
    var m = Math.floor((Number(ms) || 0) / 60000);
    return NF.format(Math.floor(m / 60)) + '時間' + (m % 60) + '分';
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
    if (min < 1) return 'たった今';
    if (min < 60) return min + '分前';
    var h = Math.floor(min / 60);
    if (h < 24) return h + '時間前';
    var d = Math.floor(h / 24);
    if (d < 31) return d + '日前';
    return ymd(ms);
  }
  function days(ms) { return Math.floor((Date.now() - ms) / 86400000); }

  /* スキンの画像（mc-heads.net）。読めないときはサーバーのアイコンにする */
  function headImg(name, px, cls) {
    return '<img class="' + (cls || 'face') + '" src="https://mc-heads.net/avatar/' + encodeURIComponent(name) + '/' + (px * 2) +
      '" width="' + px + '" height="' + px + '" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'server-icon.png\'">';
  }
  function bodyImg(name, px) {
    return '<img class="body-shot" src="https://mc-heads.net/body/' + encodeURIComponent(name) + '/' + px +
      '" alt="' + esc(name) + 'のスキン" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'server-icon-512.png\';this.classList.add(\'fallback\')">';
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
  var OFFLINE_MSG = 'いまはサーバーからデータを取得できません。<br>サーバーが止まっているか、準備中です。少し時間をおいて開き直してください。';

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
  function eventText(ev) {
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
      var left = w.time_left > 0 ? '残り ' + hm(w.time_left > 1e11 ? w.time_left - Date.now() : w.time_left) : '';
      return '<div class="war-card">' +
        '<div class="war-side">' + crest(w.attacker, '', 40) + '<a href="' + holderHref(w.attacker, w.attacker_kind) + '">' + esc(w.attacker) + '</a><span class="war-role">攻撃側</span></div>' +
        '<div class="war-mid"><span class="tag ' + (w.state === 'FIGHT' ? 'brick' : 'honey') + '">' + (w.state === 'FIGHT' ? '交戦中' : '準備期間') + '</span>' +
        '<span class="war-x" aria-hidden="true"><i class="fa-solid fa-khanda"></i></span>' +
        '<span class="war-score dot">' + num(w.attacker_points) + ' : ' + num(w.defender_points) + '</span>' +
        '<span class="war-bar" role="img" aria-label="ポイント ' + num(w.attacker_points) + ' 対 ' + num(w.defender_points) + '"><i style="width:' + aPct + '%"></i></span>' +
        (left ? '<span class="war-left">' + left + '</span>' : '') + '</div>' +
        '<div class="war-side">' + crest(w.defender, '', 40) + '<a href="' + holderHref(w.defender, w.defender_kind) + '">' + esc(w.defender) + '</a><span class="war-role">防衛側</span></div>' +
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
    { k: 'playtime', label: 'プレイ時間', icon: 'fa-hourglass-half', fmt: hours },
    { k: 'balance', label: '所持金', icon: 'fa-coins', fmt: money },
    { k: 'blocks_placed', label: '設置ブロック', icon: 'fa-cubes', fmt: function (v) { return num(v) + '個'; } },
    { k: 'blocks_broken', label: '破壊ブロック', icon: 'fa-hammer', fmt: function (v) { return num(v) + '個'; } },
    { k: 'mob_kills', label: 'モブ討伐', icon: 'fa-dragon', fmt: function (v) { return num(v) + '体'; } },
    { k: 'player_kills', label: 'PvPキル', icon: 'fa-khanda', fmt: function (v) { return num(v) + '回'; } },
    { k: 'login_count', label: 'ログイン回数', icon: 'fa-door-open', fmt: function (v) { return num(v) + '回'; } }
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
          if (!list.length) { emptyBox(out, 'まだ記録がありません。', 'fa-feather'); return; }
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
  var BADGES = [
    { id: 'new', icon: 'fa-seedling', label: '新入り', why: '初参加から14日以内', test: function (p) { return p.first_join && days(p.first_join) <= 14; } },
    { id: 'old', icon: 'fa-scroll', label: '古参', why: '初参加から180日以上', test: function (p) { return p.first_join && days(p.first_join) >= 180; } },
    { id: 'regular', icon: 'fa-mug-hot', label: '常連', why: 'ログイン100回以上', test: function (p) { return p.login_count >= 100; } },
    { id: 'resident', icon: 'fa-hourglass-half', label: '住人', why: 'プレイ時間100時間以上', test: function (p) { return p.active_playtime >= 360000000; } },
    { id: 'builder', icon: 'fa-trowel-bricks', label: '建築家', why: 'ブロックを1万個以上設置', test: function (p) { return p.placed >= 10000; } },
    { id: 'miner', icon: 'fa-hammer', label: '鉱夫', why: 'ブロックを2万個以上破壊', test: function (p) { return p.broken >= 20000; } },
    { id: 'hunter', icon: 'fa-dragon', label: '狩人', why: 'モブを1,000体以上討伐', test: function (p) { return p.mob >= 1000; } },
    { id: 'warrior', icon: 'fa-khanda', label: '武人', why: 'PvPで50回以上勝利', test: function (p) { return p.pk >= 50; } },
    { id: 'rich', icon: 'fa-coins', label: '大富豪', why: '所持金 $1,000,000 以上', test: function (p) { return p.balance >= 1000000; } },
    { id: 'citizen', icon: 'fa-flag', label: '国民', why: '国に属する土地のメンバー', test: function (p) { return !!p.nation; } }
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
    document.title = name + ' | プレイヤー | VIVA-MC';
    out.innerHTML = '<p class="muted">読み込み中...</p>';

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
          emptyBox(out, '「' + esc(name) + '」の記録は見つかりませんでした。<br>名前のつづり（大文字・小文字も）を確かめてください。統合版の人は、名前の前に記号が付くことがあります。', 'fa-magnifying-glass');
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
        mob: kd.mob_kills_total || 0, pk: kd.player_kills_total || 0, deaths: kd.deaths_total || 0, balance: bal
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
      if (!aff) aff = '<span class="aff muted-aff">どの土地にも属していません</span>';

      out.innerHTML =
        '<div class="profile">' +
          '<div class="portrait">' + bodyImg(p.name, 260) + '<span class="portrait-cap dot">VIVA-MC CITIZEN</span></div>' +
          '<div class="pinfo">' +
            '<h2 class="pname disp">' + headImg(p.name, 34) + esc(p.name) + '</h2>' +
            '<p class="pmeta">初参加 <b class="dot">' + ymd(p.first_join) + '</b>　・　最後に見かけたのは <b>' + rel(p.last_seen) + '</b></p>' +
            '<div class="affs">' + aff + '</div>' +
            '<ul class="badges">' + (badges.length ? badges.map(function (b) {
              return '<li class="badge b-' + b.id + '" title="' + esc(b.why) + '"><i class="fa-solid ' + b.icon + '" aria-hidden="true"></i>' + b.label + '<span class="sr-only">（' + b.why + '）</span></li>';
            }).join('') : '<li class="badge none">称号はまだありません</li>') + '</ul>' +
            '<dl class="pstats">' +
              '<div><dt>プレイ時間' + rk(0) + '</dt><dd class="dot">' + hm(p.active_playtime) + '</dd></div>' +
              '<div><dt>所持金' + rk(1) + '</dt><dd class="dot">' + money(p.balance) + '</dd></div>' +
              '<div><dt>ログイン</dt><dd class="dot">' + num(p.login_count) + '回</dd></div>' +
              '<div><dt>設置ブロック' + rk(2) + '</dt><dd class="dot">' + num(p.placed) + '</dd></div>' +
              '<div><dt>破壊ブロック</dt><dd class="dot">' + num(p.broken) + '</dd></div>' +
              '<div><dt>モブ討伐</dt><dd class="dot">' + num(p.mob) + '</dd></div>' +
              '<div><dt>PvPキル</dt><dd class="dot">' + num(p.pk) + '</dd></div>' +
              '<div><dt>デス</dt><dd class="dot">' + num(p.deaths) + '</dd></div>' +
              '<div><dt>K/D</dt><dd class="dot">' + kdr + '</dd></div>' +
            '</dl>' +
          '</div>' +
        '</div>' +
        '<details class="badge-help"><summary>称号の条件を見る</summary><ul>' + BADGES.map(function (b) {
          return '<li><i class="fa-solid ' + b.icon + '" aria-hidden="true"></i><b>' + b.label + '</b>… ' + b.why + '</li>';
        }).join('') + '</ul></details>';
    }

    // 名前が無いときは、最近来た人を並べる
    function showRecent() {
      api('/api/get-history').then(function (d) {
        var seen = {}, names = [];
        (d.events || []).forEach(function (ev) { if (!seen[ev.player]) { seen[ev.player] = 1; names.push(ev.player); } });
        if (!names.length) { out.innerHTML = ''; return; }
        out.innerHTML = '<h2 class="sec disp">最近あそびに来た人</h2><ul class="faces big">' + names.slice(0, 24).map(function (n) {
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
            '<span class="srv-state"><span class="dot-live' + (on ? ' on' : '') + '"></span>' + (d ? (on ? 'オンライン' : 'オフライン') : '確認できません') + '</span></div>' +
            '<div class="srv-n dot">' + (on && d.players ? num(d.players.online) + '<small> / ' + num(d.players.max) + '人</small>' : '—') + '</div>' +
            '<div class="srv-sub">' + esc(SERVER) + '：' + port + (ver ? '　・　' + esc(ver) : '') + '</div>' +
            (motd ? '<div class="srv-motd">' + esc(motd) + '</div>' : '') + '</div>';
        };
        box.innerHTML = card('Java版', 'fa-desktop', j, 25565) + card('統合版（Bedrock）', 'fa-mobile-screen', b, 19132);
        stagger(box);
      });
    }

    var faces = $('#onlineFaces'), chart = $('#onlineChart');
    api('/api/get-online').then(function (d) {
      if (faces) {
        var names = d.players || [];
        $('#onlineCount') && ($('#onlineCount').textContent = num(names.length) + '人');
        faces.innerHTML = names.length ? '<ul class="faces big">' + names.map(function (n) {
          return '<li><a href="' + playerHref(n) + '" class="plain">' + headImg(n, 48) + '<span>' + esc(n) + '</span></a></li>';
        }).join('') + '</ul>' : '<p class="muted">いまメインサーバーにいる人はいません。</p>';
        stagger($('.faces', faces));
      }
      if (chart) drawOnline(chart, d.samples || [], d.peak, d.peak_at);
    }).catch(function () {
      emptyBox(faces, OFFLINE_MSG);
      if (chart) emptyBox(chart, 'グラフのデータを取得できませんでした。');
    });

    var hist = $('#statusHistory');
    if (hist) {
      api('/api/get-history').then(function (d) {
        var ev = d.events || [];
        if (!ev.length) { hist.innerHTML = '<p class="muted">まだ記録がありません。</p>'; return; }
        hist.innerHTML = '<ul>' + ev.map(function (e) {
          return '<li class="' + (e.type === 'join' ? 'on' : '') + '"><a class="who" href="' + playerHref(e.player) + '">' + esc(e.player) + '</a>' +
            '<span class="at">' + (e.type === 'join' ? ' が参加 · ' : ' が退出 · ') + rel(e.time) + '</span></li>';
        }).join('') + '</ul>';
      }).catch(function () { hist.innerHTML = '<p class="muted">接続履歴を取得できませんでした。</p>'; });
    }
  }

  /* 直近7日の人数（1本の面グラフ。ホバーで時刻と人数） */
  function drawOnline(box, samples, peak, peakAt) {
    if (samples.length < 2) {
      emptyBox(box, 'グラフはまだ準備中です。記録が貯まると、ここに直近7日の人数が出ます。', 'fa-chart-area');
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

    box.innerHTML = '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" class="ochart" role="img" aria-label="直近7日の接続人数のグラフ">' +
      grid + area + line + labels +
      '<line class="xh off" y1="' + T + '" y2="' + (H - B) + '" x1="0" x2="0"/><circle class="xd off" r="4.5" cx="0" cy="0"/>' +
      '<rect class="hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" tabindex="0" aria-label="グラフを左右の矢印キーでたどれます"/></svg>' +
      '<div class="tip" hidden></div></div>' +
      '<p class="chart-note">最高記録 <b class="dot">' + num(peak || maxN) + '人</b>' + (peakAt ? '（' + ymd(peakAt) + ' ' + hmTime(peakAt) + '）' : '') +
      '　・　メインサーバーの人数を5分ごとに記録しています</p>' +
      '<details class="chart-table"><summary>表で見る（日ごとの最大人数）</summary><table class="spec"><tbody>' + dailyRows(samples, t0) + '</tbody></table></details>';

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
      var b = document.createElement('b'); b.textContent = num(s[1]) + '人';
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
      return '<tr><th class="dot">' + k + '</th><td class="dot">' + num(byDay[k]) + '人</td></tr>';
    }).join('');
  }

  /* ================================================================ 国家図鑑 */
  function initNations() {
    var out = $('#natOut');
    if (!out) return;
    api('/api/get-lands').then(remember).then(function (d) {
      if (!d.available) { emptyBox(out, '国家図鑑は準備中です。サーバーとの連携が整うと、ここに国と土地が並びます。', 'fa-flag'); return; }
      var nations = d.nations || [], lands = d.lands || [], wars = d.wars || [];
      var chunks = lands.reduce(function (a, l) { return a + (l.chunks || 0); }, 0);
      $('#natFacts').innerHTML =
        '<div><dt>' + nations.length + '</dt><dd>国</dd></div>' +
        '<div><dt>' + lands.length + '</dt><dd>土地</dd></div>' +
        '<div><dt>' + num(chunks) + '</dt><dd>領土のチャンク</dd></div>' +
        '<div><dt>' + wars.length + '</dt><dd>いまの戦争</dd></div>';
      $('#natFacts').hidden = false;

      var warBox = $('#natWars');
      if (warBox) {
        warBox.innerHTML = wars.length ? '<h2 class="sec disp">いま起きている戦争</h2><div class="wars">' + warCards(wars) + '</div>' : '';
      }

      var q = $('#natQ'), sort = $('#natSort');
      function card(n, kind) {
        var sub = kind === 'nation'
          ? '首都 ' + esc(n.capital || '—') + '　・　土地 ' + (n.lands || []).length
          : (n.owner ? '持ち主 ' + esc(n.owner) : '');
        return '<li><a class="ncard plain" href="' + holderHref(n.name, kind) + '" style="--c:' + colorOf(n.name, n.color) + '">' +
          crest(n.name, n.color, 52) +
          '<span class="nbody"><span class="nname">' + esc(n.name) + (n.in_war ? ' <span class="tag brick">戦争中</span>' : '') + '</span>' +
          '<span class="nsub">' + sub + '</span>' +
          '<span class="nnums dot"><span title="メンバー"><i class="fa-solid fa-user-group" aria-hidden="true"></i>' + num(n.members) + '</span>' +
          '<span title="チャンク"><i class="fa-solid fa-map" aria-hidden="true"></i>' + num(n.chunks) + '</span>' +
          '<span title="銀行"><i class="fa-solid fa-coins" aria-hidden="true"></i>' + money(n.balance) + '</span>' +
          (n.allies && n.allies.length ? '<span title="同盟"><i class="fa-solid fa-handshake" aria-hidden="true"></i>' + n.allies.length + '</span>' : '') +
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
          '<h2 class="sec disp">国 <span class="count dot">' + hitN.length + '</span></h2>' +
          (hitN.length ? '<ul class="ncards">' + hitN.map(function (n) { return card(n, 'nation'); }).join('') + '</ul>' : '<p class="muted">' + (word ? '見つかりませんでした。' : 'まだ国はありません。最初の国をつくるのはあなたかもしれません。') + '</p>') +
          '<h2 class="sec disp">国に属さない土地 <span class="count dot">' + free.length + '</span></h2>' +
          (free.length ? '<ul class="ncards small">' + free.map(function (n) { return card(n, 'land'); }).join('') + '</ul>' : '<p class="muted">ありません。</p>');
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
    document.title = name + ' | 国家図鑑 | VIVA-MC';
    $('#natTitle').textContent = name;
    $('#natKind').textContent = kind === 'nation' ? 'NATION ・ 国' : 'LAND ・ 土地';

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
          emptyBox(out, '「' + esc(name) + '」は見つかりませんでした。名前が変わったか、解体された可能性があります。<br><a href="nations.html">国家図鑑に戻る</a>', 'fa-map');
          return;
        }
        $('#natCrest').innerHTML = crest(h.name, h.color, 64);

        var members = (h.member_names || []).slice();
        var landRows = '';
        if (kind === 'nation') {
          var mine = (d.lands || []).filter(function (l) { return l.nation === h.name; });
          mine.forEach(function (l) { (l.member_names || []).forEach(function (m) { if (members.indexOf(m) < 0) members.push(m); }); });
          landRows = '<section><h2 class="sec disp">この国の土地 <span class="count dot">' + mine.length + '</span></h2><ul class="ncards small">' +
            mine.map(function (l) {
              return '<li><a class="ncard plain" href="' + holderHref(l.name, 'land') + '" style="--c:' + colorOf(l.name, l.color) + '">' + crest(l.name, l.color, 40) +
                '<span class="nbody"><span class="nname">' + esc(l.name) + (l.name === h.capital ? ' <span class="tag honey">首都</span>' : '') + '</span>' +
                '<span class="nnums dot"><span><i class="fa-solid fa-user-group" aria-hidden="true"></i>' + num(l.members) + '</span><span><i class="fa-solid fa-map" aria-hidden="true"></i>' + num(l.chunks) + '</span></span></span></a></li>';
            }).join('') + '</ul></section>';
        }
        var ws = h.war_stats || {};
        var rel = function (arr, cls) {
          if (!arr || !arr.length) return '<p class="muted left">なし</p>';
          return '<ul class="rel-chips">' + arr.map(function (n) {
            var isNation = (d.nations || []).some(function (x) { return x.name === n; });
            return '<li class="' + cls + '"><a class="plain" href="' + holderHref(n, isNation ? 'nation' : 'land') + '">' + crest(n, '', 20) + esc(n) + '</a></li>';
          }).join('') + '</ul>';
        };
        var mine2 = events.filter(function (e) { return e.a === h.name || e.b === h.name; });
        var war = (d.wars || []).filter(function (w) { return w.attacker === h.name || w.defender === h.name; });

        out.innerHTML =
          '<dl class="facts nat-facts">' +
            '<div><dt>' + num(h.members) + '</dt><dd>メンバー</dd></div>' +
            '<div><dt>' + num(h.chunks) + '</dt><dd>チャンク</dd></div>' +
            '<div><dt>' + money(h.balance) + '</dt><dd>銀行</dd></div>' +
            '<div><dt>' + num(ws.won || 0) + '<small>勝</small> ' + num(ws.lost || 0) + '<small>敗</small></dt><dd>戦績</dd></div>' +
          '</dl>' +
          '<table class="spec nat-spec"><tbody>' +
            (kind === 'nation' ? '<tr><th>首都</th><td>' + (h.capital ? holderLink(h.capital, 'land') : '—') + '</td></tr>' : '') +
            (kind === 'land' ? '<tr><th>所属する国</th><td>' + (h.nation ? holderLink(h.nation, 'nation') : 'なし（独立）') + '</td></tr>' : '') +
            '<tr><th>' + (kind === 'nation' ? '代表' : '持ち主') + '</th><td>' + ((h.leader || h.owner) ? '<a href="' + playerHref(h.leader || h.owner) + '">' + esc(h.leader || h.owner) + '</a>' : '—') + '</td></tr>' +
            '<tr><th>できた日</th><td class="dot">' + ymd(h.created) + '</td></tr>' +
            (h.level ? '<tr><th>レベル</th><td>' + esc(h.level) + '</td></tr>' : '') +
            '<tr><th>戦争での記録</th><td class="dot">キル ' + num(ws.kills || 0) + '　・　デス ' + num(ws.deaths || 0) + '　・　旗の占領 ' + num(ws.captures || 0) + '</td></tr>' +
          '</tbody></table>' +
          (war.length ? '<section><h2 class="sec disp">いまの戦争</h2><div class="wars">' + warCards(war) + '</div></section>' : '') +
          landRows +
          '<section><h2 class="sec disp">外交</h2><div class="rel-cols"><div><h3><i class="fa-solid fa-handshake" aria-hidden="true"></i>同盟</h3>' + rel(h.allies, 'ally') + '</div>' +
          '<div><h3><i class="fa-solid fa-bolt" aria-hidden="true"></i>敵対</h3>' + rel(h.enemies, 'enemy') + '</div></div></section>' +
          '<section><h2 class="sec disp">メンバー <span class="count dot">' + members.length + '</span></h2>' +
            (members.length ? '<ul class="faces">' + members.map(function (m) {
              return '<li><a href="' + playerHref(m) + '" class="plain">' + headImg(m, 40) + '<span>' + esc(m) + '</span></a></li>';
            }).join('') + '</ul>' : '<p class="muted left">—</p>') + '</section>' +
          '<section><h2 class="sec disp">年表</h2>' +
            (mine2.length ? '<ul class="chron">' + mine2.slice(0, 40).map(function (e) { return eventRow(e, true); }).join('') + '</ul>' : '<p class="muted left">まだ記録がありません。</p>') + '</section>';
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
      if (!list.length) { emptyBox(out, all.length ? 'この種類の出来事はまだありません。' : 'まだ年表に書くことがありません。<br>宣戦布告・同盟・建国などが起きると、ここに記録されていきます。', 'fa-feather'); return; }
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
      if (d.wars && d.wars.length) warBox.innerHTML = '<h2 class="sec disp">いま起きている戦争</h2><div class="wars">' + warCards(d.wars) + '</div>';
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
      stage.innerHTML = '<iframe src="/map/" title="VIVA-MCのワールドマップ" loading="lazy" allow="fullscreen"></iframe>';
      stage.classList.add('ready');
      var open = $('#mapOpen');
      if (open) open.hidden = false;
    }).catch(function () {
      stage.innerHTML = '<div class="map-off"><svg viewBox="0 0 200 120" aria-hidden="true" class="map-doodle"><path d="M20 90 C40 60 60 80 80 55 S120 30 140 50 S175 70 185 40" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 6"/><circle cx="80" cy="55" r="5" fill="currentColor"/><circle cx="140" cy="50" r="5" fill="currentColor"/><path d="M178 30 l14 8 -14 8 z" fill="currentColor"/></svg>' +
        '<p><b>マップはいま表示できません。</b><br>地図のサーバーが止まっているか、準備中です。</p></div>';
    });
    var legend = $('#mapLegend');
    if (legend) api('/api/get-lands').then(remember).then(function (d) {
      var ns = (d.nations || []).slice().sort(function (a, b) { return (b.chunks || 0) - (a.chunks || 0); });
      if (!ns.length) return;
      legend.innerHTML = '<h2 class="sec disp">国の色</h2><ul class="rel-chips">' + ns.map(function (n) {
        return '<li><a class="plain" href="' + holderHref(n.name, 'nation') + '"><span class="swatch" style="background:' + colorOf(n.name, n.color) + '"></span>' + esc(n.name) + '</a></li>';
      }).join('') + '</ul>';
    }).catch(function () {});
  }

  /* ================================================================ トップページ「いまのVIVA-MC」 */
  function initHome() {
    var on = $('#homeOnline'), rk = $('#homeRank'), ch = $('#homeChron');
    if (!on && !rk && !ch) return;
    if (on) api('/api/get-online').then(function (d) {
      var names = d.players || [];
      on.innerHTML = '<p class="live-big dot">' + num(names.length) + '<small>人</small></p>' +
        (names.length ? '<ul class="faces mini">' + names.slice(0, 14).map(function (n) {
          return '<li><a href="' + playerHref(n) + '" class="plain" title="' + esc(n) + '">' + headImg(n, 30) + '<span class="sr-only">' + esc(n) + '</span></a></li>';
        }).join('') + (names.length > 14 ? '<li class="more dot">+' + (names.length - 14) + '</li>' : '') + '</ul>' : '<p class="live-sub">いまは誰もいません。一番乗りのチャンス。</p>');
    }).catch(function () { on.innerHTML = '<p class="live-sub">いまは取得できません</p>'; });

    if (rk) api('/api/get-ranking?type=playtime&limit=3').then(function (d) {
      var list = (d.ranking || []).filter(function (r) { return r.value > 0; });
      if (!list.length) { rk.innerHTML = '<p class="live-sub">まだ記録がありません</p>'; return; }
      rk.innerHTML = '<ol class="mini-rank">' + list.map(function (r) {
        return '<li><span class="rk dot">' + r.rank + '</span>' + headImg(r.player, 26) + '<a href="' + playerHref(r.player) + '">' + esc(r.player) + '</a><span class="rv dot">' + hours(r.value) + '</span></li>';
      }).join('') + '</ol>';
    }).catch(function () { rk.innerHTML = '<p class="live-sub">いまは取得できません</p>'; });

    if (ch) api('/api/get-events?limit=4').then(function (d) {
      var ev = d.events || [];
      if (!ev.length) { ch.innerHTML = '<p class="live-sub">まだ記録がありません。最初の歴史をつくりましょう。</p>'; return; }
      ch.innerHTML = '<ul class="chron mini">' + ev.map(function (e) { return eventRow(e, true); }).join('') + '</ul>';
    }).catch(function () { ch.innerHTML = '<p class="live-sub">いまは取得できません</p>'; });
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

  /* ---------------------------------------------------------------- 起動 */
  var INIT = { ranking: initRanking, player: initPlayer, status: initStatus, nations: initNations, nation: initNation, chronicle: initChronicle, map: initMap, home: initHome, news: initNews };
  if (INIT[PAGE]) INIT[PAGE]();
})();
