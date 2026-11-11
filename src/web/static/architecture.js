/* 만든 방법 칸의 구조 그림: 매출 기록이 화면과 브리핑이 되기까지를 코드로 그린 SVG.
   넓으면 한 줄로, 좁으면 세로로 그린다. 기본 상태가 완성된 그림이고, 등장 모션은 landing.js 가 건다. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var ROW_MIN = 960; // 이 폭 이상이면 한 줄 그림

  var NODES = [
    { key: 'csv', title: '매출 CSV', sub: ['거래일시·카드번호', '금액·상품명'] },
    { key: 'upload', title: '업로드', sub: ['카드번호 해시', '+ 끝 두 자리만 저장'], one: '카드번호 해시 + 끝 두 자리만 저장' },
    { key: 'rhythm', title: '손님별 계산', sub: ['평소 방문 간격', '지연 배수 2.0 기준'] },
    { key: 'adjust', title: '보정 단계', sub: ['공휴일·비 온 날', '사장님 메모'] },
    { key: 'features', title: '기능 8개', sub: ['브리핑·복귀 확인', '날씨·리뷰·안부 문구'] },
    { key: 'screens', title: '화면과 브리핑', sub: ['챙길 단골 목록', '월요일 09:00 브리핑'] },
  ];

  var GROUPS = [
    { label: '기록 받기', from: 0, to: 1 },
    { label: '늦은 단골 판단', from: 2, to: 3, mark: true },
    { label: '알려 드리기', from: 4, to: 5 },
  ];

  var LABEL = '매출 CSV가 업로드에서 카드번호 해시와 끝 두 자리로 바뀌고, 손님별 평소 간격과 지연 배수를 잰 뒤 공휴일·비·메모 보정을 거쳐, 기능 8개가 화면과 월요일 브리핑으로 알려 드리는 흐름입니다.';

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(n);
    return n;
  }

  function text(parent, cls, x, y, value, anchor) {
    var t = el('text', { class: cls, x: x, y: y, 'text-anchor': anchor || 'start' }, parent);
    t.textContent = value;
    return t;
  }

  // 노드 자리: 한 줄(row) 이나 세로(column)
  function layout(width) {
    var row = width >= ROW_MIN;
    var boxes = [];
    var frames = [];
    var w, h, vbW, vbH;
    if (row) {
      var pad = 12, gap = 34, labelH = 30;
      vbW = width;
      w = (vbW - pad * 2 - gap * 5) / 6;
      h = 92;
      NODES.forEach(function (n, i) { boxes.push({ x: pad + i * (w + gap), y: labelH + 14, w: w, h: h }); });
      vbH = labelH + 14 + h + 16;
      GROUPS.forEach(function (g) {
        var a = boxes[g.from], b = boxes[g.to];
        frames.push({ x: a.x - 8, y: a.y - 10, w: b.x + b.w - a.x + 16, h: h + 20, lx: a.x - 8, ly: labelH - 2 });
      });
    } else {
      var side = 14, nodeGap = 30, groupGap = 30, labelGap = 34, y = 8;
      vbW = Math.max(280, Math.min(width, 480));
      w = vbW - side * 2;
      h = 64;
      GROUPS.forEach(function (g, gi) {
        if (gi > 0) y += groupGap;
        var top = y;
        y += labelGap;
        for (var i = g.from; i <= g.to; i++) {
          if (i > g.from) y += nodeGap;
          boxes[i] = { x: side, y: y, w: w, h: h };
          y += h;
        }
        y += 10;
        frames.push({ x: side - 8, y: top + labelGap - 10, w: w + 16, h: y - (top + labelGap - 10), lx: side - 8, ly: top + 16 });
      });
      vbH = y + 8;
    }
    return { row: row, boxes: boxes, frames: frames, w: vbW, h: vbH };
  }

  function linkPath(a, b, row) {
    if (row) {
      var y = a.y + a.h / 2;
      return { d: 'M' + (a.x + a.w + 4) + ' ' + y + ' H' + (b.x - 6), hx: b.x - 6, hy: y, dir: 'right' };
    }
    var x = a.x + a.w / 2;
    // 다른 묶음으로 넘어가는 선은 묶음 사이 틈을 지난다
    return { d: 'M' + x + ' ' + (a.y + a.h + 4) + ' V' + (b.y - 6), hx: x, hy: b.y - 6, dir: 'down' };
  }

  function headPath(p) {
    if (p.dir === 'right') return 'M' + (p.hx - 6) + ' ' + (p.hy - 5) + ' L' + p.hx + ' ' + p.hy + ' L' + (p.hx - 6) + ' ' + (p.hy + 5);
    return 'M' + (p.hx - 5) + ' ' + (p.hy - 6) + ' L' + p.hx + ' ' + p.hy + ' L' + (p.hx + 5) + ' ' + (p.hy - 6);
  }

  function draw(container) {
    var width = Math.round(container.clientWidth || container.getBoundingClientRect().width || 360);
    var L = layout(width);
    var svg = el('svg', {
      class: 'lp-arch' + (L.row ? ' lp-arch--row' : ' lp-arch--column'),
      viewBox: '0 0 ' + L.w + ' ' + Math.round(L.h),
      role: 'img',
      'aria-label': LABEL,
      'data-layout': L.row ? 'row' : 'column',
    });

    var frameLayer = el('g', { class: 'lp-arch-groups' }, svg);
    GROUPS.forEach(function (g, i) {
      var f = L.frames[i];
      var fg = el('g', { class: 'lp-arch-group' + (g.mark ? ' lp-arch-group--mark' : '') }, frameLayer);
      el('rect', { x: f.x, y: f.y, width: f.w, height: f.h, rx: 14 }, fg);
      text(fg, 'lp-arch-group-label', f.lx + 2, f.ly, g.label);
    });

    var linkLayer = el('g', { class: 'lp-arch-links' }, svg);
    var links = [];
    for (var i = 0; i < NODES.length - 1; i++) {
      var p = linkPath(L.boxes[i], L.boxes[i + 1], L.row);
      links.push(el('path', { class: 'lp-arch-link', d: p.d, 'data-link': NODES[i].key + '-' + NODES[i + 1].key }, linkLayer));
      el('path', { class: 'lp-arch-head', d: headPath(p) }, linkLayer);
    }

    var nodeLayer = el('g', { class: 'lp-arch-nodes' }, svg);
    var nodes = NODES.map(function (n, i) {
      var b = L.boxes[i];
      var g = el('g', { class: 'lp-arch-node', 'data-node': n.key }, nodeLayer);
      el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10 }, g);
      var cx = b.x + 14;
      if (L.row) {
        text(g, 'lp-arch-title', cx, b.y + 28, n.title);
        n.sub.forEach(function (s, k) { text(g, 'lp-arch-sub', cx, b.y + 54 + k * 20, s); });
      } else {
        text(g, 'lp-arch-title', cx, b.y + 26, n.title);
        text(g, 'lp-arch-sub', cx, b.y + 48, n.one || n.sub.join(' · '));
      }
      return g;
    });

    container.textContent = '';
    container.appendChild(svg);
    return { svg: svg, nodes: nodes, links: links, row: L.row };
  }

  // 폭이 한 줄/세로 경계를 넘으면 완성된 그림으로 다시 그린다
  function watch(container, current) {
    if (container.__dgArchWatch) { container.__dgArchWatch.row = current.row; return; }
    var state = { row: current.row, timer: 0 };
    container.__dgArchWatch = state;
    window.addEventListener('resize', function () {
      clearTimeout(state.timer);
      state.timer = setTimeout(function () {
        var row = (container.clientWidth || 0) >= ROW_MIN;
        if (row !== state.row) state.row = draw(container).row;
      }, 150);
    });
  }

  function render(container) {
    if (!container) return null;
    var r = draw(container);
    watch(container, r);
    return { svg: r.svg, nodes: r.nodes, links: r.links };
  }

  window.DGArchitecture = { render: render };
})();
