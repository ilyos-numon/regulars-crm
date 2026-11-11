(function () {
  var R = window.regulars;

  function q(path, asOf) {
    return asOf ? path + '?asOf=' + encodeURIComponent(asOf) : path;
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
    id: 'reviews',
    mount: { tab: 'store', slot: 'main', order: 20 },
    title: '리뷰·평점',
    render: function (el, ctx) {
      el.textContent = '';

      line(el, 'store-optional-note', '가게 진단은 선택입니다. 매출 CSV만으로도 챙길 단골은 찾아 드립니다.', 'muted');
      line(el, 'reviews-source-help', '배달앱·지도 서비스의 리뷰 관리 화면에서 작성일·별점·내용을 표로 옮겨 붙여넣거나 직접 적어 주세요.', 'muted');
      line(el, 'reviews-format-help', '입력 형식: 첫 줄에 작성일,별점,내용 을 그대로 적고, 그 아래에 한 줄에 리뷰 하나씩 (예: 2026-10-12,2,커피가 식어서 나왔어요)', 'muted');
      var input = document.createElement('textarea');
      input.setAttribute('data-testid', 'reviews-input');
      input.placeholder = '작성일,별점,내용 순서로 붙여넣기\n작성일,별점,내용\n2026-10-12,2,커피가 식어서 나왔어요';
      input.rows = 6;
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      el.appendChild(input);

      var row = document.createElement('div');
      row.className = 'row';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-testid', 'reviews-import');
      btn.textContent = '가져오기';
      row.appendChild(btn);
      var sample = document.createElement('button');
      sample.type = 'button';
      sample.setAttribute('data-testid', 'reviews-sample-fill');
      sample.textContent = '예시 채우기';
      sample.onclick = function () {
        input.value = '작성일,별점,내용\n2026-10-05,5,아메리카노가 늘 맛있어요\n2026-10-12,2,주문이 늦게 나왔어요\n2026-10-20,4,창가 자리가 좋아요';
      };
      row.appendChild(sample);
      el.appendChild(row);

      var error = line(el, 'reviews-error', '', 'error');
      error.hidden = true;
      var summary = line(el, 'reviews-summary', '불러오는 중…', 'muted');
      var list = document.createElement('div');
      el.appendChild(list);

      function show(r) {
        summary.className = '';
        summary.textContent = r.summary;
        list.textContent = '';
        for (var i = 0; i < r.impacts.length; i++) {
          var it = r.impacts[i];
          var box = document.createElement('div');
          box.className = 'section';
          line(box, 'review-impact-' + i, it.line);
          line(box, 'review-reply-' + i, it.reply);
          line(box, 'review-reply-source-' + i, it.replySource, 'muted');
          list.appendChild(box);
        }
      }

      function load() {
        return R.api(q('/api/reviews', ctx.asOf)).then(show);
      }

      btn.onclick = function () {
        error.hidden = true;
        error.textContent = '';
        btn.disabled = true;
        R.api('/api/reviews/import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv; charset=utf-8' },
          body: input.value,
        })
          .then(load)
          .then(
            function () { btn.disabled = false; },
            function (err) {
              btn.disabled = false;
              error.textContent = err && err.message ? err.message : '가져오지 못했습니다';
              error.hidden = false;
            }
          );
      };

      return load();
    },
  });
})();
