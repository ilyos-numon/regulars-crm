(function () {
  var R = window.regulars;

  function el(tag, testid, text, className) {
    var n = document.createElement(tag);
    if (testid) n.setAttribute('data-testid', testid);
    if (text !== undefined && text !== null) n.textContent = text;
    if (className) n.className = className;
    return n;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function timeOf(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function dateTimeOf(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + timeOf(iso);
  }

  function withAsOf(path, asOf) {
    return asOf ? path + '?asOf=' + encodeURIComponent(asOf) : path;
  }

  function drawHistory(box) {
    return R.api('/api/briefing/history').then(function (list) {
      box.textContent = '';
      if (!list || list.length === 0) {
        box.appendChild(el('p', 'briefing-history-empty', '아직 보낸 브리핑이 없습니다', 'muted'));
        return;
      }
      var ul = el('ul', 'briefing-history');
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        ul.appendChild(el('li', 'briefing-history-item',
          dateTimeOf(r.sentAt) + ' · 챙길 단골 ' + r.candidates + '명 · 돌아온 단골 ' + r.returned + '명' +
          (r.channel === 'none' ? ' · 기록만 남김 (메신저 미연결)' : '')));
      }
      box.appendChild(ul);
    });
  }

  function render(body, ctx) {
    body.textContent = '';
    var asOf = ctx.asOf || '';
    return R.api(withAsOf('/api/briefing', asOf)).then(function (b) {
      body.textContent = '';
      body.appendChild(el('pre', 'briefing-preview', b.text));

      var row = el('div', null, null, 'row');
      var sendBtn = el('button', 'briefing-send', '지금 보내기');
      sendBtn.type = 'button';
      row.appendChild(sendBtn);
      body.appendChild(row);

      var sent = el('p', 'briefing-sent', '', 'muted');
      var error = el('p', 'briefing-error', '', 'error');
      body.appendChild(sent);
      body.appendChild(error);

      var historyBox = el('div');
      body.appendChild(historyBox);

      sendBtn.onclick = function () {
        sendBtn.disabled = true;
        sent.textContent = '';
        error.textContent = '';
        R.api(withAsOf('/api/briefing/send', asOf), { method: 'POST' }).then(function (res) {
          sendBtn.disabled = false;
          if (res && res.channel === 'none') {
            sent.textContent = '메신저가 연결돼 있지 않아 기록만 남겼습니다. 실제로는 전송되지 않았습니다. (' + timeOf(res.sentAt) + ')';
          } else {
            sent.textContent = '보냈습니다 (' + timeOf(res.sentAt) + ')';
          }
          return drawHistory(historyBox);
        }, function (err) {
          sendBtn.disabled = false;
          error.textContent = err && err.message ? err.message : '브리핑을 보내지 못했습니다';
        });
      };

      return drawHistory(historyBox);
    });
  }

  R.register({ id: 'briefing', mount: { tab: 'briefing', slot: 'main', order: 10 }, title: '월요일 브리핑 미리보기', render: render });
})();
