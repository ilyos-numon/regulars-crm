(function () {
  'use strict';

  var STEPS = [
    { target: function () { return document.getElementById('result'); },
      text: '① 이번 주 챙길 단골 — 평소보다 두 배 넘게 늦어진 단골이 여기 모입니다.' },
    { target: function () { return document.querySelector('[data-testid="candidate-open"]'); },
      // 휴대폰에서는 버튼만 맞추면 그 줄 제목이 위 띠 아래로 잘린다: 줄 전체를 화면 기준으로 삼는다
      anchor: function (t) { return t.closest('li[data-testid="candidate"]') || t; },
      text: '② 자세히 — 누르면 왜 이 손님인지 방문 기록으로 보여 드립니다.' },
    { target: function () { return document.querySelector('[data-testid="tab-briefing"]'); },
      text: '③ 월요일 브리핑 — 매주 월요일 아침 이 목록을 메신저로 받아 보세요.' },
  ];
  var GAP = 14;
  var EDGE = 8;

  var box = null;
  var stepEl = null;
  var countEl = null;
  var nextBtn = null;
  var step = 0;
  var target = null;
  var returnFocus = null;
  var frame = 0;

  function remember() {
    try { window.localStorage.setItem('dg.tour.done', '1'); } catch (e) { /* 기억 없이 동작 */ }
  }

  // 화면에 붙어 있는 막대(휴대폰 위 동작 줄·아래 탭 바)를 피해 쓸 수 있는 세로 범위
  function band() {
    var top = EDGE;
    var bottom = window.innerHeight - EDGE;
    var bars = [document.querySelector('.app-head-actions'), document.querySelector('[data-testid="tabs"]')];
    for (var i = 0; i < bars.length; i++) {
      var el = bars[i];
      if (!el || getComputedStyle(el).position !== 'fixed') continue;
      var r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      if (r.top < window.innerHeight / 2) top = Math.max(top, r.bottom + EDGE);
      else bottom = Math.min(bottom, r.top - EDGE);
    }
    return { top: top, bottom: bottom };
  }

  // 말풍선이 덮으면 안 되는 자리: 대상이 아닌 폴더 탭, 업로드 줄, 읽기 요약 줄, 옆 동작 단추, 화면 제목
  function avoidRects() {
    var els = Array.prototype.slice.call(document.querySelectorAll(
      '.dg-folder-tab, #upload-form, #summary, .app-head, .tab-panel:not([hidden]) > h2, .tab-panel:not([hidden]) > .tab-desc'));
    var out = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el || el === target || el.getClientRects().length === 0) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push(r);
    }
    return out;
  }

  function hits(x, y, w, h, r, pad) {
    return x < r.right + pad && x + w > r.left - pad && y < r.bottom + pad && y + h > r.top - pad;
  }

  function clear(x, y, w, h, avoid) {
    for (var i = 0; i < avoid.length; i++) if (hits(x, y, w, h, avoid[i], EDGE)) return false;
    return true;
  }

  // 첫 자리가 다른 탭·업로드 줄을 덮으면, 네 방향으로 밀어 보며 겹치지 않는 자리 중 대상에 가장 가까운 곳을 고른다
  function dodge(r, w, h, vw, b, avoid) {
    var best = null;
    var sides = ['left', 'right', 'below', 'above'];
    // 다이어리 틀 안에 들어가는 자리를 틀 밖으로 삐져나가는 자리보다 먼저 고른다
    var diary = document.querySelector('.app-diary');
    var f = diary ? diary.getBoundingClientRect() : null;
    for (var s = 0; s < sides.length; s++) {
      var side = sides[s];
      var vertical = side === 'left' || side === 'right';
      var fixed = side === 'left' ? r.left - GAP - w : side === 'right' ? r.right + GAP
        : side === 'below' ? r.bottom + GAP : r.top - GAP - h;
      var slides = vertical ? [r.top + r.height / 2 - h / 2, r.top, r.bottom - h]
        : [r.left + Math.min(r.width, 160) / 2 - 28, r.right - w];
      for (var i = 0; i < avoid.length; i++) {
        var a = avoid[i];
        if (vertical) slides.push(a.bottom + EDGE + 1, a.top - EDGE - 1 - h);
        else slides.push(a.right + EDGE + 1, a.left - EDGE - 1 - w);
      }
      for (var k = 0; k < slides.length; k++) {
        var x = vertical ? fixed : Math.max(EDGE, Math.min(slides[k], vw - EDGE - w));
        var y = vertical ? Math.max(b.top, Math.min(slides[k], b.bottom - h)) : fixed;
        if (x < EDGE || x + w > vw - EDGE || y < b.top || y + h > b.bottom) continue;
        if (hits(x, y, w, h, r, 0) || !clear(x, y, w, h, avoid)) continue;
        var dx = Math.max(0, r.left - (x + w), x - r.right);
        var dy = Math.max(0, r.top - (y + h), y - r.bottom);
        var d = Math.sqrt(dx * dx + dy * dy);
        // 틀 안쪽 점선(6px)에 붙지 않게 12px 안쪽을 틀 안으로 본다
        if (f !== null && (x < f.left + 12 || x + w > f.right - 12 || y < f.top + 12 || y + h > f.bottom - 12)) d += 100000;
        if (best === null || d < best.d) best = { x: x, y: y, side: side, d: d };
      }
    }
    return best;
  }

  function place() {
    frame = 0;
    if (!box) return;
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var w = Math.min(352, vw - EDGE * 2);
    box.style.width = w + 'px';
    var h = box.offsetHeight;
    var b = band();
    var r = target && target.getClientRects().length > 0 ? target.getBoundingClientRect() : null;
    var x;
    var y;
    var side;
    var fits = true;
    if (r === null) {
      x = (vw - w) / 2;
      y = b.top;
      side = 'none';
    } else if (r.bottom + GAP + h <= b.bottom) {
      side = 'below';
      y = r.bottom + GAP;
    } else if (r.top - GAP - h >= b.top) {
      side = 'above';
      y = r.top - GAP - h;
    } else if (r.left - GAP - w >= EDGE) {
      side = 'left';
      x = r.left - GAP - w;
    } else if (r.right + GAP + w <= vw - EDGE) {
      side = 'right';
      x = r.right + GAP;
    } else {
      // 대상이 너무 커서 어느 쪽에도 자리가 없다: 위에 두고, 부른 쪽이 화면을 내린다
      side = 'above';
      y = b.top;
      fits = false;
    }
    if (r !== null && (side === 'below' || side === 'above')) {
      x = r.left + Math.min(r.width, 160) / 2 - 28;
    }
    if (r !== null && (side === 'left' || side === 'right')) {
      y = r.top + r.height / 2 - h / 2;
    }
    x = Math.max(EDGE, Math.min(x, vw - EDGE - w));
    y = Math.max(b.top, Math.min(y, b.bottom - h));
    if (r !== null && fits) {
      var avoid = avoidRects();
      if (!clear(x, y, w, h, avoid)) {
        var alt = dodge(r, w, h, vw, b, avoid);
        if (alt !== null) { x = alt.x; y = alt.y; side = alt.side; }
      }
    }
    box.style.left = Math.round(x) + 'px';
    box.style.top = Math.round(y) + 'px';
    box.setAttribute('data-side', side);
    if (r !== null) {
      var tail = side === 'left' || side === 'right' ? r.top + r.height / 2 - y : r.left + Math.min(r.width, 160) / 2 - x;
      var max = side === 'left' || side === 'right' ? h - 20 : w - 20;
      box.style.setProperty('--tour-tail', Math.round(Math.max(20, Math.min(tail, max))) + 'px');
    }
    return r === null ? 0 : (fits ? 0 : r.top - (b.top + h + GAP));
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(place);
  }

  function clearTarget() {
    if (target) target.classList.remove('is-tour-target');
    target = null;
  }

  function show(n) {
    step = n;
    clearTarget();
    target = STEPS[n].target();
    if (target) {
      target.classList.add('is-tour-target');
      // 휴대폰·중간 화면은 위 동작 줄 바로 아래에 대상 머리를 맞추고(scroll-margin-top) 말풍선을 그 아래에 둔다
      var narrow = window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;
      var anchor = narrow && STEPS[n].anchor ? STEPS[n].anchor(target) : target;
      try { anchor.scrollIntoView({ block: narrow ? 'start' : 'center' }); } catch (e) { anchor.scrollIntoView(); }
      if (narrow) {
        // 위 띠 높이가 scroll-margin 계산과 어긋나도 기준 머리가 띠 아래로 완전히 보이게 맞춘다
        var under = anchor.getBoundingClientRect().top - band().top;
        if (under < 0) window.scrollBy(0, under);
      }
    }
    stepEl.setAttribute('data-step', String(n + 1));
    stepEl.textContent = STEPS[n].text;
    countEl.textContent = String(n + 1) + '/' + String(STEPS.length);
    nextBtn.textContent = n === STEPS.length - 1 ? '마치기' : '다음';
    var shift = place();
    if (shift !== 0) {
      window.scrollBy(0, shift);
      place();
    }
    appear();
  }

  function appear() {
    var el = box;
    var M = window.DGMotion;
    var done = function () { el.style.opacity = '1'; };
    if (!M) { done(); return; }
    M.run(function (g) {
      var from = { opacity: 0, scale: 0.96 };
      var side = el.getAttribute('data-side');
      if (side === 'below') from.y = -6;
      else if (side === 'above') from.y = 6;
      else if (side === 'left') from.x = 6;
      else if (side === 'right') from.x = -6;
      g.fromTo(el, from, {
        opacity: 1, x: 0, y: 0, scale: 1, duration: 0.3, ease: 'expo.out', overwrite: 'auto',
        onComplete: function () { g.set(el, { clearProps: 'transform' }); },
      });
    }, done);
  }

  function onKey(ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      stop(true);
    }
  }

  function build() {
    box = document.createElement('div');
    box.className = 'tour';
    box.setAttribute('data-testid', 'tour');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '처음 둘러보기');

    var head = document.createElement('p');
    head.className = 'tour-head';
    var label = document.createElement('span');
    label.textContent = '처음 둘러보기';
    countEl = document.createElement('span');
    countEl.className = 'tour-count';
    countEl.setAttribute('data-testid', 'tour-count');
    head.appendChild(label);
    head.appendChild(countEl);

    stepEl = document.createElement('p');
    stepEl.className = 'tour-step';
    stepEl.setAttribute('data-testid', 'tour-step');
    stepEl.setAttribute('aria-live', 'polite');

    var row = document.createElement('div');
    row.className = 'tour-actions';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'secondary';
    closeBtn.setAttribute('data-testid', 'tour-close');
    closeBtn.textContent = '닫기';
    closeBtn.addEventListener('click', function () { stop(true); });
    nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.setAttribute('data-testid', 'tour-next');
    nextBtn.addEventListener('click', function () {
      if (step >= STEPS.length - 1) stop(true);
      else show(step + 1);
      if (nextBtn) nextBtn.focus();
    });
    row.appendChild(closeBtn);
    row.appendChild(nextBtn);

    box.appendChild(head);
    box.appendChild(stepEl);
    box.appendChild(row);
    document.body.appendChild(box);
  }

  // 화면이 홈이 아니면 홈 탭으로 먼저 넘긴다(라우터가 처리)
  function ensureHome(then) {
    var home = document.getElementById('panel-home');
    var tab = document.querySelector('[data-testid="tab-home"]');
    if (home && home.hidden && tab) {
      tab.click();
      setTimeout(then, 0);
    } else {
      then();
    }
  }

  function start() {
    if (box) stop(false);
    returnFocus = document.activeElement;
    ensureHome(function () {
      if (box) stop(false);
      build();
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', schedule);
      window.addEventListener('scroll', schedule, true);
      show(0);
      nextBtn.focus({ preventScroll: true });
    });
  }

  function stop(keep) {
    if (keep) remember();
    clearTarget();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
    var had = !!box;
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
    stepEl = null;
    countEl = null;
    nextBtn = null;
    if (had && keep) {
      var back = returnFocus && document.contains(returnFocus) && returnFocus !== document.body
        ? returnFocus : document.querySelector('[data-testid="tour-replay"]');
      if (back && !back.hidden && typeof back.focus === 'function') back.focus({ preventScroll: true });
    }
    returnFocus = null;
  }

  window.DGTour = {
    start: start,
    stop: stop,
    isOpen: function () { return !!box; },
  };
})();
