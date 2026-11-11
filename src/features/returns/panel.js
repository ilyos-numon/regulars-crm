(function () {
  var R = window.regulars;
  var EMPTY = '아직 알림을 보낸 단골이 없습니다. 홈에서 안부 문구를 보내거나 월요일 브리핑을 보내면 여기서 효과를 봅니다.';
  var NO_BASELINE = '비교할 과거 기록이 아직 없습니다';

  function el(tag, testid, text, className) {
    var n = document.createElement(tag);
    if (testid) n.setAttribute('data-testid', testid);
    if (text !== undefined && text !== null) n.textContent = text;
    if (className) n.className = className;
    return n;
  }

  function diffLabel(d) {
    if (d === null || d === undefined) return NO_BASELINE;
    if (d > 0) return '+' + d + '%p';
    return d + '%p';
  }

  function diffNote(d) {
    if (d.diffPct === null || d.diffPct === undefined || d.rate === null || !d.baseline || d.baseline.rate === null) {
      return null;
    }
    var base = '알림 없이 돌아온 비율(' + d.baseline.rate + '%)';
    if (d.diffPct > 0) return base + '보다 ' + d.diffPct + '%p 높습니다. 안부를 보낸 효과일 수 있습니다.';
    if (d.diffPct < 0) return base + '보다 ' + (-d.diffPct) + '%p 낮습니다. 안부와 상관없이 오는 손님이 더 많았습니다.';
    return base + '과 비슷합니다. 아직은 안부의 효과가 뚜렷하지 않습니다.';
  }

  function outcomeLabel(o) {
    if (o.status === 'returned') return '돌아옴 ' + o.returnedOn;
    if (o.status === 'pending') return '기다리는 중';
    return '아직';
  }

  function render(body, ctx) {
    body.textContent = '';
    var asOf = ctx.asOf || '';
    var path = '/api/returns' + (asOf ? '?asOf=' + encodeURIComponent(asOf) : '');
    return R.api(path).then(function (d) {
      body.textContent = '';
      if (!d.noticed) {
        body.appendChild(el('p', 'returns-empty', EMPTY, 'muted'));
        return;
      }
      body.appendChild(el('p', 'returns-summary', d.text));
      body.appendChild(el('p', 'returns-baseline', d.baselineText, 'muted'));
      body.appendChild(el('p', 'returns-diff', diffLabel(d.diffPct)));
      var note = diffNote(d);
      if (note) body.appendChild(el('p', 'returns-diff-note', note, 'muted'));
      var list = el('ul', 'returns-list');
      for (var i = 0; i < d.outcomes.length; i++) {
        var o = d.outcomes[i];
        list.appendChild(el('li', 'returns-item', '카드 ··' + o.cardLast2 + ' · ' + o.noticedOn + ' 알림 · ' + outcomeLabel(o)));
      }
      body.appendChild(list);
      body.appendChild(el('p', 'returns-legend', '기다리는 중 = 알림 후 14일이 아직 안 지남 · 돌아옴 = 14일 안에 다시 오심 · 아직 = 14일이 지나도 안 오심', 'muted'));
    });
  }

  R.register({ id: 'returns', mount: { tab: 'returns', slot: 'main', order: 10 }, title: '알림 뒤 돌아온 단골', render: render });
})();
