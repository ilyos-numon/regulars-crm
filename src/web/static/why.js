(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DAY = 86400000;
  var H = 188;
  var PAD = 14;
  var Y = { thrLabel: 18, thrTop: 26, thrBottom: 116, usualLabel: 46, usual: 58, axis: 80, bar: 96, exLabel: 132, gapLabel: 154, date: 178 };
  var KIND_LABEL = { holiday: '연휴', rain: '비' };

  var current = null; // { key, width, candidate, asOf, tl }

  function dayNum(s) {
    var p = String(s).split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY);
  }

  function shortDate(n) {
    var d = new Date(n * DAY);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(node);
    return node;
  }

  function text(parent, x, y, str, cls, anchor) {
    var t = el('text', { x: x, y: y, class: cls, 'text-anchor': anchor || 'middle' }, parent);
    t.textContent = str;
    return t;
  }

  // 글자 폭 대략값(라벨 13px, 한글 한 자 ≈ 13, 숫자·기호 ≈ 7.5)
  function textWidth(str) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += str.charCodeAt(i) > 0x2e80 ? 13 : 7.5;
    return w;
  }

  // 오른쪽·왼쪽 가장자리에서 글자가 잘리지 않게 기준점을 고른다
  function anchorFor(x, str, W) {
    var half = textWidth(str) / 2;
    if (x - half < 2) return { x: Math.max(2, x - 4), anchor: 'start' };
    if (x + half > W - 2) return { x: Math.min(W - 2, x + 4), anchor: 'end' };
    return { x: x, anchor: 'middle' };
  }

  function summaryText(c) {
    var avg = String(c.avgIntervalDays);
    var n = c.timeline.excludedDays.length;
    var head = '평소 ' + avg + '일마다 오시던 분이 ' + String(c.daysSinceLast) + '일째 안 오셨습니다. ';
    if (n > 0) {
      var adj = (Math.round((c.daysSinceLast - n) / c.avgIntervalDays * 10) / 10).toFixed(1);
      return head + '비·연휴 ' + String(n) + '일을 빼도 ' + adj + '배로, 평소의 2배를 넘었습니다.';
    }
    return head + '평소의 ' + String(c.delayRatio) + '배로, 2배를 넘었습니다.';
  }

  function clear(container) {
    if (current && current.tl) current.tl.kill();
    current = null;
    container.textContent = '';
    container.hidden = true;
  }

  function draw(container, c, asOf, W) {
    var tl = c.timeline;
    var avg = Number(c.avgIntervalDays);
    var visits = tl.visitDays.slice(-6).map(dayNum);
    var last = dayNum(c.lastVisit);
    var now = dayNum(asOf || c.lastVisit);
    var thr = last + 2 * avg;
    var d0 = visits.length > 0 ? Math.min(visits[0], last) : last;
    var d1 = Math.max(now, Math.ceil(thr)) + 2;
    var span = Math.max(1, d1 - d0);
    var inner = W - PAD * 2;
    var perDay = inner / span;
    function x(d) { return PAD + (d - d0) * perDay; }

    var svg = el('svg', {
      'data-testid': 'why-chart', 'aria-hidden': 'true', focusable: 'false',
      viewBox: '0 0 ' + W + ' ' + H, width: '100%', class: 'why-chart',
    });

    // 시간 축: 점선 한 줄 + 주 단위 눈금
    var axis = el('g', { class: 'why-axis' }, svg);
    el('line', { x1: PAD, y1: Y.axis, x2: W - PAD, y2: Y.axis, class: 'why-axis-line' }, axis);
    for (var w = last; w >= d0; w -= 7) el('line', { x1: x(w), y1: Y.axis - 5, x2: x(w), y2: Y.axis + 5, class: 'why-week' }, axis);
    for (var w2 = last + 7; w2 <= d1; w2 += 7) el('line', { x1: x(w2), y1: Y.axis - 5, x2: x(w2), y2: Y.axis + 5, class: 'why-week' }, axis);

    // 지금 공백: 마지막 방문에서 오늘까지 다홍 막대
    var gap = el('g', { 'data-testid': 'why-gap', class: 'why-gap' }, svg);
    var gx0 = x(last);
    var gx1 = Math.max(gx0 + 2, x(now));
    var bar = el('rect', { x: gx0, y: Y.bar, width: gx1 - gx0, height: 12, rx: 6, class: 'why-gap-bar' }, gap);
    var gapStr = '지금 ' + String(c.daysSinceLast) + '일째';
    var gapPos = gx1 - textWidth(gapStr) < 2 ? { x: Math.max(2, gx0), anchor: 'start' } : { x: gx1, anchor: 'end' };
    var gapLabel = text(gap, gapPos.x, Y.gapLabel, gapStr, 'why-label why-label-late', gapPos.anchor);

    // 뺀 날: 막대 위에 점선 칸으로 비워 둔다. 라벨은 가까운 날끼리 묶어서 하나
    var exGroups = [];
    var cellW = Math.max(4, perDay);
    var clusters = [];
    var days = tl.excludedDays;
    for (var i = 0; i < days.length; i++) {
      var dx = x(dayNum(days[i].date));
      var g = el('g', { 'data-testid': 'why-excluded', 'data-kind': days[i].kind, class: 'why-excluded' }, svg);
      el('rect', { x: dx - cellW / 2, y: Y.bar - 3, width: cellW, height: 18, rx: 1.5, class: 'why-ex-cell why-ex-' + days[i].kind }, g);
      exGroups.push(g);
      var prev = clusters[clusters.length - 1];
      if (prev && prev.kind === days[i].kind && dx - prev.x1 <= 40) {
        prev.x1 = dx;
      } else {
        clusters.push({ kind: days[i].kind, x0: dx, x1: dx, g: g });
      }
    }
    var lastRight = -Infinity;
    for (var k = 0; k < clusters.length; k++) {
      var cl = clusters[k];
      var label = KIND_LABEL[cl.kind] || '';
      var pos = anchorFor((cl.x0 + cl.x1) / 2, label, W);
      var tw = textWidth(label);
      var left = pos.anchor === 'start' ? pos.x : pos.anchor === 'end' ? pos.x - tw : pos.x - tw / 2;
      if (left < lastRight + 6) continue;
      lastRight = left + tw;
      el('line', { x1: (cl.x0 + cl.x1) / 2, y1: Y.bar + 16, x2: (cl.x0 + cl.x1) / 2, y2: Y.exLabel - 12, class: 'why-ex-tick' }, cl.g);
      text(cl.g, pos.x, Y.exLabel, label, 'why-label why-label-soft', pos.anchor);
    }

    // 평소 간격 괄호: 마지막 방문 → 그다음 오셨어야 할 날
    var usual = el('g', { 'data-testid': 'why-usual', class: 'why-usual' }, svg);
    var ux0 = x(last);
    var ux1 = x(last + avg);
    el('path', { d: 'M' + ux0 + ' ' + (Y.usual + 7) + 'V' + Y.usual + 'H' + ux1 + 'V' + (Y.usual + 7), class: 'why-usual-line' }, usual);
    var uStr = '평소 ' + String(c.avgIntervalDays) + '일';
    var uPos = anchorFor((ux0 + ux1) / 2, uStr, W);
    text(usual, uPos.x, Y.usualLabel, uStr, 'why-label', uPos.anchor);

    // 방문 점과 그 사이 리듬(점선 고리)
    var rhythm = el('g', { class: 'why-rhythm' }, svg);
    var hops = [];
    for (var h = 1; h < visits.length; h++) {
      var a = x(visits[h - 1]);
      var b = x(visits[h]);
      hops.push(el('path', { d: 'M' + a + ' ' + (Y.axis - 7) + 'Q' + ((a + b) / 2) + ' ' + (Y.axis - 24) + ' ' + b + ' ' + (Y.axis - 7), class: 'why-hop' }, rhythm));
    }
    var dots = [];
    for (var v = 0; v < visits.length; v++) {
      dots.push(el('circle', {
        'data-testid': 'why-visit', cx: x(visits[v]), cy: Y.axis, r: visits[v] === last ? 7 : 6,
        class: visits[v] === last ? 'why-visit why-visit-last' : 'why-visit',
      }, svg));
    }

    // 기준선: 평소의 2배가 되는 날
    var threshold = el('g', { 'data-testid': 'why-threshold', class: 'why-threshold' }, svg);
    var tx = x(thr);
    var thrLine = el('line', { x1: tx, y1: Y.thrTop, x2: tx, y2: Y.thrBottom, class: 'why-thr-line' }, threshold);
    var tPos = anchorFor(tx, '평소의 2배', W);
    text(threshold, tPos.x, Y.thrLabel, '평소의 2배', 'why-label why-label-strong', tPos.anchor);

    // 날짜 줄: 첫 방문 · 마지막 방문 · 오늘
    var dates = el('g', { class: 'why-dates' }, svg);
    var firstX = x(visits.length > 0 ? visits[0] : last);
    text(dates, firstX, Y.date, shortDate(visits.length > 0 ? visits[0] : last), 'why-label why-label-soft', 'start');
    var todayStr = '오늘 ' + shortDate(now);
    var todayX = x(now);
    var todayPos = todayX + textWidth(todayStr) / 2 > W - 2 ? { x: W - 2, anchor: 'end' } : { x: todayX, anchor: 'middle' };
    text(dates, todayPos.x, Y.date, todayStr, 'why-label why-label-soft', todayPos.anchor);
    var lx = x(last);
    var lastStr = shortDate(last);
    var todayLeft = todayPos.anchor === 'end' ? todayPos.x - textWidth(todayStr) : todayPos.x - textWidth(todayStr) / 2;
    if (lx - textWidth(lastStr) / 2 > firstX + textWidth(shortDate(visits[0] || last)) + 8 && lx + textWidth(lastStr) / 2 < todayLeft - 8) {
      text(dates, lx, Y.date, lastStr, 'why-label why-label-soft', 'middle');
    }

    return {
      svg: svg, dots: dots, hops: hops, usual: usual, bar: bar, gapLabel: gapLabel,
      threshold: threshold, thrLine: thrLine, excluded: exGroups,
      geo: { gx0: gx0, gx1: gx1, tx: tx },
    };
  }

  function play(parts) {
    var M = window.DGMotion;
    if (!M) return null;
    var made = null;
    var all = [parts.usual, parts.gapLabel, parts.threshold].concat(parts.dots, parts.hops, parts.excluded);
    M.run(function (g) {
      var geo = parts.geo;
      var grow = 0.9;
      var tl = g.timeline({
        onComplete: function () { g.set(all.concat([parts.bar, parts.thrLine]), { clearProps: 'transform,opacity' }); },
      });
      // 1. 방문 점이 평소 리듬대로 하나씩
      tl.fromTo(parts.dots, { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, {
        scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)', stagger: 0.08,
      });
      tl.fromTo(parts.hops, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.08 }, 0.08);
      // 2. 평소 간격 괄호
      tl.fromTo(parts.usual, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'expo.out' }, '-=0.1');
      // 3. 공백 막대가 마지막 방문에서 오늘까지 자란다 (power1.out)
      var start = tl.duration() + 0.05;
      tl.fromTo(parts.bar, { scaleX: 0, svgOrigin: geo.gx0 + ' ' + Y.bar }, {
        scaleX: 1, duration: grow, ease: 'power1.out',
      }, start);
      tl.fromTo(parts.gapLabel, { opacity: 0 }, { opacity: 1, duration: 0.3 }, start + grow * 0.6);
      // 4. 막대가 기준선을 지나는 순간 기준선이 한 번 튄다
      var f = Math.min(1, Math.max(0, (geo.tx - geo.gx0) / Math.max(1, geo.gx1 - geo.gx0)));
      var cross = start + grow * (1 - Math.sqrt(1 - f));
      tl.fromTo(parts.threshold, { opacity: 0.35 }, { opacity: 1, duration: 0.15 }, cross);
      tl.to(parts.thrLine, { scaleY: 1.18, svgOrigin: geo.tx + ' ' + Y.thrBottom, duration: 0.12, ease: 'power2.out' }, cross);
      tl.to(parts.thrLine, { scaleY: 1, svgOrigin: geo.tx + ' ' + Y.thrBottom, duration: 0.5, ease: 'elastic.out(1, 0.4)' }, cross + 0.12);
      // 5. 뺀 날 표시: 처음부터 옅게 자리에 있고(판단의 일부), 막대가 다 자라면 또렷해진다
      if (parts.excluded.length > 0) {
        tl.fromTo(parts.excluded, { opacity: 0.4 }, { opacity: 1, duration: 0.35, ease: 'expo.out', stagger: 0.04, immediateRender: true }, start + grow + 0.1);
      }
      made = tl;
    }, function () {
      for (var i = 0; i < all.length; i++) all[i].style.opacity = '1';
    });
    return made;
  }

  function render(container, candidate, asOf) {
    if (!container) return;
    var c = candidate;
    if (!c || !c.timeline || !c.timeline.visitDays || !c.timeline.excludedDays || !c.avgIntervalDays || !c.lastVisit) {
      clear(container);
      return;
    }
    var key = String(c.customerId) + '|' + String(asOf);
    var fresh = !current || current.key !== key || !container.querySelector('[data-testid="why-chart"]');
    if (current && current.tl) current.tl.kill();

    container.hidden = false;
    container.textContent = '';
    container.classList.add('why');
    var title = document.createElement('h4');
    title.className = 'why-title';
    title.textContent = '왜 이 손님인가';
    container.appendChild(title);

    var W = Math.max(240, Math.floor(container.clientWidth || 320));
    var parts = draw(container, c, asOf, W);
    container.appendChild(parts.svg);

    var p = document.createElement('p');
    p.setAttribute('data-testid', 'why-summary');
    p.className = 'why-summary';
    p.textContent = summaryText(c);
    container.appendChild(p);

    current = { key: key, width: W, candidate: c, asOf: asOf, container: container, tl: fresh ? play(parts) : null };
  }

  // 폭이 바뀌면 움직임 없이 다시 그린다 (글자를 늘 실제 크기로)
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!current || !current.container || current.container.hidden) return;
      var w = Math.floor(current.container.clientWidth || 0);
      if (w > 0 && Math.abs(w - current.width) > 8) render(current.container, current.candidate, current.asOf);
    }, 150);
  });

  window.DGWhy = { render: render };
})();
