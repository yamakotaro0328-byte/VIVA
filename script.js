/* =========================================================
   VIVA-MC 共通スクリプト
   ページごとに必要なものだけ動く（要素が無ければ何もしない）
   ========================================================= */
(function () {
  'use strict';

  var SERVER_IP = 'viva-mc.net';

  /* ---------- モバイルナビの開閉 ---------- */
  var mobileNav = document.querySelector('.mobile-nav');
  var menuBtn = document.querySelector('.menu-btn');

  function setMenu(open) {
    if (!mobileNav) return;
    mobileNav.classList.toggle('open', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (menuBtn) menuBtn.addEventListener('click', function () {
    setMenu(!mobileNav.classList.contains('open'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });
  document.addEventListener('click', function (e) {
    if (!mobileNav || !mobileNav.classList.contains('open')) return;
    if (mobileNav.contains(e.target) || (menuBtn && menuBtn.contains(e.target))) return;
    setMenu(false);
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

  /* ---------- サーバーの稼働状況 ----------
     1つの窓口だけだと、そこが名前を引けないときに
     動いているのに「オフライン」と出てしまうので複数に問い合わせる。
     どれか1つでも「動いている」と答えたらオンライン扱い。         */
  var dot = document.getElementById('liveDot');
  var msg = document.getElementById('liveMsg');

  var STATUS_SOURCES = [
    {
      url: 'https://api.mcstatus.io/v2/status/java/' + SERVER_IP,
      read: function (d) {
        if (!d || typeof d.online !== 'boolean') return null;
        return { on: d.online, n: (d.players && d.players.online) || 0 };
      }
    },
    {
      url: 'https://api.mcsrvstat.us/3/' + SERVER_IP,
      read: function (d) {
        if (!d || typeof d.online !== 'boolean') return null;
        // 名前が引けていないときの「オフライン」は当てにならないので無視する
        if (!d.online && d.debug && d.debug.error && d.debug.error.ip) return null;
        return { on: d.online, n: (d.players && d.players.online) || 0 };
      }
    }
  ];

  function ask(src) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
    return fetch(src.url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d ? src.read(d) : null; })
      .catch(function () { return null; })
      .then(function (v) { clearTimeout(timer); return v; });
  }

  function fetchStatus() {
    if (!dot || !msg) return;
    Promise.all(STATUS_SOURCES.map(ask)).then(function (res) {
      var answers = res.filter(function (v) { return v; });
      var up = answers.filter(function (v) { return v.on; })[0];
      if (up) {
        dot.classList.add('on');
        msg.textContent = 'オンライン ・ ' + up.n + '人が接続中';
      } else if (answers.length) {
        dot.classList.remove('on');
        msg.textContent = 'オフライン';
      } else {
        dot.classList.remove('on');
        msg.textContent = '状況を取得できませんでした';
      }
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

  /* ---------- 並んだものに順番（--k）を振る：CSSで一つずつ時間差で出す ---------- */
  document.querySelectorAll('.news, .pillars, .steps, .faq, .addr, .duo, .spec tbody, .wiki-subnav .wrap, .news-article, .pager, .mobile-nav ul')
    .forEach(function (list) {
      Array.prototype.forEach.call(list.children, function (c, i) { c.style.setProperty('--k', i); });
    });

  /* ---------- 上のバーに影（スクロールしたら） ---------- */
  var topbar = document.querySelector('.topbar');
  if (topbar) {
    var barShadow = false;
    window.addEventListener('scroll', function () {
      var on = window.scrollY > 8;
      if (on !== barShadow) { barShadow = on; topbar.classList.toggle('scrolled', on); }
    }, { passive: true });
  }

  /* ---------- ページを移るとき、ふっと消えてから移動 ---------- */
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!calm) {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return; // 同じページ内の移動
      e.preventDefault();
      document.body.classList.add('leaving');
      setTimeout(function () { location.href = a.href; }, 200);
    });
    // 戻るボタンで戻ってきたときに消えたままにならないように
    window.addEventListener('pageshow', function () { document.body.classList.remove('leaving'); });
  }

  /* ---------- スクロールで出す / 数字のカウントアップ ---------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        e.target.querySelectorAll('.cnt').forEach(function (el) {
          var to = parseFloat(el.dataset.to) || 0, t0 = performance.now(), dur = 1400;
          (function step(now) {
            var p = Math.min(1, (now - t0) / dur);
            el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString();
            if (p < 1) requestAnimationFrame(step);
          })(t0);
        });
      });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('[data-rv]').forEach(function (el, i) {
      el.style.setProperty('--i', i % 4);
      io.observe(el);
    });
  }

  /* ---------- 羅針図がカーソルの方角を向く ---------- */
  var rose = document.querySelector('.chart .rose-star');
  if (rose) {
    var rrect = null;
    var updRect = function () {
      var r = document.querySelector('.chart .rose');
      if (r) rrect = r.getBoundingClientRect();
    };
    updRect();
    window.addEventListener('resize', updRect, { passive: true });
    window.addEventListener('mousemove', function (e) {
      if (!rrect) return;
      var a = Math.atan2(e.clientY - (rrect.top + rrect.height / 2),
                         e.clientX - (rrect.left + rrect.width / 2)) * 180 / Math.PI + 90;
      rose.style.transform = 'rotate(' + (a * 0.06).toFixed(2) + 'deg)';
    }, { passive: true });
  }

  /* ---------- 航路レール：スクロールで伸びて船が進む ---------- */
  var rail = document.querySelector('.rail');
  if (rail) {
    var line = rail.querySelector('.rail-line');
    var railShip = rail.querySelector('.rail-ship');
    var chartEl = document.querySelector('.chartzone .chartmap');
    var ticking = false, lastY = -1;
    var onScroll = function () {
      var max = document.body.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (line) line.style.setProperty('--p', p.toFixed(3));
      if (railShip) {
        railShip.style.top = (p * 100).toFixed(2) + '%';
        railShip.style.transform = 'rotate(' + (Math.sin(p * 10) * 14).toFixed(1) + 'deg)';
      }
      rail.classList.toggle('show', window.scrollY > 240);
      if (chartEl && window.scrollY < 1000) {
        var y = Math.round(window.scrollY * 0.14);
        if (y !== lastY) {
          lastY = y;
          chartEl.style.transform = 'translate3d(0,' + y + 'px,0)';
        }
      }
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }

  /* ---------- 質問AI（右下のボタン） ---------- */
  (function () {
    if (document.querySelector('.lost')) return; // 404ページには出さない
    var SUGGEST = ['サーバーへの入り方は？', '土地を守るには？', '資源ワールドのリセットはいつ？'];

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'ai-fab';
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'aiPanel');
    fab.innerHTML = '<i class="fa-solid fa-compass" aria-hidden="true"></i><span>質問する</span>';

    var panel = document.createElement('section');
    panel.className = 'ai-panel';
    panel.id = 'aiPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'VIVA-MCの質問AI');
    panel.hidden = true;
    panel.innerHTML =
      '<header class="ai-head">' +
        '<div><span class="ai-k">ASK THE GUIDE</span><strong>VIVA-MC 案内係</strong></div>' +
        '<button type="button" class="ai-close" aria-label="閉じる"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
      '</header>' +
      '<div class="ai-log" aria-live="polite"></div>' +
      '<form class="ai-form">' +
        '<label class="sr-only" for="aiInput">質問</label>' +
        '<textarea id="aiInput" rows="1" maxlength="300" placeholder="ルールや遊び方について質問できます"></textarea>' +
        '<button type="submit" class="ai-send" aria-label="送信"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>' +
      '</form>' +
      '<p class="ai-note">AIが答えるので、まちがえることもあります。正式な内容は<a href="rules.html">ルール</a>・<a href="terms.html">利用規約</a>が優先です。個人情報は入力しないでください。</p>';

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    var log = panel.querySelector('.ai-log');
    var form = panel.querySelector('.ai-form');
    var input = panel.querySelector('#aiInput');
    var history = [];
    var busy = false;

    function esc(t) {
      return t.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    // AIの返事を安全に表示（サイト内のページへのリンクと太字だけを有効にする）
    function render(t) {
      var h = esc(t);
      h = h.replace(/\[([^\]]{1,40})\]\(([a-z0-9\-]+\.html(?:#[\w\-]+)?)\)/g, '<a href="$2">$1</a>');
      h = h.replace(/(https:\/\/discord\.gg\/[A-Za-z0-9]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      h = h.replace(/\*\*([^*]{1,80})\*\*/g, '<strong>$1</strong>');
      return h.replace(/\n/g, '<br>');
    }
    function bubble(who, html) {
      var d = document.createElement('div');
      d.className = 'ai-msg ' + who;
      d.innerHTML = html;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }
    function greet() {
      bubble('bot', 'こんにちは！VIVA-MCの案内係です。ルールや遊び方、Wikiに載っていることを答えます。');
      var chips = document.createElement('div');
      chips.className = 'ai-chips';
      SUGGEST.forEach(function (q) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = q;
        b.addEventListener('click', function () { ask(q); });
        chips.appendChild(b);
      });
      log.appendChild(chips);
    }

    function setOpen(open) {
      panel.hidden = !open;
      fab.setAttribute('aria-expanded', open ? 'true' : 'false');
      fab.classList.toggle('open', open);
      if (open) {
        if (!log.childElementCount) greet();
        setTimeout(function () { input.focus(); }, 50);
      } else {
        fab.focus();
      }
    }
    fab.addEventListener('click', function () { setOpen(panel.hidden); });
    panel.querySelector('.ai-close').addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) setOpen(false);
    });

    function ask(q) {
      q = (q || '').trim();
      if (!q || busy) return;
      busy = true;
      var chips = log.querySelector('.ai-chips');
      if (chips) chips.remove();
      bubble('me', esc(q));
      var wait = bubble('bot wait', '<span class="ai-dots"><i></i><i></i><i></i></span>');
      input.value = '';
      fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: history.slice(-6) })
      })
        .then(function (r) {
          var type = r.headers.get('Content-Type') || '';
          if (type.indexOf('application/json') >= 0 || !r.body) {
            // 準備中・混雑・入力ミスなどは、まとめて返ってくる
            return r.json().then(function (d) { fail((d && d.error) || 'うまく答えられませんでした。'); });
          }
          return stream(r.body.getReader());
        })
        .catch(function () { fail('通信できませんでした。時間をおいて試してください。'); })
        .then(function () {
          busy = false;
          log.scrollTop = log.scrollHeight;
        });

      function fail(msg) {
        wait.classList.remove('wait');
        wait.classList.add('err');
        wait.textContent = msg;
      }

      // 届いた文字をため、画面には1文字ずつなめらかに出していく
      function stream(reader) {
        var decoder = new TextDecoder();
        var got = '', shown = 0, done = false;
        return new Promise(function (resolve) {
          function tick() {
            if (shown < got.length) {
              if (wait.classList.contains('wait')) { wait.classList.remove('wait'); wait.innerHTML = ''; }
              var rest = got.length - shown;
              shown += Math.min(4, Math.max(1, Math.round(rest / 40)));  // 1秒に60〜240文字ほど。たまっているほど少し速く
              var near = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
              wait.innerHTML = render(got.slice(0, shown)) + (done && shown >= got.length ? '' : '<span class="ai-caret"></span>');
              if (near) log.scrollTop = log.scrollHeight;
            }
            if (done && shown >= got.length) {
              if (!got) { fail('うまく答えられませんでした。'); } else {
                wait.innerHTML = render(got);
                history.push({ role: 'user', content: q }, { role: 'assistant', content: got });
              }
              resolve();
              return;
            }
            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          (function pump() {
            reader.read().then(function (x) {
              if (x.done) { got += decoder.decode(); done = true; return; }
              got += decoder.decode(x.value, { stream: true });
              pump();
            }).catch(function () { done = true; });
          })();
        });
      }
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
    });
  })();
})();
