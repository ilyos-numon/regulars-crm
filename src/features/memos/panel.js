(function () {
  var R = window.regulars;
  var HELP = {
    none: '목록에는 그대로 두고 메모만 남깁니다.',
    exclude: "저장하면 이 손님은 '이번 주 챙길 단골'에서 빠지고 보류로 옮겨집니다.",
    tolerate: '평소보다 3배까지 늦어도 챙길 단골로 올리지 않습니다.'
  };
  var ACTIONS = [
    { value: 'none', label: '그냥 메모' },
    { value: 'exclude', label: '챙길 단골에서 빼기' },
    { value: 'tolerate', label: '원래 뜸한 분 (기준 3배)' }
  ];
  // 저장 직후 다시 그려질 때 "저장했습니다" 를 유지하기 위한 표시
  var savedFor = null;

  function labelOf(action) {
    for (var i = 0; i < ACTIONS.length; i++) {
      if (ACTIONS[i].value === action) return ACTIONS[i].label;
    }
    return action;
  }

  function make(tag, testid, text) {
    var el = document.createElement(tag);
    if (testid) el.setAttribute('data-testid', testid);
    if (text) el.textContent = text;
    return el;
  }

  function renderDetail(el, ctx) {
    var c = ctx.candidate;
    el.textContent = '';
    if (!c) return;
    if (savedFor !== c.customerId) savedFor = null;

    var row = make('div', null, '');
    row.className = 'row';
    var input = make('input', 'memo-note', '');
    input.type = 'text';
    input.placeholder = '한 줄 메모';
    input.maxLength = 200;
    var select = make('select', 'memo-action', '');
    for (var i = 0; i < ACTIONS.length; i++) {
      var opt = document.createElement('option');
      opt.value = ACTIONS[i].value;
      opt.textContent = ACTIONS[i].label;
      select.appendChild(opt);
    }
    var save = make('button', 'memo-save', '저장');
    save.type = 'button';
    row.appendChild(input);
    row.appendChild(select);
    row.appendChild(save);

    var help = make('p', 'memo-action-help', '');
    help.className = 'muted';
    function showHelp() { help.textContent = HELP[select.value] || ''; }
    showHelp();
    select.addEventListener('change', showHelp);

    var hint = make('p', 'memo-hint', '이름·전화번호는 적지 마세요');
    hint.className = 'muted';
    var error = make('p', 'memo-error', '');
    error.className = 'error';
    var saved = make('p', 'memo-saved', '');
    if (savedFor === c.customerId) saved.textContent = '저장했습니다';

    el.appendChild(row);
    el.appendChild(help);
    el.appendChild(hint);
    el.appendChild(error);
    el.appendChild(saved);

    save.addEventListener('click', function () {
      error.textContent = '';
      saved.textContent = '';
      R.api('/api/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: c.customerId, cardLast2: c.cardLast2, note: input.value, action: select.value })
      }).then(function () {
        savedFor = c.customerId;
        saved.textContent = '저장했습니다';
        return R.refreshHome();
      }, function (err) {
        savedFor = null;
        error.textContent = err && err.message ? err.message : '저장하지 못했습니다';
      });
    });

    return R.api('/api/memos').then(function (list) {
      for (var j = 0; j < (list || []).length; j++) {
        if (list[j].customerId === c.customerId) {
          if (!input.value) input.value = list[j].note;
          select.value = list[j].action;
          showHelp();
          break;
        }
      }
    });
  }

  function renderList(el) {
    el.textContent = '';
    return R.api('/api/memos').then(function (list) {
      el.textContent = '';
      list = list || [];
      if (list.length === 0) {
        el.appendChild(make('p', 'memos-empty', '아직 메모가 없습니다'));
        return;
      }
      var ul = make('ul', 'memos-list', '');
      list.forEach(function (m) {
        var li = make('li', 'memo-item', '');
        var text = make('span', null, '카드 ··' + m.cardLast2 + ' · ' + labelOf(m.action) + ' · ' + m.note);
        var del = make('button', 'memo-delete', '삭제');
        del.type = 'button';
        del.className = 'secondary';
        del.addEventListener('click', function () {
          R.api('/api/memos/' + encodeURIComponent(m.customerId), { method: 'DELETE' }).then(function () {
            if (savedFor === m.customerId) savedFor = null;
            return R.refreshHome();
          }, function (err) {
            R.toast(err && err.message ? err.message : '삭제하지 못했습니다');
          });
        });
        li.appendChild(text);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(del);
        ul.appendChild(li);
      });
      el.appendChild(ul);
    });
  }

  R.register({ id: 'memos', mount: { tab: 'home', slot: 'detail', order: 40 }, title: '사장님 메모', render: renderDetail });
  R.register({ id: 'memos', mount: { tab: 'memos', slot: 'main', order: 10 }, title: '메모 목록', render: renderList });
})();
