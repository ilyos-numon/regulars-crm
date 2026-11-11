(function () {
  var R = window.regulars;

  function line(el, testid, text, cls) {
    var p = document.createElement('p');
    p.setAttribute('data-testid', testid);
    if (cls) p.className = cls;
    p.textContent = text;
    el.appendChild(p);
    return p;
  }

  R.register({
    id: 'weather',
    mount: { tab: 'store', slot: 'main', order: 30 },
    title: '날씨·연휴',
    render: function (el) {
      el.textContent = '';
      line(el, 'weather-source-help', '날씨 기록은 기상청 기상자료개방포털(data.kma.go.kr)의 종관기상관측 일자료에서 가게와 가까운 지점을 골라 내려받은 뒤, 일시·일강수량 열이 있는 표를 그대로 복사해 붙여넣으면 됩니다.', 'muted');
      line(el, 'weather-format-help', '입력 형식: 첫 줄에 날짜,강수량 을 그대로 적고, 그 아래에 한 줄에 하루씩 (예: 2026-10-12,35 → 그날 비 35mm)', 'muted');
      var input = document.createElement('textarea');
      input.setAttribute('data-testid', 'weather-input');
      input.placeholder = '날짜,강수량(mm) 순서로 붙여넣기\n날짜,강수량\n2026-10-12,35';
      input.rows = 6;
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      el.appendChild(input);

      var row = document.createElement('div');
      row.className = 'row';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-testid', 'weather-import');
      btn.textContent = '가져오기';
      row.appendChild(btn);
      var sample = document.createElement('button');
      sample.type = 'button';
      sample.setAttribute('data-testid', 'weather-sample-fill');
      sample.textContent = '예시 채우기';
      sample.onclick = function () {
        input.value = '날짜,강수량\n2026-10-12,14\n2026-10-13,30\n2026-10-14,0';
      };
      row.appendChild(sample);
      el.appendChild(row);

      var error = line(el, 'weather-error', '', 'error');
      error.hidden = true;
      var summary = line(el, 'weather-summary', '불러오는 중…', 'muted');
      var holidays = line(el, 'weather-holidays', '', 'muted');

      function show(r) {
        summary.className = '';
        summary.textContent = r.summary;
        if (r.holidayLine) holidays.textContent = r.holidayLine;
      }

      btn.onclick = function () {
        error.hidden = true;
        error.textContent = '';
        btn.disabled = true;
        R.api('/api/weather/import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv; charset=utf-8' },
          body: input.value,
        }).then(
          function (r) {
            btn.disabled = false;
            show(r);
            R.refreshHome();
          },
          function (err) {
            btn.disabled = false;
            error.textContent = err && err.message ? err.message : '가져오지 못했습니다';
            error.hidden = false;
          }
        );
      };

      return R.api('/api/weather').then(show);
    },
  });
})();
