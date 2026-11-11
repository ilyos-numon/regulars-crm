(function () {
  'use strict';

  var M = window.DGMotion;
  if (!M) return;

  var EASE = 'expo.out';
  var lastListKey = null;
  var bounced = {};

  function items() {
    return Array.prototype.slice.call(document.querySelectorAll('#candidates li[data-testid="candidate"]'));
  }

  function listKey(list) {
    var ids = [];
    for (var i = 0; i < list.length; i++) ids.push(String(list[i]._customerId));
    return ids.join('|');
  }

  function clear(g, targets, props) {
    if (targets.length > 0) g.set(targets, { clearProps: props });
  }

  // 목록 진입: 새 목록이 그려질 때만 위에서부터 차례로
  function onListDrawn() {
    var list = items();
    var key = listKey(list);
    var fresh = key !== lastListKey;
    lastListKey = key;
    if (list.length === 0) return;

    var over = [];
    for (var i = 0; i < list.length; i++) {
      var bar = list[i].querySelector('.dg-ratio[data-over="true"]');
      var id = String(list[i]._customerId);
      if (bar && !bounced[id]) {
        bounced[id] = true;
        over.push(bar);
      }
    }

    M.run(function (g) {
      if (fresh) {
        g.fromTo(list, { y: 8, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.4, ease: EASE, stagger: 0.05,
          onComplete: function () { clear(g, list, 'transform,opacity'); },
        });
      }
      // 2배 기준선: 막대가 눈금을 넘는 순간 눈금이 한 번 튄다
      for (var j = 0; j < over.length; j++) {
        var fill = over[j].querySelector('.dg-ratio-fill');
        var mark = over[j].querySelector('.dg-ratio-mark');
        if (!fill || !mark) continue;
        var ratio = parseFloat(over[j].style.getPropertyValue('--ratio')) || 2;
        var crossAt = Math.min(1, 2 / Math.min(ratio, 4));
        var grow = 0.6;
        var delay = 0.15 + j * 0.05;
        g.fromTo(fill, { scaleX: 0 }, {
          scaleX: 1, duration: grow, delay: delay, ease: 'power2.out',
          onComplete: clear.bind(null, g, [fill], 'transform'),
        });
        g.timeline({ delay: delay + grow * crossAt * 0.55, onComplete: clear.bind(null, g, [mark], 'transform') })
          .to(mark, { scaleY: 1.9, duration: 0.12, ease: 'power2.out' })
          .to(mark, { scaleY: 1, duration: 0.45, ease: 'elastic.out(1, 0.4)' });
      }
    }, function () {});
  }

  // 상세 패널: 오른쪽에서 짧게 밀려 들어온다
  function onDetailOpen() {
    var detail = document.getElementById('candidate-detail');
    if (!detail || detail.hidden) return;
    M.run(function (g) {
      g.fromTo(detail, { x: 24, opacity: 0 }, {
        x: 0, opacity: 1, duration: 0.25, ease: EASE, overwrite: 'auto',
        onComplete: function () { g.set(detail, { clearProps: 'transform,opacity' }); },
      });
    }, function () {});
  }

  // 탭 전환: 폴더 한 장이 위 모서리를 축으로 넘어와 자리 잡는다
  function onTabChange() {
    var panel = document.querySelector('.tab-panel:not([hidden])');
    if (!panel) return;
    M.run(function (g) {
      g.fromTo(panel, { rotateX: -8, transformPerspective: 900, transformOrigin: '50% 0%' }, {
        rotateX: 0, duration: 0.2, ease: 'power2.out', overwrite: 'auto',
        onComplete: function () { g.set(panel, { clearProps: 'transform,transformOrigin' }); },
      });
    }, function () {});
  }

  window.addEventListener('dg:list-drawn', onListDrawn);
  window.addEventListener('dg:detail-open', onDetailOpen);
  window.addEventListener('dg:tab-change', onTabChange);

  // 이 파일보다 먼저 그려진 목록이 있으면 한 번 맞춘다
  if (items().length > 0) onListDrawn();
})();
