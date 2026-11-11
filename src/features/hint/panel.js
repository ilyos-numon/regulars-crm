(function () {
  var R = window.regulars;

  function q(path, asOf, extra) {
    var parts = [];
    if (asOf) parts.push('asOf=' + encodeURIComponent(asOf));
    if (extra) parts.push(extra);
    return parts.length ? path + '?' + parts.join('&') : path;
  }

  function line(el, testid, text, cls) {
    var p = document.createElement('p');
    p.setAttribute('data-testid', testid);
    if (cls) p.className = cls;
    p.textContent = text;
    el.appendChild(p);
    return p;
  }

  R.register({
    id: 'hint',
    mount: { tab: 'home', slot: 'detail', order: 20 },
    title: '왜 멀어졌을까',
    render: function (el, ctx) {
      if (!ctx.candidate) return;
      el.textContent = '';
      var out = line(el, 'hint-personal', '불러오는 중…', 'muted');
      return R.api(q('/api/hint/' + encodeURIComponent(ctx.candidate.customerId), ctx.asOf)).then(function (r) {
        out.className = '';
        out.textContent = r.text;
      });
    },
  });

  R.register({
    id: 'hint',
    mount: { tab: 'store', slot: 'main', order: 10 },
    title: '같은 시기 이탈·변경 전후',
    render: function (el, ctx) {
      el.textContent = '';
      var cluster = line(el, 'hint-cluster', '불러오는 중…', 'muted');

      var row = document.createElement('div');
      row.className = 'row';
      var label = document.createElement('label');
      label.textContent = '가게를 바꾼 날 ';
      var input = document.createElement('input');
      input.type = 'date';
      input.setAttribute('data-testid', 'hint-change-date');
      label.appendChild(input);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-testid', 'hint-change-btn');
      btn.textContent = '비교하기';
      row.appendChild(label);
      row.appendChild(btn);
      el.appendChild(row);
      var result = line(el, 'hint-change-result', '', 'muted');

      btn.onclick = function () {
        result.className = 'muted';
        result.textContent = '계산 중…';
        R.api(q('/api/hint/change', ctx.asOf, 'date=' + encodeURIComponent(input.value))).then(
          function (r) {
            result.className = '';
            result.textContent = r.text;
          },
          function (err) {
            result.className = 'error';
            result.textContent = err && err.message ? err.message : '불러오지 못했습니다';
          }
        );
      };

      return R.api(q('/api/hint/store', ctx.asOf)).then(function (r) {
        cluster.className = '';
        cluster.textContent = r.text;
      });
    },
  });
})();
