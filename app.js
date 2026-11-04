(function () {
  'use strict';
  var D = window.SHOWCASE;
  if (!D) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px">data.js is missing: rebuild the site with tools/build-showcase.ps1.</p>'); return; }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var byName = {};
  D.skills.forEach(function (s) { byName[s.name] = s; });
  var testNames = {};
  D.tests.forEach(function (t) { testNames[t.name] = true; });

  function get(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, D); }
  function shorten(text, max) {
    var t = String(text || '').replace(/^Use (when|for|to)\s+/i, '');
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, '') + '...';
  }

  // Theme
  var root = document.documentElement;
  function setTheme(t) { root.setAttribute('data-theme', t); try { localStorage.setItem('showcase-theme', t); } catch (e) { /* storage can be blocked */ } }
  var saved = null;
  try { saved = localStorage.getItem('showcase-theme'); } catch (e) { saved = null; }
  setTheme(saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  $('#theme').addEventListener('click', function () { setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); });

  // Static bindings
  $$('[data-bind]').forEach(function (el) {
    var v = get(el.getAttribute('data-bind'));
    el.textContent = typeof v === 'number' ? fmt(v) : (v == null ? '' : v);
  });
  $('#repoLink').href = D.repoUrl;
  $('#author').innerHTML = 'Built by Dustin Bierman' + (D.profileUrl ? ' &middot; <a href="' + esc(D.profileUrl) + '">GitHub profile</a>' : '') + ' &middot; <a href="' + esc(D.repoUrl) + '">Repository</a>';

  // Hero stats
  [[D.stats.skills, 'skills'], [D.stats.testSuites, 'test suites'], [D.stats.triggerCases, 'routing cases'], [D.stats.mcpServers, 'MCP servers'], [D.stats.releases, 'releases'], ['v' + D.version, 'current']].forEach(function (s) {
    $('#stats').insertAdjacentHTML('beforeend', '<li><b>' + esc(typeof s[0] === 'number' ? fmt(s[0]) : s[0]) + '</b><span>' + esc(s[1]) + '</span></li>');
  });

  // ---- Live replay ----
  var term = $('#term'), list = $('#prompts');
  var kind = 'match', current = null, runId = 0, timer = null, auto = false;

  function visible() { return D.prompts.filter(function (p) { return p.kind === kind; }); }

  function renderList() {
    list.innerHTML = '';
    visible().forEach(function (p, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = esc(p.prompt) + '<span class="to' + (p.skill ? '' : ' none') + '">&rarr; ' + esc(p.skill || 'no skill') + '</span>';
      b.addEventListener('click', function () { auto = false; syncAuto(); select(p); });
      li.appendChild(b);
      list.appendChild(li);
      p._btn = b;
    });
  }

  function mark(p) {
    visible().forEach(function (q) { if (q._btn) q._btn.removeAttribute('aria-current'); });
    if (p._btn) { p._btn.setAttribute('aria-current', 'true'); if (auto && p._btn.scrollIntoView) p._btn.scrollIntoView({ block: 'nearest' }); }
  }

  function steps(p) {
    var s = [];
    var all = D.budget.allSkillsTokens, on = D.budget.alwaysOnTokens;
    s.push({ tag: 'you', cls: 'k-you', html: esc(p.prompt), wait: 700 });
    s.push({ tag: 'router', cls: 'k-router', html: 'always-on policy loaded <em>(&asymp; ' + fmt(on) + ' tokens)</em>', wait: 650 });
    s.push({ tag: 'catalog', cls: 'k-load', html: 'scanning ' + fmt(D.budget.catalogCount) + ' skill descriptions <em>(&asymp; ' + fmt(D.budget.catalogTokens) + ' tokens)</em>. No skill body is loaded yet.', wait: 800 });
    if (p.kind === 'near') {
      s.push({ tag: 'overlap', cls: 'k-warn', html: 'wording overlaps <b>' + esc(p.looksLike) + '</b>. Boundary check against its "not for" scope...', wait: 900 });
    }
    var sk = p.skill ? byName[p.skill] : null;
    if (!sk) {
      s.push({ tag: 'no match', cls: 'k-warn', html: 'no skill owns this. Falls through to <b>router-playbook</b> "No-Match Behavior": proceed as a plain assistant.', wait: 800 });
      s.push({ tag: 'skipped', cls: 'k-skip', html: 'all ' + fmt(D.skills.length) + ' skill bodies stay on disk <em>(&asymp; ' + fmt(all) + ' tokens not loaded)</em>', wait: 700 });
      s.push({ tag: 'done', cls: 'k-done', html: 'routed with zero skill tokens spent.', wait: 0 });
      return s;
    }
    s.push({ tag: 'match', cls: 'k-match', html: '<b>' + esc(sk.name) + '</b><br>' + esc(shorten(sk.description, 190)), wait: 900 });
    s.push({ tag: 'load', cls: 'k-load', html: 'SKILL.md loaded: ' + fmt(sk.lines) + ' lines <em>(&asymp; ' + fmt(sk.tokens) + ' tokens)</em>', wait: 800 });
    if (sk.outline.length) {
      s.push({ tag: 'workflow', cls: 'k-load', html: 'the skill will now follow:', wait: 450 });
      sk.outline.slice(0, 6).forEach(function (h, i) { s.push({ tag: '', cls: 'sub', html: (i + 1) + '. ' + esc(h), wait: 260 }); });
    }
    var avoided = all - sk.tokens;
    var pct = Math.round(100 * avoided / (on + all));
    s.push({ tag: 'skipped', cls: 'k-skip', html: fmt(D.skills.length - 1) + ' other skills stay on disk <em>(&asymp; ' + fmt(avoided) + ' tokens not loaded, ' + pct + '% less than preloading everything)</em>', wait: 800 });
    s.push({ tag: 'done', cls: 'k-done', html: 'routed.', wait: 0 });
    return s;
  }

  function line(st) {
    var d = document.createElement('div');
    d.className = 'ln ' + st.cls;
    d.innerHTML = '<span class="tag">' + esc(st.tag) + '</span><span class="msg">' + st.html + '</span>';
    return d;
  }

  function speed() { return parseFloat($('#speed').value) || 1; }

  function select(p) {
    current = p;
    mark(p);
    var id = ++runId;
    clearTimeout(timer);
    term.innerHTML = '';
    var plan = steps(p), i = 0;
    var cursor = document.createElement('div');
    cursor.className = 'ln cursor';
    function next() {
      if (id !== runId) return;
      if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
      if (i >= plan.length) { finished(id); return; }
      var st = plan[i++];
      term.appendChild(line(st));
      if (i < plan.length) term.appendChild(cursor);
      term.scrollTop = term.scrollHeight;
      timer = setTimeout(next, reduced ? 0 : st.wait / speed());
    }
    next();
  }

  function finished(id) {
    if (!auto || id !== runId) return;
    timer = setTimeout(function () {
      if (!auto) return;
      var v = visible(), at = v.indexOf(current);
      select(v[(at + 1) % v.length]);
    }, reduced ? 1500 : 3000 / speed());
  }

  function syncAuto() { $('#auto').setAttribute('aria-pressed', auto ? 'true' : 'false'); $('#auto').textContent = auto ? 'Stop auto-play' : 'Auto-play all'; }

  $$('.tabs [role=tab][data-kind]').forEach(function (t) {
    t.addEventListener('click', function () {
      kind = t.getAttribute('data-kind');
      $$('.tabs [role=tab][data-kind]').forEach(function (o) { o.setAttribute('aria-selected', o === t ? 'true' : 'false'); });
      renderList();
      select(visible()[0]);
    });
  });
  $('#replay').addEventListener('click', function () { if (current) select(current); });
  $('#auto').addEventListener('click', function () {
    auto = !auto; syncAuto();
    if (auto && current) select(current);
  });
  renderList();
  select(visible()[0]);

  // ---- Anatomy ----
  function highlight(text) {
    var inFm = false, fence = false;
    return text.split('\n').map(function (l, i) {
      var e = esc(l);
      if (i === 0 && l.trim() === '---') { inFm = true; return '<span class="c-dim">' + e + '</span>'; }
      if (inFm) {
        if (l.trim() === '---') { inFm = false; return '<span class="c-dim">' + e + '</span>'; }
        var m = /^([\w-]+):(.*)$/.exec(l);
        return m ? '<span class="c-key">' + esc(m[1]) + '</span>:<span class="c-str">' + esc(m[2]) + '</span>' : '<span class="c-str">' + e + '</span>';
      }
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return '<span class="c-dim">' + e + '</span>'; }
      if (fence) return '<span class="c-code">' + e + '</span>';
      if (/^#{1,6}\s/.test(l)) return '<span class="c-h">' + e + '</span>';
      return e.replace(/^(\s*)([-*]|\d+\.)(\s)/, '$1<span class="c-b">$2</span>$3');
    }).join('\n');
  }

  function showExcerpt(ex) {
    var sk = byName[ex.name] || { outline: [], lines: ex.totalLines, tokens: 0 };
    $('#exCode').innerHTML = highlight(ex.text);
    var shown = ex.text.split('\n').length;
    $('#exMore').textContent = 'Showing the first ' + shown + ' of ' + fmt(ex.totalLines) + ' lines of ' + ex.name + '/SKILL.md.';
    $('#exName').textContent = ex.name;
    $('#exMeta').textContent = fmt(sk.lines) + ' lines \u00b7 \u2248 ' + fmt(sk.tokens) + ' tokens when loaded';
    $('#exOutline').innerHTML = sk.outline.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('');
    $$('#exTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-n') === ex.name ? 'true' : 'false'); });
  }
  D.excerpts.forEach(function (ex) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('data-n', ex.name); b.textContent = ex.name;
    b.addEventListener('click', function () { showExcerpt(ex); });
    $('#exTabs').appendChild(b);
  });
  if (D.excerpts.length) showExcerpt(D.excerpts[0]);

  // ---- Efficiency ----
  (function () {
    var b = D.budget;
    var full = b.alwaysOnTokens + b.allSkillsTokens;
    var typical = b.alwaysOnTokens + b.catalogTokens + b.avgSkillTokens;
    var save = Math.round(100 * (1 - typical / full));
    function row(title, parts, total) {
      var segs = parts.map(function (p) { return '<div class="seg ' + p.c + '" data-w="' + (100 * p.v / full).toFixed(2) + '" title="' + esc(p.l) + ': ' + fmt(p.v) + ' tokens"></div>'; }).join('');
      var key = parts.map(function (p) { return '<span><i class="sw ' + p.c + '"></i> ' + esc(p.l) + ' ' + fmt(p.v); }).join('</span>') + '</span>';
      return '<div class="barrow"><b>' + esc(title) + ' <span style="color:var(--muted);font-weight:400">&asymp; ' + fmt(total) + ' tokens</span></b><div class="track">' + segs + '</div><div class="legend" style="margin-top:6px">' + key + '</div></div>';
    }
    $('#bars').innerHTML =
      row('Preload every skill, every time', [{ l: 'router', v: b.alwaysOnTokens, c: 'a' }, { l: 'all skill bodies', v: b.allSkillsTokens, c: 'd' }], full) +
      row('This router, a typical request', [{ l: 'router', v: b.alwaysOnTokens, c: 'a' }, { l: 'catalog', v: b.catalogTokens, c: 'b' }, { l: 'one skill', v: b.avgSkillTokens, c: 'c' }], typical) +
      '<div class="legend"><span class="save">About ' + save + '% less context for a typical request.</span><span>"Typical" uses the average workflow skill body. MCP guidance is loaded on top only when a server is used.</span></div>';
    var fill = function () { $$('.seg').forEach(function (s) { s.style.width = s.getAttribute('data-w') + '%'; }); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { fill(); io.disconnect(); } }, { threshold: 0.3 });
      io.observe($('#bars'));
    } else { fill(); }
    D.savePct = save;
  })();

  // ---- Guardrails ----
  [
    ['No agent merges a pull request', 'Not on request, not with auto-merge, not through an API. The agent opens the PR, checks what it can see is green, and hands you the link. A person merges.', ['NoMerge']],
    ['Read-only first', 'Delegated investigations never change anything. Approving, rejecting, aborting or rolling back a deployment needs a confirmation that names the project, environment and deployment.', ['MassdriverOperate']],
    ['Ask the right person, in order', 'Look in your own sources, then the story owner, then the PM. Architecture, security, compatibility, production, scope and release questions go straight to the human.', ['PmProtocol']],
    ['Autonomy is opt-in and bounded', 'Team-agent and overnight "marathon" modes are slash-command only, never part of "install everything", and run inside limits enforced by a ledger script.', ['ExperimentalGating', 'Marathon']],
    ['A baton, not a lost session', 'When one agent runs out of budget, a short HANDOFF.md carries the goal, decisions, files touched and the single next step so the other agent resumes cleanly.', []],
    ['Secrets stay out', 'Credentials are configured per machine and never committed. This site is scanned for credentials every time it is built, and the build stops if anything looks like one.', []]
  ].forEach(function (g) {
    var ev = g[2].filter(function (n) { return testNames[n]; }).map(function (n) { return 'Test-' + n; });
    $('#guardCards').insertAdjacentHTML('beforeend', '<article class="card"><h3>' + esc(g[0]) + '</h3><p>' + esc(g[1]) + '</p>' + (ev.length ? '<span class="ev">Enforced by ' + esc(ev.join(', ')) + '</span>' : '') + '</article>');
  });

  // ---- Rigor ----
  D.tests.forEach(function (t) {
    $('#tests').insertAdjacentHTML('beforeend', '<div class="t"><b>Test-' + esc(t.name) + '</b>' + (t.summary ? '<p>' + esc(t.summary) + '</p>' : '') + '</div>');
  });

  // ---- Catalog ----
  var kindFilter = 'all';
  var kinds = [['all', 'All'], ['workflow', 'Workflow'], ['helper', 'Helper'], ['experimental', 'Experimental']];
  kinds.forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = k[1]; b.setAttribute('aria-pressed', k[0] === 'all' ? 'true' : 'false');
    b.addEventListener('click', function () {
      kindFilter = k[0];
      $$('#kinds button').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      renderCatalog();
    });
    $('#kinds').appendChild(b);
  });
  function renderCatalog() {
    var q = $('#q').value.trim().toLowerCase();
    var rows = D.skills.filter(function (s) {
      return (kindFilter === 'all' || s.kind === kindFilter) && (!q || (s.name + ' ' + s.description).toLowerCase().indexOf(q) >= 0);
    });
    $('#cat').innerHTML = rows.length ? rows.map(function (s) {
      return '<article class="skill"><h3>' + esc(s.name) + '<span class="kind ' + s.kind + '">' + s.kind + '</span></h3>' +
        '<details><summary>' + esc(shorten(s.description, 150)) + '</summary><p>' + esc(s.description) + '</p></details>' +
        '<div class="m">' + fmt(s.lines) + ' lines &middot; &asymp; ' + fmt(s.tokens) + ' tokens' + (s.helperOf.length ? ' &middot; used by ' + esc(s.helperOf.join(', ')) : '') + '</div></article>';
    }).join('') : '<p class="empty">No skills match.</p>';
  }
  $('#q').addEventListener('input', renderCatalog);
  renderCatalog();

  // ---- What this demonstrates ----
  [
    ['Agent and prompt design', fmt(D.stats.skills) + ' focused skills, each with explicit trigger and non-trigger wording, matched on a one-line description instead of a dispatch table.'],
    ['Testing things that are not code', fmt(D.stats.testSuites) + ' suites plus a ' + fmt(D.stats.triggerCases) + '-prompt corpus catch a description edit that would send a request to the wrong skill.'],
    ['Cost-aware architecture', 'Lazy loading, three escalation tiers and a handoff note: about ' + D.savePct + '% less context for a typical request than preloading everything.'],
    ['Tooling and release engineering', 'A scripted installer with a doctor and upgrade migrations, one version source stamped across every document, and ' + fmt(D.stats.releases) + ' changelogged releases.'],
    ['Safety and judgment', 'Hard limits where they matter: nothing merges itself, risky actions need explicit confirmation, and autonomy is opt-in.'],
    ['Communication', 'The same material is written for a skim (this page), for operators (setup and upgrade guides) and for agents (the skills themselves).']
  ].forEach(function (c) {
    $('#demonstrates').insertAdjacentHTML('beforeend', '<article class="card"><h3>' + esc(c[0]) + '</h3><p>' + esc(c[1]) + '</p></article>');
  });
})();
