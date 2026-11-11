/* 소개 페이지 모션: 미니룸의 하루와 스크롤 이야기 5단계.
   모든 모션은 DGMotion.run 하나 안에서 시작한다. CSS 기본 상태가 최종 상태이고,
   처음 숨김은 여기서 gsap.set 으로만 건다. */
(function () {
  'use strict';

  var EASE_OUT = 'expo.out';
  var DAY = 16; // 미니룸 하루 한 바퀴(초)

  // 단골마다 자리를 비우는 시간 [나감, 돌아옴] — 각자 다른 리듬. 하루 끝엔 모두 자리에 있다.
  var VISITS = {
    1: [[2.0, 4.2], [8.5, 10.4], [13.2, 15.0]],
    3: [[5.0, 8.0]],
    6: [[3.2, 5.6], [11.0, 13.6]],
    7: [[6.8, 9.6]],
    8: [[1.0, 2.8], [9.0, 11.6], [14.0, 15.4]],
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function step(name) { return $('[data-testid="landing-step-' + name + '"]'); }

  var ratioNum = $('.lp-ratio-num');
  var ratioNumText = ratioNum ? ratioNum.textContent : '';

  // 숨기거나 옮길 수 있는 모든 대상 — finalState 가 이것들을 원래대로 돌린다
  function storyTargets() {
    return [].concat(
      $$('.lp-track i'), $$('.lp-gap'), $$('.lp-gap-label'),
      $$('.lp-ratio-fill'), $$('.lp-ratio-line'), $$('.lp-ratio-read .dg-late'),
      $$('.lp-reason-note'), $$('.lp-reason-sum'),
      $$('.lp-message-text'), $$('.lp-message-text p'),
      $$('.lp-guestbook li'), $$('[data-testid="landing-return-stamp"]'),
      $$('.lp-arch-node'), $$('.lp-arch-link'), $$('.lp-arch-head'), $$('.lp-arch-group')
    );
  }

  function finalState() {
    var g = window.gsap;
    if (g) {
      var t = storyTargets();
      g.killTweensOf(t);
      g.set(t, { clearProps: 'all' });
      // SVG 는 transform 속성이 곧 자리이므로 지우지 않고, 움직인 미니미만 제자리·보임으로 돌린다
      var figs = $$('[data-testid="landing-minimi"]');
      g.killTweensOf(figs.concat($$('.mr-clock-h'), $$('.mr-clock-m')));
      figs.forEach(function (f) {
        if (typeof f.__dgY0 === 'number') g.set(f, { y: f.__dgY0, opacity: 1 });
      });
    }
    if (ratioNum) ratioNum.textContent = ratioNumText;
  }

  // ---------- 미니룸의 하루 ----------

  function roomDay(gsap, room) {
    var tl = gsap.timeline({ repeat: -1, defaults: { overwrite: false } });

    // 벽시계: 하루 동안 시침 한 바퀴, 분침 열두 바퀴
    var h = $('.mr-clock-h', room.svg);
    var m = $('.mr-clock-m', room.svg);
    if (h) tl.to(h, { rotation: '+=360', transformOrigin: '0% 100%', duration: DAY, ease: 'none' }, 0);
    if (m) tl.to(m, { rotation: '+=4320', transformOrigin: '50% 100%', duration: DAY, ease: 'none' }, 0);

    // 평소 단골: 각자 리듬대로 일어나 나갔다가 다시 와서 앉는다. 늦은 세 자리는 비어 있다.
    room.minimi.forEach(function (g) {
      if (!g || g.getAttribute('data-late') === 'true') return;
      var visits = VISITS[g.getAttribute('data-seat')];
      if (!visits) return;
      var y0 = gsap.getProperty(g, 'y');
      g.__dgY0 = y0;
      visits.forEach(function (v) {
        tl.to(g, { y: y0 - 10, opacity: 0, duration: 0.35, ease: 'power2.in' }, v[0]);
        tl.fromTo(g, { y: y0 - 16, opacity: 0 }, { y: y0, opacity: 1, duration: 0.6, ease: EASE_OUT, immediateRender: false }, v[1]);
      });
    });
    tl.set({}, {}, DAY); // 하루 길이를 맞춰 반복 이음새를 고정

    // 화면 밖이면 멈춘다
    if (window.ScrollTrigger) {
      window.ScrollTrigger.create({
        trigger: room.svg,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: function (self) { if (self.isActive) tl.play(); else tl.pause(); },
      });
    }
    return tl;
  }

  // ---------- 이야기 5단계 ----------

  function onEnter(gsap, section) {
    return gsap.timeline({ paused: false, scrollTrigger: { trigger: section, start: 'top 75%', once: true } });
  }

  // 1. 리듬: 방문 점이 날짜 순서대로 찍히고, 늦은 손님의 빈 구간이 오늘까지 벌어진다
  function rhythm(gsap) {
    var sec = step('rhythm');
    if (!sec) return;
    var dots = $$('.lp-track i', sec);
    var gaps = $$('.lp-gap', sec);
    var labels = $$('.lp-gap-label', sec);
    gsap.set(dots, { scale: 0, opacity: 0 });
    gsap.set(gaps, { clipPath: 'inset(0 100% 0 0)' });
    gsap.set(labels, { opacity: 0 });

    var tl = onEnter(gsap, sec);
    dots.forEach(function (d) {
      var day = parseFloat(d.style.getPropertyValue('--d')) || 0;
      tl.to(d, { scale: 1, opacity: 1, duration: 0.3, ease: EASE_OUT }, (day / 84) * 1.4);
    });
    tl.to(gaps, { clipPath: 'inset(0 0% 0 0)', duration: 0.7, ease: 'power2.inOut', clearProps: 'clipPath' }, 1.0);
    tl.to(labels, { opacity: 1, duration: 0.25, ease: 'none' }, 1.6);
    tl.add(function () { gsap.set(dots, { clearProps: 'transform,opacity' }); });
  }

  // 2. 빈자리: 늦음 막대가 자라 2배 기준선을 넘는 순간에만 다홍 말이 뜬다 (페이지의 유일한 큰 사건)
  function emptySeat(gsap) {
    var sec = step('empty');
    if (!sec) return;
    var fill = $('.lp-ratio-fill', sec);
    var line = $('.lp-ratio-line', sec);
    var said = $('.lp-ratio-read .dg-late', sec);
    var bar = $('[data-testid="landing-ratio"]', sec);
    if (!fill || !line || !bar) return;

    var ratio = parseFloat(bar.style.getPropertyValue('--ratio')) || 2.92;
    var cross = 2 / ratio; // 막대 폭 중 기준선이 놓인 비율
    var count = { v: 0 };
    var fired = false;

    gsap.set(fill, { scaleX: 0, transformOrigin: '0% 50%' });
    if (said) gsap.set(said, { opacity: 0, y: 8 });
    if (ratioNum) ratioNum.textContent = '0.0배';

    var tl = onEnter(gsap, sec);
    tl.to(fill, {
      scaleX: 1,
      duration: 1.6,
      ease: 'power1.inOut',
      onUpdate: function () {
        if (fired || gsap.getProperty(fill, 'scaleX') < cross) return;
        fired = true;
        gsap.fromTo(line, { scaleY: 1.5 }, { scaleY: 1, duration: 0.5, ease: EASE_OUT, clearProps: 'transform' });
        if (said) gsap.to(said, { opacity: 1, y: 0, duration: 0.6, ease: EASE_OUT, clearProps: 'transform,opacity' });
      },
      clearProps: 'transform',
    }, 0);
    if (ratioNum) {
      tl.to(count, {
        v: ratio,
        duration: 1.6,
        ease: 'power1.inOut',
        onUpdate: function () { ratioNum.textContent = count.v.toFixed(1) + '배'; },
        onComplete: function () { ratioNum.textContent = ratioNumText; },
      }, 0);
    }
  }

  // 3. 근거 쪽지: 접혀 있던 쪽지가 위에서 펼쳐지고, 계산 줄이 뒤따른다
  function reason(gsap) {
    var sec = step('reason');
    if (!sec) return;
    var note = $('.lp-reason-note', sec);
    var sum = $('.lp-reason-sum', sec);
    if (!note) return;
    gsap.set(note, { rotationX: -88, transformPerspective: 700, transformOrigin: '50% 0%', opacity: 0 });
    if (sum) gsap.set(sum, { opacity: 0 });

    var tl = onEnter(gsap, sec);
    tl.to(note, { rotationX: 0, opacity: 1, duration: 0.7, ease: EASE_OUT, clearProps: 'transform,opacity' }, 0);
    if (sum) tl.to(sum, { opacity: 1, duration: 0.3, ease: 'none', clearProps: 'opacity' }, 0.45);
  }

  // 4. 안부 한마디: 쪽지 칸이 열리고 글이 한 줄씩 써진다
  function message(gsap) {
    var sec = step('message');
    if (!sec) return;
    var box = $('.lp-message-text', sec);
    var p = $('.lp-message-text p', sec);
    if (!box || !p) return;
    gsap.set(box, { scale: 0.92, transformOrigin: '0% 0%', opacity: 0 });
    gsap.set(p, { clipPath: 'inset(0 0 100% 0)' });

    var tl = onEnter(gsap, sec);
    tl.to(box, { scale: 1, opacity: 1, duration: 0.45, ease: EASE_OUT, clearProps: 'transform,opacity' }, 0);
    tl.add(function () {
      // 줄 수는 지금 화면 폭에서 잰다
      var lh = parseFloat(getComputedStyle(p).lineHeight) || 28;
      var lines = Math.max(1, Math.round(p.getBoundingClientRect().height / lh));
      var t = gsap.timeline();
      for (var i = 1; i <= lines; i++) {
        var left = 100 - (i / lines) * 100;
        t.to(p, { clipPath: 'inset(0 0 ' + left.toFixed(2) + '% 0)', duration: 0.35, ease: 'power2.out' }, (i - 1) * 0.45);
      }
      t.set(p, { clearProps: 'clipPath' });
    }, 0.3);
  }

  // 5. 돌아왔습니다: 방명록 줄이 차례로 적히고, 마지막에 도장이 찍힌다
  function comeback(gsap) {
    var sec = step('return');
    if (!sec) return;
    var rows = $$('.lp-guestbook li', sec);
    var stamp = $('[data-testid="landing-return-stamp"]', sec);
    gsap.set(rows, { opacity: 0 });
    if (stamp) gsap.set(stamp, { opacity: 0, scale: 1.7 });

    var tl = onEnter(gsap, sec);
    tl.to(rows, { opacity: 1, duration: 0.3, ease: 'none', stagger: 0.12, clearProps: 'opacity' }, 0);
    if (stamp) tl.to(stamp, { opacity: 1, scale: 1, duration: 0.32, ease: 'power4.in', clearProps: 'transform,opacity' }, 0.75);
  }

  // ---------- 구조 그림 ----------

  var archCanvas = $('[data-testid="landing-case-diagram"] .lp-arch-canvas');
  var arch = archCanvas && window.DGArchitecture ? window.DGArchitecture.render(archCanvas) : null;

  // 기록이 한 칸씩 건너가듯: 묶음 틀이 깔리고, 노드가 차례로 놓이며 그 사이 선이 이어진다
  function diagram(gsap) {
    if (!arch || !arch.nodes.length) return;
    var fig = $('[data-testid="landing-case-diagram"]');
    var groups = $$('.lp-arch-group', arch.svg);
    var heads = $$('.lp-arch-head', arch.svg);
    var lens = arch.links.map(function (l) { return l.getTotalLength ? l.getTotalLength() : 40; });

    // 처음 숨김은 타임라인 안에서만(fromTo, 시작 전에는 보이는 그대로) — 상자가 빈 채로 남지 않는다
    var STEP = 0.28;
    var tl = gsap.timeline({ paused: true });
    tl.fromTo(groups, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none', stagger: 0.08, clearProps: 'opacity' }, 0);
    arch.nodes.forEach(function (n, i) {
      var at = 0.15 + i * STEP;
      tl.fromTo(n, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, ease: EASE_OUT, clearProps: 'transform,opacity' }, at);
      if (i < arch.links.length) {
        tl.fromTo(arch.links[i], { strokeDasharray: lens[i], strokeDashoffset: lens[i] },
          { strokeDashoffset: 0, duration: STEP, ease: 'power1.inOut', clearProps: 'strokeDasharray,strokeDashoffset' }, at + 0.12);
        if (heads[i]) tl.fromTo(heads[i], { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none', clearProps: 'opacity' }, at + 0.08 + STEP);
      }
    });
    tl.progress(1); // 시작 전에는 최종 상태(그림이 다 보임) — restart 가 처음부터 다시 그린다
    // 그림 위쪽이 화면 아래 끝에 닿는 순간(또는 #made 로 바로 와서 이미 보일 때) 한 번 그린다
    var played = false;
    function draw() {
      if (played) return;
      played = true;
      tl.restart();
    }
    window.ScrollTrigger.create({ trigger: fig, start: 'top bottom', once: true, onEnter: draw });
    function inView() {
      var r = fig.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }
    if (inView()) draw();
    window.addEventListener('load', function () { if (inView()) draw(); });
    window.addEventListener('hashchange', function () { if (inView()) draw(); });
  }

  // ---------- 목차: 탭으로 칸 이동, 지금 보는 칸 표시 ----------

  function wayfinding() {
    var nav = $('[data-testid="landing-tabs"]');
    if (!nav) return;
    var instant = !window.DGMotion || !window.DGMotion.gsap; // 움직임 줄이기·GSAP 없음이면 즉시 이동
    var spots = $$('a[href="/"], a[href^="#"]', nav).map(function (a) {
      var h = a.getAttribute('href');
      var id = h === '/' ? '' : h.slice(1);
      return { tab: a, id: id, el: id ? document.getElementById(id) : null };
    }).filter(function (s) { return s.id === '' || s.el; });
    if (!spots.length) return;
    var current = null;
    var lock = null;
    var lockTimer = 0;

    function mark(id) {
      if (id === current) return;
      current = id;
      spots.forEach(function (s) {
        var on = s.id === id;
        s.tab.classList.toggle('is-active', on);
        if (on) s.tab.setAttribute('aria-current', s.id === '' ? 'page' : 'location');
        else s.tab.removeAttribute('aria-current');
      });
    }

    // 화면 위쪽 35% 선을 지난 마지막 칸이 지금 보는 칸. 맨 아래까지 내려오면 마지막 칸.
    function seen() {
      var line = window.innerHeight * 0.35;
      var id = '';
      spots.forEach(function (s) { if (s.el && s.el.getBoundingClientRect().top <= line) id = s.id; });
      var doc = document.documentElement;
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 2) id = spots[spots.length - 1].id;
      return id;
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        if (lock === null) mark(seen());
      });
    }

    function release() { lock = null; clearTimeout(lockTimer); mark(seen()); }

    spots.forEach(function (s) {
      s.tab.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (s.id === '' && location.pathname !== '/') return; // 다른 주소에서는 원래대로 이동
        e.preventDefault();
        var behavior = instant ? 'auto' : 'smooth';
        if (s.id === '') window.scrollTo({ top: 0, behavior: behavior });
        else s.el.scrollIntoView({ behavior: behavior, block: 'start' });
        if (history.replaceState) history.replaceState(null, '', s.id ? '#' + s.id : location.pathname + location.search);
        mark(s.id);
        // 미끄러지는 동안 지나치는 칸으로 표시가 흔들리지 않게 잠깐 고정
        lock = s.id;
        clearTimeout(lockTimer);
        lockTimer = setTimeout(release, instant ? 50 : 1200);
      });
    });

    if ('onscrollend' in window) window.addEventListener('scrollend', function () { if (lock !== null) release(); });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    mark(seen());
  }

  wayfinding();

  // ---------- 앱으로 가는 길 ----------

  // '샘플로 바로 보기'로 들어가면 앱이 처음 둘러보기를 띄우도록 표시만 남긴다(주소는 그대로)
  var sampleCta = $('[data-testid="landing-cta-sample"]');
  if (sampleCta) {
    sampleCta.addEventListener('click', function () {
      try { window.sessionStorage.setItem('dg.tour.fromLanding', '1'); } catch (e) { /* 표시 없이 이동 */ }
    });
  }

  // 화면 둘러보기 카드: 빈 앱 대신 예시 가게가 채워진 그 화면으로 연다(링크 주소는 그대로 두고 클릭만 가로챈다)
  $$('[data-testid="landing-screens"] .lp-screen-name a[href^="/app#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      window.location.href = '/app?sample=1' + a.getAttribute('href').replace('/app', '');
    });
  });

  // ---------- 시작 ----------

  function play(gsap) {
    var canvas = $('[data-testid="landing-miniroom"]');
    if (canvas && window.DGMiniroom) roomDay(gsap, window.DGMiniroom.render(canvas));
    if (!window.ScrollTrigger) return; // 스크롤 연결이 없으면 이야기는 보이는 그대로 둔다
    rhythm(gsap);
    emptySeat(gsap);
    reason(gsap);
    message(gsap);
    comeback(gsap);
    diagram(gsap);
  }

  if (window.DGMotion) window.DGMotion.run(play, finalState);
})();
