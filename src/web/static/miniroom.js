/* 소개 페이지 미니룸: 아이소메트릭 가게 방과 단골 미니미를 SVG 로 그린다.
   window.DGMiniroom.render(container) → { svg, minimi, bubbles }
   같은 컨테이너에 다시 부르면 이미 그린 결과를 그대로 돌려준다. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // 화면 크기와 투영
  var VW = 640;
  var VH = 600;
  var U = 40;                    // 바닥 한 칸 = 40
  var C = U * 0.8660254;         // cos 30°
  var S = U * 0.5;               // sin 30°
  var CX = 320;                  // 방 안쪽 모서리 x
  var CY = 244;                  // 방 안쪽 모서리 y (바닥 높이)
  var N = 8;                     // 바닥 8 x 8 칸
  var H = 5.5;                   // 벽 높이
  var T = 0.25;                  // 벽 두께
  var SLAB = 0.4;                // 바닥판 두께

  var INK = '#4a3a33';
  var LINE = '#9fb3c8';

  function P(x, y, z) {
    return [CX + (x - y) * C, CY + (x + y) * S - (z || 0) * U];
  }

  function r1(n) { return Math.round(n * 10) / 10; }

  function pts(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = P(list[i][0], list[i][1], list[i][2]);
      out.push(r1(p[0]) + ',' + r1(p[1]));
    }
    return out.join(' ');
  }

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== undefined && attrs[k] !== null) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function poly(parent, list, attrs) {
    var a = attrs || {};
    a.points = pts(list);
    return el('polygon', a, parent);
  }

  function at(x, y, z) {
    var p = P(x, y, z);
    return 'translate(' + r1(p[0]) + ' ' + r1(p[1]) + ')';
  }

  // 벽 면 위에 평면 좌표(가로 p, 아래로 q, 한 칸 = 40)로 그리기 위한 변환
  function rightWall(parent) {
    var o = P(0, 0, 0);
    return el('g', { transform: 'matrix(0.8660254 0.5 0 1 ' + r1(o[0]) + ' ' + r1(o[1]) + ')' }, parent);
  }
  function leftWall(parent) {
    var o = P(0, 0, 0);
    return el('g', { transform: 'matrix(-0.8660254 0.5 0 1 ' + r1(o[0]) + ' ' + r1(o[1]) + ')' }, parent);
  }
  function frontX(parent, x) {   // x = 일정한 면(방 쪽을 보는 면), 가로는 +y 방향
    var o = P(x, 0, 0);
    return el('g', { transform: 'matrix(-0.8660254 0.5 0 1 ' + r1(o[0]) + ' ' + r1(o[1]) + ')' }, parent);
  }

  // 상자: 위·x 쪽 면·y 쪽 면
  function box(parent, x0, x1, y0, y1, z0, z1, col) {
    var g = el('g', null, parent);
    var stroke = col.stroke || INK;
    var sw = col.sw || 1.2;
    poly(g, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], { fill: col.fx, stroke: stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' });
    poly(g, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], { fill: col.fy, stroke: stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' });
    poly(g, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], { fill: col.top, stroke: stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' });
    return g;
  }

  // ---------- 정의(무늬·그라데이션·그림자) ----------

  function defs(svg) {
    var d = el('defs', null, svg);

    function dots(id, m) {
      var pat = el('pattern', { id: id, width: 22, height: 22, patternUnits: 'userSpaceOnUse', patternTransform: m }, d);
      el('circle', { cx: 5.5, cy: 5.5, r: 2.1, fill: '#ffffff' }, pat);
      el('circle', { cx: 16.5, cy: 16.5, r: 1.5, fill: '#ffffff' }, pat);
    }
    dots('mr-dots-l', 'matrix(-0.8660254 0.5 0 1 0 0)');
    dots('mr-dots-r', 'matrix(0.8660254 0.5 0 1 0 0)');

    var glass = el('linearGradient', { id: 'mr-glass', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    el('stop', { offset: '0', 'stop-color': '#9fd3ec' }, glass);
    el('stop', { offset: '1', 'stop-color': '#e3f4fb' }, glass);

    var shade = el('radialGradient', { id: 'mr-shadow', cx: '50%', cy: '50%', r: '50%' }, d);
    el('stop', { offset: '0', 'stop-color': '#5b6f80', 'stop-opacity': '0.28' }, shade);
    el('stop', { offset: '1', 'stop-color': '#5b6f80', 'stop-opacity': '0' }, shade);

    var f = el('filter', { id: 'mr-lift', x: '-20%', y: '-20%', width: '140%', height: '160%' }, d);
    el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 2.6, 'flood-color': '#7a2a1c', 'flood-opacity': '0.28' }, f);
    return d;
  }

  // ---------- 벽 ----------

  function walls(svg) {
    var g = el('g', { 'class': 'mr-walls' }, svg);

    // 왼쪽 벽(x=0)과 오른쪽 벽(y=0)
    poly(g, [[0, 0, 0], [0, N, 0], [0, N, H], [0, 0, H]], { fill: '#e2f1f8' });
    poly(g, [[0, 0, 0], [0, N, 0], [0, N, H], [0, 0, H]], { fill: 'url(#mr-dots-l)', opacity: 0.85 });
    poly(g, [[0, 0, 0], [N, 0, 0], [N, 0, H], [0, 0, H]], { fill: '#d3e9f3' });
    poly(g, [[0, 0, 0], [N, 0, 0], [N, 0, H], [0, 0, H]], { fill: 'url(#mr-dots-r)', opacity: 0.85 });

    // 허리 판벽과 걸레받이
    var wz = 1.5;
    poly(g, [[0, 0, 0], [0, N, 0], [0, N, wz], [0, 0, wz]], { fill: '#fffaf1' });
    poly(g, [[0, 0, 0], [N, 0, 0], [N, 0, wz], [0, 0, wz]], { fill: '#f5ecdd' });
    var lw = leftWall(g);
    var rw = rightWall(g);
    for (var i = 1; i < N * 2; i++) {
      el('line', { x1: i * U / 2, y1: -wz * U + 6, x2: i * U / 2, y2: -8, stroke: '#e6d6bd', 'stroke-width': 1.2 }, lw);
      el('line', { x1: i * U / 2, y1: -wz * U + 6, x2: i * U / 2, y2: -8, stroke: '#e2d0b4', 'stroke-width': 1.2 }, rw);
    }
    [lw, rw].forEach(function (w) {
      el('rect', { x: 0, y: -wz * U - 3, width: N * U, height: 5, fill: '#ffffff', stroke: '#d6c09c', 'stroke-width': 1 }, w);
      el('rect', { x: 0, y: -7, width: N * U, height: 7, fill: '#d9bc93' }, w);
    });

    windowOn(rw, 0.8, 2.7, 2.0, 4.3);
    windowOn(rw, 3.5, 5.4, 2.0, 4.3);
    doorOn(rw, 6.35, 7.6, 2.75);
    menuBoard(lw);
    clock(lw);

    // 벽 윗면(두께)과 앞쪽 끝면
    poly(g, [[0, 0, H], [0, N, H], [-T, N, H], [-T, -T, H]], { fill: '#ffffff', stroke: LINE, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    poly(g, [[0, 0, H], [N, 0, H], [N, -T, H], [-T, -T, H]], { fill: '#ffffff', stroke: LINE, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    poly(g, [[0, N, -SLAB], [-T, N, -SLAB], [-T, N, H], [0, N, H]], { fill: '#eef5f9', stroke: LINE, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    poly(g, [[N, 0, -SLAB], [N, -T, -SLAB], [N, -T, H], [N, 0, H]], { fill: '#e3edf3', stroke: LINE, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    // 안쪽 모서리 선
    var a = P(0, 0, 0);
    var b = P(0, 0, H);
    el('line', { x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), stroke: '#b9cddc', 'stroke-width': 1.2 }, g);
    poly(g, [[0, 0, 0], [0, N, 0], [0, N, H], [0, 0, H]], { fill: 'none', stroke: LINE, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    poly(g, [[0, 0, 0], [N, 0, 0], [N, 0, H], [0, 0, H]], { fill: 'none', stroke: LINE, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });

    shelf(g);
    return g;
  }

  var clipCount = 0;
  function windowOn(w, x0, x1, z0, z1) {
    var px = x0 * U;
    var py = -z1 * U;
    var pw = (x1 - x0) * U;
    var ph = (z1 - z0) * U;
    el('rect', { x: px - 5, y: py - 5, width: pw + 10, height: ph + 10, rx: 5, fill: '#ffffff', stroke: LINE, 'stroke-width': 1.3 }, w);
    var id = 'mr-glass-clip-' + (++clipCount);
    var cp = el('clipPath', { id: id }, w);
    el('rect', { x: px, y: py, width: pw, height: ph, rx: 2 }, cp);
    var inner = el('g', { 'clip-path': 'url(#' + id + ')' }, w);
    el('rect', { x: px, y: py, width: pw, height: ph, fill: 'url(#mr-glass)' }, inner);
    // 바깥 풍경: 구름 한 덩이와 먼 지붕
    el('ellipse', { cx: px + pw * 0.3, cy: py + ph * 0.32, rx: 13, ry: 6, fill: '#ffffff' }, inner);
    el('ellipse', { cx: px + pw * 0.3 + 11, cy: py + ph * 0.28, rx: 10, ry: 7, fill: '#ffffff' }, inner);
    el('path', { d: 'M' + px + ' ' + (py + ph) + ' L' + px + ' ' + (py + ph - 16) + ' L' + (px + pw * 0.35) + ' ' + (py + ph - 26) + ' L' + (px + pw * 0.7) + ' ' + (py + ph - 14) + ' L' + (px + pw) + ' ' + (py + ph - 20) + ' L' + (px + pw) + ' ' + (py + ph) + 'Z', fill: '#bcdcb1' }, inner);
    el('line', { x1: px + pw * 0.62, y1: py + 6, x2: px + pw * 0.42, y2: py + ph * 0.55, stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.55 }, inner);
    // 창살
    el('rect', { x: px + pw / 2 - 2, y: py, width: 4, height: ph, fill: '#ffffff' }, w);
    el('rect', { x: px, y: py + ph * 0.42 - 2, width: pw, height: 4, fill: '#ffffff' }, w);
    el('rect', { x: px, y: py, width: pw, height: ph, rx: 2, fill: 'none', stroke: LINE, 'stroke-width': 1 }, w);
    // 창턱
    el('rect', { x: px - 9, y: py + ph + 4, width: pw + 18, height: 6, rx: 2, fill: '#ffffff', stroke: LINE, 'stroke-width': 1.2 }, w);
  }

  function doorOn(w, x0, x1, z1) {
    var px = x0 * U;
    var pw = (x1 - x0) * U;
    var ph = z1 * U;
    el('rect', { x: px - 5, y: -ph - 5, width: pw + 10, height: ph + 5, rx: 4, fill: '#ffffff', stroke: LINE, 'stroke-width': 1.3 }, w);
    el('rect', { x: px, y: -ph, width: pw, height: ph, rx: 2, fill: '#86bfdc', stroke: '#5f93b0', 'stroke-width': 1.2 }, w);
    el('rect', { x: px + 7, y: -ph + 8, width: pw - 14, height: ph * 0.42, rx: 3, fill: 'url(#mr-glass)', stroke: '#5f93b0', 'stroke-width': 1 }, w);
    el('rect', { x: px + 7, y: -ph * 0.42, width: pw - 14, height: ph * 0.3, rx: 3, fill: 'none', stroke: '#6ea7c6', 'stroke-width': 1.2 }, w);
    el('circle', { cx: px + pw - 9, cy: -ph * 0.48, r: 2.6, fill: '#f6d27a', stroke: INK, 'stroke-width': 0.8 }, w);
    // 문 위 작은 종
    el('path', { d: 'M' + (px + pw / 2 - 5) + ' ' + (-ph - 9) + ' q5 -12 10 0 z', fill: '#f6d27a', stroke: INK, 'stroke-width': 0.9 }, w);
  }

  function menuBoard(w) {
    // 카운터 위 메뉴판(글자 없이 분필 줄)
    var x = 1.15 * U;
    var y = -4.45 * U;
    var bw = 2.3 * U;
    var bh = 1.6 * U;
    el('rect', { x: x - 5, y: y - 5, width: bw + 10, height: bh + 10, rx: 4, fill: '#d9bc93', stroke: '#a98256', 'stroke-width': 1.2 }, w);
    el('rect', { x: x, y: y, width: bw, height: bh, rx: 2, fill: '#3f524c' }, w);
    var rows = [0.24, 0.42, 0.6, 0.78];
    for (var i = 0; i < rows.length; i++) {
      var ry = y + bh * rows[i];
      el('line', { x1: x + 10, y1: ry, x2: x + bw * (0.55 + (i % 2) * 0.1), y2: ry, stroke: '#f3efe4', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.85 }, w);
      el('circle', { cx: x + bw - 14, cy: ry, r: 2.2, fill: i === 1 ? '#f28c28' : '#f3efe4', opacity: 0.9 }, w);
    }
    el('line', { x1: x + 10, y1: y + 9, x2: x + bw * 0.4, y2: y + 9, stroke: '#f6d27a', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, w);
  }

  function clock(w) {
    var cx = 4.7 * U;
    var cy = -4.2 * U;
    var g = el('g', { 'class': 'mr-clock' }, w);
    el('circle', { cx: cx, cy: cy, r: 17, fill: '#ffffff', stroke: INK, 'stroke-width': 1.4 }, g);
    el('circle', { cx: cx, cy: cy, r: 13.5, fill: 'none', stroke: '#f28c28', 'stroke-width': 1.6 }, g);
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6;
      var l = i % 3 === 0 ? 3.4 : 1.8;
      el('line', { x1: r1(cx + Math.sin(a) * 11.5), y1: r1(cy - Math.cos(a) * 11.5), x2: r1(cx + Math.sin(a) * (11.5 - l)), y2: r1(cy - Math.cos(a) * (11.5 - l)), stroke: INK, 'stroke-width': 1 }, g);
    }
    el('line', { 'class': 'mr-clock-h', x1: cx, y1: cy, x2: cx + 5, y2: cy - 4, stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    el('line', { 'class': 'mr-clock-m', x1: cx, y1: cy, x2: cx, y2: cy - 9.5, stroke: INK, 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g);
    el('circle', { cx: cx, cy: cy, r: 1.6, fill: INK }, g);
  }

  function shelf(parent) {
    var g = el('g', { 'class': 'mr-shelf' }, parent);
    var z = 2.75;
    var y0 = 5.3;
    var y1 = 7.2;
    // 받침 두 개
    [y0 + 0.25, y1 - 0.25].forEach(function (y) {
      poly(g, [[0, y, z], [0.32, y, z], [0, y, z - 0.35]], { fill: '#c9a477', stroke: '#a98256', 'stroke-width': 1 });
    });
    box(g, 0, 0.36, y0, y1, z, z + 0.1, { top: '#f0d9b5', fx: '#d9bc93', fy: '#c9a477', stroke: '#a98256', sw: 1 });
    // 원두 병 셋과 작은 화분
    var jars = [[y0 + 0.4, '#8c5a3c'], [y0 + 0.8, '#c47a45'], [y0 + 1.15, '#6b4226']];
    jars.forEach(function (j) {
      var p = P(0.18, j[0], z + 0.1);
      el('rect', { x: r1(p[0] - 5), y: r1(p[1] - 15), width: 10, height: 15, rx: 2.5, fill: '#f4fbff', stroke: INK, 'stroke-width': 1 }, g);
      el('rect', { x: r1(p[0] - 4), y: r1(p[1] - 9), width: 8, height: 8, rx: 1.5, fill: j[1] }, g);
      el('rect', { x: r1(p[0] - 5.5), y: r1(p[1] - 18), width: 11, height: 4, rx: 1.5, fill: '#d9bc93', stroke: INK, 'stroke-width': 0.9 }, g);
    });
    var pp = P(0.18, y1 - 0.35, z + 0.1);
    leaves(g, pp[0], pp[1] - 10, 0.55);
    el('path', { d: 'M' + r1(pp[0] - 6) + ' ' + r1(pp[1] - 11) + ' h12 l-2 11 h-8 z', fill: '#e8a06a', stroke: INK, 'stroke-width': 1 }, g);
  }

  // ---------- 바닥 ----------

  function floor(svg) {
    var g = el('g', { 'class': 'mr-floor' }, svg);
    // 바닥판 두께
    poly(g, [[N, -T, 0], [N, N, 0], [N, N, -SLAB], [N, -T, -SLAB]], { fill: '#e9d2ab', stroke: '#b99464', 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    poly(g, [[-T, N, 0], [N, N, 0], [N, N, -SLAB], [-T, N, -SLAB]], { fill: '#dcbf90', stroke: '#b99464', 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    for (var x = 0; x < N; x++) {
      for (var y = 0; y < N; y++) {
        poly(g, [[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], {
          fill: (x + y) % 2 === 0 ? '#fdf6e8' : '#e6f1f7',
          stroke: '#e7dcc8',
          'stroke-width': 0.8,
        });
      }
    }
    poly(g, [[0, 0, 0], [N, 0, 0], [N, N, 0], [0, N, 0]], { fill: 'none', stroke: '#b99464', 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    // 창으로 드는 볕
    [[0.8, 2.7], [3.5, 5.4]].forEach(function (w) {
      poly(g, [[w[0] + 0.15, 0.05, 0], [w[1] + 0.15, 0.05, 0], [w[1] + 1.25, 2.3, 0], [w[0] + 1.25, 2.3, 0]], { fill: '#ffffff', opacity: 0.5 });
    });
    // 문 앞 매트
    poly(g, [[6.3, 0.15, 0], [7.65, 0.15, 0], [7.65, 0.85, 0], [6.3, 0.85, 0]], { fill: '#f6c78f', stroke: '#cf6f14', 'stroke-width': 1, 'stroke-dasharray': '3 2' });
    return g;
  }

  function shadow(parent, x, y, rx, ry) {
    var p = P(x, y, 0);
    el('ellipse', { cx: r1(p[0]), cy: r1(p[1]), rx: rx, ry: ry, fill: 'url(#mr-shadow)' }, parent);
  }

  // ---------- 가구 ----------

  function leaves(g, x, y, s) {
    var sets = [[-14, -10, -38, '#4e9a43'], [12, -12, 36, '#4e9a43'], [-7, -20, -14, '#6cbf5a'], [7, -21, 16, '#6cbf5a'], [0, -26, 0, '#7fcf68'], [-15, -2, -62, '#6cbf5a'], [15, -3, 62, '#6cbf5a']];
    sets.forEach(function (l) {
      el('ellipse', {
        cx: r1(x + l[0] * s), cy: r1(y + l[1] * s), rx: r1(6 * s + 1.5), ry: r1(13 * s + 2),
        transform: 'rotate(' + l[2] + ' ' + r1(x + l[0] * s) + ' ' + r1(y + l[1] * s) + ')',
        fill: l[3], stroke: '#3c7a34', 'stroke-width': 1,
      }, g);
    });
  }

  function plant(parent, x, y, scale) {
    var g = el('g', { 'class': 'mr-plant' }, parent);
    shadow(g, x, y, 22 * scale, 11 * scale);
    var p = P(x, y, 0);
    var s = scale;
    leaves(g, p[0], p[1] - 34 * s, 1.15 * s);
    el('path', {
      d: 'M' + r1(p[0] - 14 * s) + ' ' + r1(p[1] - 30 * s) + ' h' + r1(28 * s) + ' l' + r1(-4 * s) + ' ' + r1(30 * s) + ' h' + r1(-20 * s) + ' z',
      fill: '#e8a06a', stroke: INK, 'stroke-width': 1.2, 'stroke-linejoin': 'round',
    }, g);
    el('ellipse', { cx: r1(p[0]), cy: r1(p[1] - 30 * s), rx: r1(14 * s), ry: r1(4 * s), fill: '#f2bd8c', stroke: INK, 'stroke-width': 1.1 }, g);
    el('ellipse', { cx: r1(p[0]), cy: r1(p[1] - 30 * s), rx: r1(10 * s), ry: r1(2.6 * s), fill: '#7a5636' }, g);
    return g;
  }

  function cup(g, x, y, color) {
    el('ellipse', { cx: r1(x), cy: r1(y), rx: 6, ry: 2.6, fill: '#ffffff', stroke: INK, 'stroke-width': 0.9 }, g);
    el('path', { d: 'M' + r1(x - 3.6) + ' ' + r1(y - 6.5) + ' h7.2 l-0.8 6 q-2.8 1.6 -5.6 0 z', fill: '#ffffff', stroke: INK, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }, g);
    el('ellipse', { cx: r1(x), cy: r1(y - 6.5), rx: 3.6, ry: 1.3, fill: color || '#a0673f' }, g);
    el('path', { d: 'M' + r1(x + 3.4) + ' ' + r1(y - 5) + ' q3 0.6 0 3', fill: 'none', stroke: INK, 'stroke-width': 0.9 }, g);
  }

  function counter(parent) {
    var g = el('g', { 'class': 'mr-counter' }, parent);
    var x0 = 0.95, x1 = 1.75, y0 = 0.7, y1 = 3.75, z1 = 1.38;
    shadow(g, 1.9, 2.3, 70, 26);
    box(g, x0, x1, y0, y1, 0, z1, { top: '#f6a65a', fx: '#f28c28', fy: '#d9761a', stroke: '#9a520f', sw: 1.2 });
    // 앞판 세로 홈과 아래 굽
    var front = frontX(g, x1);
    for (var i = 1; i < 6; i++) {
      var yy = (y0 + i * (y1 - y0) / 6) * U;
      el('line', { x1: yy, y1: -z1 * U + 10, x2: yy, y2: -9, stroke: '#f9b273', 'stroke-width': 1.6 }, front);
    }
    el('rect', { x: y0 * U, y: -7, width: (y1 - y0) * U, height: 7, fill: '#cf6f14' }, front);
    // 상판(앞으로 살짝 나온 흰 상판)
    box(g, x0 - 0.06, x1 + 0.12, y0 - 0.06, y1 + 0.12, z1, z1 + 0.12, { top: '#fffaf2', fx: '#f1e6d6', fy: '#e6d6bd', stroke: '#a98256', sw: 1.1 });
    var zt = z1 + 0.12;
    // 커피 기계
    box(g, 1.02, 1.55, 0.86, 1.6, zt, zt + 0.62, { top: '#eef3f7', fx: '#c9d4de', fy: '#aebdca', stroke: INK, sw: 1.1 });
    var m = P(1.55, 1.23, zt + 0.32);
    el('rect', { x: r1(m[0] - 7), y: r1(m[1] - 3), width: 9, height: 5, rx: 1.5, fill: '#4f5b66' }, g);
    cup(g, m[0] - 3, m[1] + 13, '#6b4226');
    // 계산대
    box(g, 1.1, 1.6, 2.95, 3.5, zt, zt + 0.28, { top: '#ffffff', fx: '#dfe6ec', fy: '#c9d4de', stroke: INK, sw: 1 });
    var r = P(1.35, 3.22, zt + 0.28);
    el('path', { d: 'M' + r1(r[0] - 9) + ' ' + r1(r[1] - 2) + ' l3 -13 h13 l-3 13 z', fill: '#4f5b66', stroke: INK, 'stroke-width': 1 }, g);
    el('path', { d: 'M' + r1(r[0] - 5) + ' ' + r1(r[1] - 6) + ' l1.6 -6 h7 l-1.6 6 z', fill: '#bfe3f2' }, g);
    // 빵 진열 덮개
    var d = P(1.35, 2.25, zt);
    el('ellipse', { cx: r1(d[0]), cy: r1(d[1]), rx: 15, ry: 6, fill: '#ffffff', stroke: INK, 'stroke-width': 1 }, g);
    el('path', { d: 'M' + r1(d[0] - 8) + ' ' + r1(d[1] - 1) + ' q8 -10 16 0 z', fill: '#e8a06a', stroke: INK, 'stroke-width': 0.9 }, g);
    el('path', { d: 'M' + r1(d[0] - 12) + ' ' + r1(d[1]) + ' q12 -26 24 0', fill: '#ffffff', 'fill-opacity': 0.35, stroke: '#8fb4c9', 'stroke-width': 1.1 }, g);
    el('circle', { cx: r1(d[0]), cy: r1(d[1] - 14), r: 2, fill: '#8fb4c9' }, g);
    return g;
  }

  function table(parent, tx, ty) {
    var g = el('g', { 'class': 'mr-table' }, parent);
    var base = P(tx, ty, 0);
    var top = P(tx, ty, 1.0);
    var rx = 0.62 * 1.2247 * U;
    var ry = 0.62 * 0.7071 * U;
    el('ellipse', { cx: r1(base[0]), cy: r1(base[1]), rx: 14, ry: 7, fill: '#8a6a4a', stroke: INK, 'stroke-width': 1 }, g);
    el('rect', { x: r1(base[0] - 3), y: r1(top[1]), width: 6, height: r1(base[1] - top[1]), fill: '#a57e55', stroke: INK, 'stroke-width': 1 }, g);
    el('ellipse', { cx: r1(top[0]), cy: r1(top[1] + 4), rx: r1(rx), ry: r1(ry), fill: '#c99b62', stroke: INK, 'stroke-width': 1.1 }, g);
    el('ellipse', { cx: r1(top[0]), cy: r1(top[1]), rx: r1(rx), ry: r1(ry), fill: '#f3ddb6', stroke: INK, 'stroke-width': 1.1 }, g);
    el('ellipse', { cx: r1(top[0] - 4), cy: r1(top[1] - 3), rx: r1(rx * 0.55), ry: r1(ry * 0.4), fill: '#fbecd2' }, g);
    return { g: g, top: top };
  }

  function chair(parent, x, y, seat, color) {
    var g = el('g', { 'class': 'mr-chair', 'data-seat': seat, transform: at(x, y, 0.5) }, parent);
    var edge = '#9c7448';
    // 뒷다리·등받이
    el('line', { x1: -9, y1: -2, x2: -9, y2: 15, stroke: edge, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
    el('line', { x1: 9, y1: -2, x2: 9, y2: 15, stroke: edge, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M-12 -1 V-29 Q-12 -35 -6 -35 H6 Q12 -35 12 -29 V-1 Z', fill: color, stroke: edge, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M-7 -28 V-6 M0 -29 V-6 M7 -28 V-6', stroke: edge, 'stroke-width': 1, opacity: 0.45 }, g);
    // 앉는 판과 앞다리
    el('line', { x1: -10, y1: 3, x2: -11, y2: 20, stroke: edge, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
    el('line', { x1: 10, y1: 3, x2: 11, y2: 20, stroke: edge, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
    el('ellipse', { cx: 0, cy: 3, rx: 14, ry: 5.2, fill: '#c99b62', stroke: edge, 'stroke-width': 1.2 }, g);
    el('ellipse', { cx: 0, cy: 1, rx: 14, ry: 5.2, fill: color, stroke: edge, 'stroke-width': 1.2 }, g);
    return g;
  }

  // ---------- 미니미 ----------

  var LOOKS = [
    { hair: 'bob', hc: '#3b2a22', skin: '#ffe0c7', shirt: '#7fb8d8', pants: '#4f5b66', extra: 'collar' },
    { hair: 'crop', hc: '#2b2b2b', skin: '#f6d0ae', shirt: '#9ccf8a', pants: '#6f5b4b', extra: 'stripes' },
    { hair: 'bun', hc: '#6b4226', skin: '#ffe6d3', shirt: '#f19a8e', pants: '#4f5b66', extra: 'cardigan', glasses: true },
    { hair: 'cap', hc: '#3b2a22', cap: '#6f8fb8', skin: '#eabf95', shirt: '#e8e2d0', pants: '#2f4858', extra: 'hoodie' },
    { hair: 'long', hc: '#4a3b5c', skin: '#ffe0c7', shirt: '#c9a3d9', pants: '#4f5b66', extra: 'collar' },
    { hair: 'curly', hc: '#a0522d', skin: '#f6d0ae', shirt: '#fff6e6', pants: '#6f8fb8', extra: 'overalls' },
    { hair: 'beanie', hc: '#3b2a22', cap: '#4f8f86', skin: '#ffe6d3', shirt: '#f4c95d', pants: '#4f5b66', extra: 'scarf' },
    { hair: 'pony', hc: '#c98f3a', skin: '#eabf95', shirt: '#e8a06a', pants: '#3d4f63', extra: 'stripes' },
  ];

  function hairBack(g, look, f) {
    var c = f(look.hc);
    if (look.hair === 'bob') {
      el('path', { d: 'M-15 -37 C-16 -56 16 -56 15 -37 L15 -27 Q11 -24 9 -29 L-9 -29 Q-11 -24 -15 -27 Z', fill: c.fill, stroke: c.stroke, 'stroke-width': 1.3, 'stroke-dasharray': c.dash, 'stroke-linejoin': 'round' }, g);
    } else if (look.hair === 'long') {
      el('path', { d: 'M-15 -37 C-16 -57 16 -57 15 -37 L16 -12 Q0 -8 -16 -12 Z', fill: c.fill, stroke: c.stroke, 'stroke-width': 1.3, 'stroke-dasharray': c.dash, 'stroke-linejoin': 'round' }, g);
    } else if (look.hair === 'bun') {
      el('circle', { cx: 0, cy: -53, r: 6.5, fill: c.fill, stroke: c.stroke, 'stroke-width': 1.3, 'stroke-dasharray': c.dash }, g);
    } else if (look.hair === 'pony') {
      el('ellipse', { cx: 14, cy: -32, rx: 4.6, ry: 10, transform: 'rotate(-18 14 -32)', fill: c.fill, stroke: c.stroke, 'stroke-width': 1.3, 'stroke-dasharray': c.dash }, g);
    } else if (look.extra === 'hoodie') {
      var h = f(look.shirt);
      el('path', { d: 'M-15 -30 Q-17 -50 0 -52 Q17 -50 15 -30 Z', fill: h.fill, stroke: h.stroke, 'stroke-width': 1.3, 'stroke-dasharray': h.dash }, g);
    }
  }

  function hairFront(g, look, f) {
    var c = f(look.hc);
    var sw = { 'stroke-width': 1.3, 'stroke-dasharray': c.dash, 'stroke-linejoin': 'round' };
    function path(d, col) {
      var a = { d: d, fill: col.fill, stroke: col.stroke };
      for (var k in sw) a[k] = sw[k];
      if (col.dash !== undefined) a['stroke-dasharray'] = col.dash;
      return el('path', a, g);
    }
    switch (look.hair) {
      case 'bob':
      case 'long':
        path('M-13.6 -37 C-13 -53 13 -53 13.6 -37 Q8 -43 1 -41 Q-6 -45 -13.6 -37 Z', c);
        break;
      case 'crop':
        path('M-13.4 -39 C-12 -54 12 -54 13.4 -39 Q9 -44 4 -42 Q0 -46 -4 -43 Q-9 -45 -13.4 -39 Z', c);
        break;
      case 'bun':
      case 'pony':
        path('M-13.5 -38 C-13 -53 13 -53 13.5 -38 Q4 -46 -13.5 -38 Z', c);
        break;
      case 'curly':
        [[-11, -42], [-7, -48], [0, -51], [7, -48], [11, -42], [-13, -35], [13, -35]].forEach(function (q) {
          el('circle', { cx: q[0], cy: q[1], r: 5.4, fill: c.fill, stroke: c.stroke, 'stroke-width': 1.2, 'stroke-dasharray': c.dash }, g);
        });
        break;
      case 'cap':
        var k = f(look.cap);
        path('M-12 -36 Q-13 -33 -11 -31 M12 -36 Q13 -33 11 -31', { fill: 'none', stroke: c.stroke === INK ? look.hc : c.stroke, dash: c.dash });
        path('M-13.6 -39 C-13 -55 13 -55 13.6 -39 Z', k);
        el('path', { d: 'M2 -40 Q16 -42 20 -38 Q12 -36 2 -38 Z', fill: k.fill, stroke: k.stroke, 'stroke-width': 1.2, 'stroke-dasharray': k.dash }, g);
        el('circle', { cx: 0, cy: -53.5, r: 1.6, fill: k.stroke }, g);
        break;
      case 'beanie':
        var b = f(look.cap);
        path('M-14 -38 C-14 -57 14 -57 14 -38 Z', b);
        el('rect', { x: -14.5, y: -41, width: 29, height: 6, rx: 3, fill: b.fill, stroke: b.stroke, 'stroke-width': 1.2, 'stroke-dasharray': b.dash }, g);
        el('circle', { cx: 0, cy: -56, r: 4, fill: '#ffffff', stroke: b.stroke, 'stroke-width': 1.2, 'stroke-dasharray': b.dash }, g);
        break;
    }
  }

  function outfit(g, look, f) {
    var s = f(look.shirt);
    var p = f(look.pants);
    var w = f('#ffffff');
    var dash = s.dash;
    if (look.extra === 'collar') {
      el('path', { d: 'M-6 -24 L0 -18 L6 -24 L3 -25.5 L0 -22 L-3 -25.5 Z', fill: w.fill, stroke: s.stroke, 'stroke-width': 1, 'stroke-dasharray': dash }, g);
    } else if (look.extra === 'stripes') {
      [-18, -12, -6].forEach(function (y) {
        el('path', { d: 'M-10 ' + y + ' H10', stroke: s.ghost ? s.stroke : '#ffffff', 'stroke-width': 2, opacity: 0.8 }, g);
      });
    } else if (look.extra === 'cardigan') {
      el('path', { d: 'M0 -24 V0', stroke: s.stroke, 'stroke-width': 1 }, g);
      el('path', { d: 'M-4 -24 L0 -16 L4 -24', fill: w.fill, stroke: s.stroke, 'stroke-width': 1 }, g);
      [-12, -6].forEach(function (y) { el('circle', { cx: 2.4, cy: y, r: 1.1, fill: s.stroke }, g); });
    } else if (look.extra === 'hoodie') {
      el('path', { d: 'M-3 -23 V-15 M3 -23 V-15', stroke: s.stroke, 'stroke-width': 1.1, 'stroke-linecap': 'round' }, g);
      el('path', { d: 'M-6 -9 H6 V-3 H-6 Z', fill: 'none', stroke: s.stroke, 'stroke-width': 1 }, g);
    } else if (look.extra === 'overalls') {
      el('path', { d: 'M-7 -14 H7 V0 H-7 Z', fill: p.fill, stroke: p.stroke, 'stroke-width': 1.1, 'stroke-dasharray': p.dash }, g);
      el('path', { d: 'M-7 -14 L-6 -25 M7 -14 L6 -25', stroke: p.ghost ? p.stroke : look.pants, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
      el('circle', { cx: -5.5, cy: -13, r: 1.1, fill: '#f6d27a' }, g);
      el('circle', { cx: 5.5, cy: -13, r: 1.1, fill: '#f6d27a' }, g);
    } else if (look.extra === 'scarf') {
      el('path', { d: 'M-9 -25 Q0 -20 9 -25 L9 -21 Q0 -16 -9 -21 Z', fill: s.ghost ? 'none' : '#e2553f', stroke: s.stroke, 'stroke-width': 1, 'stroke-dasharray': dash }, g);
      el('path', { d: 'M4 -20 L6 -10 L9 -11 L8 -21 Z', fill: s.ghost ? 'none' : '#e2553f', stroke: s.stroke, 'stroke-width': 1, 'stroke-dasharray': dash }, g);
    } else if (look.extra === 'apron') {
      el('path', { d: 'M-7 -20 H7 L8 0 H-8 Z', fill: '#4f5b66', stroke: INK, 'stroke-width': 1 }, g);
      el('path', { d: 'M-7 -20 L-9 -25 M7 -20 L9 -25', stroke: '#4f5b66', 'stroke-width': 1.8 }, g);
      el('rect', { x: -3.5, y: -12, width: 7, height: 4, rx: 1, fill: '#f28c28' }, g);
    }
  }

  // look 의 색을 그대로 쓰거나(평소) 점선 윤곽으로 바꾼다(비어 있는 자리)
  function painter(ghost) {
    if (!ghost) {
      return function (color) { return { fill: color, stroke: INK, dash: null, ghost: false }; };
    }
    return function () { return { fill: 'rgba(255,255,255,0.45)', stroke: '#e2553f', dash: '3 2.4', ghost: true }; };
  }

  function minimiFigure(g, look, opts) {
    var ghost = !!(opts && opts.ghost);
    var standing = !!(opts && opts.standing);
    var f = painter(ghost);
    var skin = f(look.skin);
    var shirt = f(look.shirt);
    var pants = f(look.pants);
    var lineW = 1.3;
    var dash = skin.dash;

    if (!standing) {
      // 의자에 앉아 늘어뜨린 다리
      el('rect', { x: -8, y: -3, width: 7, height: 16, rx: 3, fill: pants.fill, stroke: pants.stroke, 'stroke-width': lineW, 'stroke-dasharray': dash }, g);
      el('rect', { x: 1, y: -3, width: 7, height: 16, rx: 3, fill: pants.fill, stroke: pants.stroke, 'stroke-width': lineW, 'stroke-dasharray': dash }, g);
      if (!ghost) {
        el('ellipse', { cx: -4.6, cy: 14, rx: 4.6, ry: 2.6, fill: INK }, g);
        el('ellipse', { cx: 4.6, cy: 14, rx: 4.6, ry: 2.6, fill: INK }, g);
      }
    }
    hairBack(g, look, f);
    // 몸통과 팔
    el('ellipse', { cx: -11, cy: -13, rx: 3.8, ry: 8.5, transform: 'rotate(14 -11 -13)', fill: shirt.fill, stroke: shirt.stroke, 'stroke-width': lineW, 'stroke-dasharray': dash }, g);
    el('ellipse', { cx: 11, cy: -13, rx: 3.8, ry: 8.5, transform: 'rotate(-14 11 -13)', fill: shirt.fill, stroke: shirt.stroke, 'stroke-width': lineW, 'stroke-dasharray': dash }, g);
    el('path', { d: 'M-9 -25 Q0 -28 9 -25 Q12 -12 11.5 0 H-11.5 Q-12 -12 -9 -25 Z', fill: shirt.fill, stroke: shirt.stroke, 'stroke-width': lineW, 'stroke-dasharray': dash, 'stroke-linejoin': 'round' }, g);
    if (!ghost) outfit(g, look, f);
    if (!ghost) {
      el('circle', { cx: -13, cy: -5.5, r: 3, fill: look.skin, stroke: INK, 'stroke-width': 1.1 }, g);
      el('circle', { cx: 13, cy: -5.5, r: 3, fill: look.skin, stroke: INK, 'stroke-width': 1.1 }, g);
    }
    // 머리
    el('circle', { cx: 0, cy: -38, r: 13.5, fill: skin.fill, stroke: skin.stroke, 'stroke-width': lineW, 'stroke-dasharray': dash }, g);
    if (!ghost) {
      el('ellipse', { cx: -4.6, cy: -36.5, rx: 1.6, ry: 2.1, fill: '#2b2b2b' }, g);
      el('ellipse', { cx: 4.6, cy: -36.5, rx: 1.6, ry: 2.1, fill: '#2b2b2b' }, g);
      el('circle', { cx: -4.1, cy: -37.3, r: 0.6, fill: '#ffffff' }, g);
      el('circle', { cx: 5.1, cy: -37.3, r: 0.6, fill: '#ffffff' }, g);
      el('ellipse', { cx: -8.4, cy: -31.8, rx: 2.8, ry: 1.6, fill: '#f4a7a0', opacity: 0.8 }, g);
      el('ellipse', { cx: 8.4, cy: -31.8, rx: 2.8, ry: 1.6, fill: '#f4a7a0', opacity: 0.8 }, g);
      el('path', { d: 'M-2.2 -31 Q0 -29.2 2.2 -31', fill: 'none', stroke: INK, 'stroke-width': 1.1, 'stroke-linecap': 'round' }, g);
      if (look.glasses) {
        el('circle', { cx: -4.8, cy: -36.5, r: 3.6, fill: 'none', stroke: INK, 'stroke-width': 1 }, g);
        el('circle', { cx: 4.8, cy: -36.5, r: 3.6, fill: 'none', stroke: INK, 'stroke-width': 1 }, g);
        el('path', { d: 'M-1.2 -36.8 H1.2', stroke: INK, 'stroke-width': 1 }, g);
      }
    }
    hairFront(g, look, f);
  }

  // ---------- 늦음 말풍선 ----------

  function bubble(parent, seat, seatXY, dx, lift, lines) {
    var bx = seatXY[0] + dx;
    var by = seatXY[1] - 58 - lift;
    var g = el('g', { 'class': 'mr-bubble', 'data-testid': 'landing-late-bubble', 'data-seat': seat, transform: 'translate(' + r1(bx) + ' ' + r1(by) + ')' }, parent);
    var w = 156;
    var h = 62;
    var tipX = seatXY[0] - bx;
    var tipY = seatXY[1] - 56 - by;
    var baseX = Math.max(-w / 2 + 22, Math.min(w / 2 - 22, tipX * 0.55));
    el('path', {
      d: 'M' + r1(-w / 2 + 14) + ' ' + (-h) + ' H' + r1(w / 2 - 14) + ' Q' + (w / 2) + ' ' + (-h) + ' ' + (w / 2) + ' ' + (-h + 14) +
        ' V-14 Q' + (w / 2) + ' 0 ' + r1(w / 2 - 14) + ' 0 H' + r1(baseX + 9) + ' L' + r1(tipX) + ' ' + r1(tipY) + ' L' + r1(baseX - 9) + ' 0 H' + r1(-w / 2 + 14) +
        ' Q' + (-w / 2) + ' 0 ' + (-w / 2) + ' -14 V' + (-h + 14) + ' Q' + (-w / 2) + ' ' + (-h) + ' ' + r1(-w / 2 + 14) + ' ' + (-h) + ' Z',
      fill: '#c9452f', stroke: '#a3341f', 'stroke-width': 1.4, 'stroke-linejoin': 'round', filter: 'url(#mr-lift)',
    }, g);
    el('path', { d: 'M' + r1(-w / 2 + 10) + ' ' + (-h + 7) + ' H' + r1(w / 2 - 10), stroke: '#e2553f', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.9 }, g);
    var txt = el('text', { x: 0, 'text-anchor': 'middle', fill: '#ffffff', 'font-family': 'Pretendard, "Apple SD Gothic Neo", sans-serif' }, g);
    var s1 = el('tspan', { x: 0, y: -h + 25, 'font-size': 16 }, txt);
    s1.textContent = lines[0];
    txt.appendChild(document.createTextNode(' '));
    var s2 = el('tspan', { x: 0, y: -h + 51, 'font-size': 23, 'font-weight': 700 }, txt);
    s2.textContent = lines[1];
    return g;
  }

  // ---------- 배치 ----------

  // 테이블 4개, 자리마다 [x, y]. 자리 번호 1..8 은 테이블 순서대로 왼쪽·오른쪽.
  var TABLES = [[3.2, 1.8], [6.2, 1.8], [3.2, 4.6], [6.2, 4.6]];
  var LATE = {
    2: { lines: ['평소 13일마다', '→ 38일째'], dx: 0, lift: 14 },
    4: { lines: ['평소 7일마다', '→ 19일째'], dx: 26, lift: 0 },
    5: { lines: ['평소 10일마다', '→ 24일째'], dx: -6, lift: 0 },
  };
  var CHAIR_COLORS = ['#fff6e6', '#e3f1f8'];

  function render(container) {
    if (!container) throw new Error('DGMiniroom.render: container is required');
    if (container.__dgMiniroom) return container.__dgMiniroom;
    clipCount = 0;

    var svg = el('svg', {
      xmlns: NS,
      viewBox: '0 0 ' + VW + ' ' + VH,
      width: '100%',
      height: '100%',
      preserveAspectRatio: 'xMidYMid meet',
      'aria-hidden': 'true',
      focusable: 'false',
      'class': 'mr-svg',
    });
    defs(svg);
    walls(svg);
    floor(svg);

    var scene = el('g', { 'class': 'mr-scene' }, svg);
    var bubbleLayer = el('g', { 'class': 'mr-bubbles' });
    var minimi = [];
    var bubbles = [];
    var items = [];

    items.push({ depth: 3.4, draw: function () {
      var owner = el('g', { 'class': 'mr-owner', transform: at(0.48, 1.55, 0) }, scene);
      var inner = el('g', { transform: 'translate(0 -38)' }, owner);
      minimiFigure(inner, { hair: 'bun', hc: '#2b2b2b', skin: '#f6d0ae', shirt: '#ffffff', pants: '#4f5b66', extra: 'apron' }, { standing: true });
      counter(scene);
    } });
    items.push({ depth: 5.0, draw: function () { plant(scene, 0.55, 4.45, 0.75); } });
    items.push({ depth: 8.4, draw: function () { plant(scene, 1.15, 7.1, 1); } });

    TABLES.forEach(function (t, ti) {
      items.push({ depth: t[0] + t[1], draw: function () {
        var seats = [[t[0] - 0.5, t[1] + 0.5], [t[0] + 0.5, t[1] - 0.5]];
        shadow(scene, t[0], t[1], 62, 22);
        var figs = [];
        seats.forEach(function (s, si) {
          var n = ti * 2 + si + 1;
          chair(scene, s[0], s[1], n, CHAIR_COLORS[(ti + si) % 2]);
        });
        seats.forEach(function (s, si) {
          var n = ti * 2 + si + 1;
          var late = !!LATE[n];
          var g = el('g', {
            'class': late ? 'mr-minimi is-late' : 'mr-minimi',
            'data-testid': 'landing-minimi',
            'data-seat': n,
            'data-late': late ? 'true' : null,
            transform: at(s[0], s[1], 0.5),
          }, scene);
          minimiFigure(g, LOOKS[n - 1], { ghost: late });
          figs.push(g);
          minimi[n - 1] = g;
          if (late) {
            var p = P(s[0], s[1], 0.5);
            bubbles.push({ n: n, p: p });
          }
        });
        var tb = table(scene, t[0], t[1]);
        // 탁자 위 잔: 앉은 사람 앞에만, 빈자리 앞은 비운다
        seats.forEach(function (s, si) {
          var n = ti * 2 + si + 1;
          if (LATE[n]) return;
          cup(tb.g, tb.top[0] + (si === 0 ? -10 : 10), tb.top[1] + 2, n % 3 === 0 ? '#c47a45' : '#6b4226');
        });
        return figs;
      } });
    });

    items.sort(function (a, b) { return a.depth - b.depth; });
    items.forEach(function (it) { it.draw(); });

    svg.appendChild(bubbleLayer);
    bubbles.sort(function (a, b) { return a.n === 2 ? -1 : b.n === 2 ? 1 : a.n - b.n; });
    var bubbleEls = bubbles.map(function (b) {
      var cfg = LATE[b.n];
      return bubble(bubbleLayer, b.n, b.p, cfg.dx, cfg.lift, cfg.lines);
    });

    container.textContent = '';
    container.appendChild(svg);
    container.classList.add('is-drawn');

    var result = { svg: svg, minimi: minimi, bubbles: bubbleEls };
    container.__dgMiniroom = result;
    return result;
  }

  window.DGMiniroom = { render: render };

  var target = document.querySelector('[data-testid="landing-miniroom"]');
  if (target) {
    try {
      render(target);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error(e);
    }
  }
})();
