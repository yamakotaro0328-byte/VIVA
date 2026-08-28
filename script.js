/* =========================================================
   VIVA-MC 共通スクリプト
   ページごとに必要なものだけ動く（要素が無ければ何もしない）
   ========================================================= */
(function () {
  'use strict';

  var SERVER_IP = 'viva-mc.net';

  /* ---------- サイドバーの開閉（スマホ） ---------- */
  var sidebar = document.querySelector('.sidebar');
  var scrim   = document.querySelector('.scrim');
  var menuBtn = document.querySelector('.menu-btn');

  function setMenu(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (menuBtn) menuBtn.addEventListener('click', function () {
    setMenu(!sidebar.classList.contains('open'));
  });
  if (scrim) scrim.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });

  /* ---------- IPをコピー ---------- */
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.querySelector('span').textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function fallbackCopy(text) {
    var box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(box);
    return ok;
  }

  window.copyIP = function (value) {
    var text = value || SERVER_IP;
    var done = function () { toast('「' + text + '」をコピーしました'); };
    // https でないと navigator.clipboard は使えないので保険をつける
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        if (fallbackCopy(text)) done();
      });
    } else if (fallbackCopy(text)) {
      done();
    }
  };

  document.querySelectorAll('[data-copy]').forEach(function (el) {
    el.addEventListener('click', function () { window.copyIP(el.dataset.copy); });
  });

  /* ---------- サーバーの稼働状況 ---------- */
  var dot = document.getElementById('liveDot');
  var msg = document.getElementById('liveMsg');
  function fetchStatus() {
    if (!dot || !msg) return;
    fetch('https://api.mcsrvstat.us/2/' + SERVER_IP)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.online) {
          dot.classList.add('on');
          var n = (data.players && data.players.online) || 0;
          msg.textContent = 'オンライン ・ ' + n + '人が接続中';
        } else {
          dot.classList.remove('on');
          msg.textContent = 'オフライン';
        }
      })
      .catch(function () {
        dot.classList.remove('on');
        msg.textContent = '状況を取得できませんでした';
      });
  }
  fetchStatus();
  if (dot) setInterval(fetchStatus, 60000);

  /* ---------- よくある質問 ---------- */
  document.querySelectorAll('.faq button').forEach(function (b) {
    b.addEventListener('click', function () {
      var item = b.parentElement;
      var open = item.classList.toggle('open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  /* ---------- 資源ワールドのリセットまで ---------- */
  var hoursEl = document.getElementById('resetHours');
  if (hoursEl) {
    var RESET_DAY = 15;   // ← 毎月この日の0時にリセット。変えるならここだけ
    var subEl = document.getElementById('resetSub');
    var barEl = document.getElementById('resetBar');

    var tick = function () {
      var now = new Date();
      // 過ぎたら自動で翌月へ繰り越すので、表示が止まらない
      var target = new Date(now.getFullYear(), now.getMonth(), RESET_DAY, 0, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target = new Date(now.getFullYear(), now.getMonth() + 1, RESET_DAY, 0, 0, 0, 0);
      }
      var prev = new Date(target.getFullYear(), target.getMonth() - 1, RESET_DAY, 0, 0, 0, 0);

      var left  = target.getTime() - now.getTime();
      var cycle = target.getTime() - prev.getTime();
      var m = Math.floor((left % 3600000) / 60000);
      var s = Math.floor((left % 60000) / 1000);

      hoursEl.textContent = Math.floor(left / 3600000).toLocaleString();
      subEl.textContent = String(m).padStart(2, '0') + '分' + String(s).padStart(2, '0') + '秒';
      barEl.style.width = Math.min(100, Math.max(0, ((now - prev) / cycle) * 100)) + '%';
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- スクロールで板をふわっと出す ----------
     ここが動かなかった場合、html に .anim が付かないので
     CSS側の指定も一切効かず、中身は最初から見えたままになります。 */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduce && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll(
      '.news li, .duo .col, .faq, .finder, .log, .reset, .table-wrap, .pillars > div, .row-item, .steps > li'
    );
    if (targets.length) {
      document.documentElement.classList.add('anim');
      targets.forEach(function (el) { el.classList.add('reveal'); });

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e, i) {
          if (!e.isIntersecting) return;
          // 少しずつ遅らせて、順に出す
          var d = Math.min(i, 4) * 60;
          setTimeout(function () { e.target.classList.add('shown'); }, d);
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

      targets.forEach(function (el) { io.observe(el); });

      // 保険：3秒たっても出ていないものは、強制的に表示する
      setTimeout(function () {
        targets.forEach(function (el) { el.classList.add('shown'); });
      }, 3000);
    }
  }

  /* ---------- プレイヤー統計 ---------- */
  var statBtn = document.getElementById('statBtn');
  if (statBtn) {
    statBtn.addEventListener('click', function () {
      var name = document.getElementById('statName').value.trim();
      var out  = document.getElementById('statOut');
      var err  = document.getElementById('statErr');

      var fail = function (m) { err.textContent = m; err.style.display = 'block'; };

      err.style.display = 'none';
      out.style.display = 'none';
      if (!name) { fail('ゲーマーIDを入力してください。'); return; }

      statBtn.disabled = true;
      statBtn.textContent = '照会中...';

      fetch('/api/get-stats?player=' + encodeURIComponent(name))
        .then(function (r) {
          if (r.status === 404) throw new Error('NOT_FOUND');
          if (!r.ok) throw new Error('SERVER');
          return r.text();
        })
        .then(function (raw) {
          var data = JSON.parse(raw);
          var kd = data.kill_data || {};
          document.getElementById('statWho').textContent = name;
          document.getElementById('statPk').textContent = (kd.player_kills_total || 0).toLocaleString();
          document.getElementById('statMk').textContent = (kd.mob_kills_total || 0).toLocaleString();
          document.getElementById('statDe').textContent = (kd.deaths_total || 0).toLocaleString();

          var bi = raw.indexOf('"name":"balance"');
          if (bi !== -1) {
            var v = raw.substring(bi, bi + 250).match(/"value"\s*:\s*([^,}]+)/);
            document.getElementById('statMoney').textContent =
              v ? '$' + parseFloat(v[1].replace(/"/g, '')).toLocaleString() : '$0';
          }
          var li = raw.indexOf('"tableName":"lands"');
          if (li !== -1) {
            var t = raw.substring(li, li + 400).match(/"value"\s*:\s*"([^"]+)"/);
            document.getElementById('statTown').textContent = t ? t[1] : '未所属';
          }
          var tm = raw.match(/"active_playtime"\s*:\s*([0-9.]+)/);
          if (tm) {
            var mins = Math.floor(parseInt(tm[1], 10) / 60000);
            document.getElementById('statTime').textContent =
              Math.floor(mins / 60) + '時間 ' + (mins % 60) + '分';
          }
          out.style.display = 'block';
        })
        .catch(function (e) {
          if (e.message === 'NOT_FOUND') fail('「' + name + '」の記録が見つかりませんでした。IDのつづりを確認してください。');
          else if (e instanceof SyntaxError) fail('データを読み取れませんでした。時間をおいて試してください。');
          else fail('サーバーに接続できませんでした。通信環境を確認してください。');
        })
        .finally(function () {
          statBtn.disabled = false;
          statBtn.textContent = '統計を取得';
        });
    });
  }

  /* ---------- 接続履歴 ---------- */
  var historyList = document.getElementById('historyList');
  var historyMsg = document.getElementById('historyMsg');
  if (historyList && historyMsg) {
    var relTime = function (ms) {
      var diff = Math.max(0, Date.now() - ms);
      var min = Math.floor(diff / 60000);
      if (min < 1) return 'たった今';
      if (min < 60) return min + '分前';
      var hr = Math.floor(min / 60);
      if (hr < 24) return hr + '時間前';
      return Math.floor(hr / 24) + '日前';
    };

    fetch('/api/get-history')
      .then(function (r) {
        if (!r.ok) throw new Error('SERVER');
        return r.json();
      })
      .then(function (data) {
        var events = data.events || [];
        if (!events.length) {
          historyMsg.textContent = 'まだ記録がありません。';
          return;
        }
        events.forEach(function (ev) {
          var li = document.createElement('li');
          if (ev.type === 'join') li.className = 'on';
          var who = document.createElement('span');
          who.className = 'who';
          who.textContent = ev.player;
          var at = document.createElement('span');
          at.className = 'at';
          at.textContent = (ev.type === 'join' ? ' が参加 · ' : ' が退出 · ') + relTime(ev.time);
          li.appendChild(who);
          li.appendChild(at);
          historyList.appendChild(li);
        });
        historyMsg.hidden = true;
        historyList.hidden = false;
      })
      .catch(function () {
        historyMsg.textContent = '接続履歴を取得できませんでした。時間をおいて試してください。';
      });
  }
})();
