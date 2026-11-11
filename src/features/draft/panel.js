(function () {
  var R = window.regulars;

  function el(tag, testid, text, className) {
    var n = document.createElement(tag);
    if (testid) n.setAttribute('data-testid', testid);
    if (text !== undefined && text !== null) n.textContent = text;
    if (className) n.className = className;
    return n;
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function render(body, ctx) {
    body.textContent = '';
    var c = ctx.candidate;
    if (!c) return;
    var asOf = ctx.asOf || '';
    var path = '/api/draft/' + encodeURIComponent(c.customerId) + (asOf ? '?asOf=' + encodeURIComponent(asOf) : '');
    return R.api(path).then(function (d) {
      body.textContent = '';
      body.appendChild(el('p', 'draft-source', d.source, 'muted'));
      for (var i = 0; i < d.drafts.length; i++) {
        (function (i, item) {
          var row = el('div', 'draft-card-' + i, null, 'section');
          var tone = el('strong', 'draft-tone-' + i, item.tone);
          tone.style.display = 'block';
          row.appendChild(tone);
          var text = el('p', 'draft-text-' + i, item.text);
          text.style.margin = '0.25rem 0 0.5rem';
          text.style.whiteSpace = 'pre-wrap';
          row.appendChild(text);
          var btn = el('button', 'draft-copy-' + i, '복사', 'secondary');
          btn.type = 'button';
          btn.onclick = function () {
            copyText(item.text).then(function (ok) {
              if (ok) btn.textContent = '복사했어요';
              else R.toast('복사하지 못했어요. 문구를 길게 눌러 직접 복사해 주세요.');
            });
          };
          row.appendChild(btn);
          body.appendChild(row);
        })(i, d.drafts[i]);
      }
      var sentBtn = el('button', 'draft-sent-btn', '보냈어요');
      sentBtn.type = 'button';
      var sent = el('p', 'draft-sent', '', 'muted');
      sentBtn.onclick = function () {
        sentBtn.disabled = true;
        var payload = { customerId: d.customerId, cardLast2: d.cardLast2, source: 'draft' };
        if (asOf) payload.noticedOn = asOf;
        R.api('/api/notices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (list) {
          var day = asOf;
          if (!day && list && list.length) day = list[list.length - 1].noticedOn;
          sent.textContent = '보낸 것으로 기록했습니다 (' + day + ')';
          sentBtn.disabled = false;
        }, function (err) {
          sentBtn.disabled = false;
          R.toast(err && err.message ? err.message : '기록하지 못했습니다');
        });
      };
      body.appendChild(sentBtn);
      body.appendChild(sent);
    });
  }

  R.register({ id: 'draft', mount: { tab: 'home', slot: 'detail', order: 30 }, title: '안부 문구', render: render });
})();
