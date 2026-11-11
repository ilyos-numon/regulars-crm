(function () {
  'use strict';

  // 개발자 보기: 화면 영역마다 어떤 API·데이터로 만들어졌는지 쪽지를 붙인다.
  // 쪽지는 영역 바로 앞 형제로 넣어 영역 안쪽 재렌더(textContent 비우기)에 지워지지 않게 하고,
  // 영역이 통째로 다시 그려지면(MutationObserver) 다시 붙인다.
  var on = false;
  var observer = null;
  var queued = false;

  var AREAS = [
    { area: 'counter', sel: '#app-counter', text: 'GET /api/churn → regulars, candidates.length', ko: '단골 수와 이번 주 챙길 단골 수' },
    { area: 'upload', sel: '#upload-form', text: 'POST /api/upload (text/csv) → card number stored as sha256 hash + last 2 digits', ko: '카드번호는 sha256 해시 + 끝 두 자리만 저장' },
    { area: 'list', sel: '#result', text: 'GET /api/churn → candidates[]: avgIntervalDays, daysSinceLast, delayRatio ≥ 2.0', ko: '평소 간격보다 두 배 넘게 늦어진 단골만 고른 목록' },
    { area: 'why', sel: '#detail-why', text: 'GET /api/churn → candidates[].timeline: visitDays, excludedDays', ko: '방문한 날과 비·연휴로 뺀 날을 한 줄 달력으로' },
    { area: 'section-profile', sel: 'section[data-testid="section-profile"]', text: 'GET /api/profile/:id', ko: '이 손님의 방문 기록 요약' },
    {
      area: 'section-hint',
      sel: 'section[data-testid="section-hint"]',
      text: function (host) {
        return host.closest('#detail-slot') ? 'GET /api/hint/:id' : 'GET /api/hint/store · /api/hint/change';
      },
      ko: function (host) {
        return host.closest('#detail-slot') ? '이 손님에게 맞춘 한 줄 힌트' : '가게 전체 흐름과 달라진 점 힌트';
      }
    },
    { area: 'section-draft', sel: 'section[data-testid="section-draft"]', text: 'GET /api/draft/:id · POST /api/notices', ko: '안내 문구 초안과 보낸 알림 기록' },
    { area: 'section-memos', sel: 'section[data-testid="section-memos"]', text: 'GET · POST /api/memos · DELETE /api/memos/:id', ko: '사장님 메모 읽기·저장·지우기' },
    { area: 'section-briefing', sel: 'section[data-testid="section-briefing"]', text: 'GET /api/briefing · /api/briefing/history · POST /api/briefing/send', ko: '월요일 브리핑 미리보기·지난 기록·보내기' },
    { area: 'section-returns', sel: 'section[data-testid="section-returns"]', text: 'GET /api/returns', ko: '알림 뒤 14일 안에 돌아온 단골' },
    { area: 'section-reviews', sel: 'section[data-testid="section-reviews"]', text: 'GET /api/reviews · POST /api/reviews/import', ko: '리뷰 목록과 파일로 불러오기' },
    { area: 'section-weather', sel: 'section[data-testid="section-weather"]', text: 'GET /api/weather · POST /api/weather/import', ko: '날씨 기록과 파일로 불러오기(비 온 날을 빼는 데 씀)' }
  ];

  function makeNote(area, text, host, ko) {
    var note = document.createElement('div');
    note.className = 'dev-note';
    note.setAttribute('data-testid', 'dev-note');
    note.setAttribute('data-area', area);
    var tag = document.createElement('span');
    tag.className = 'dev-note-tag';
    tag.textContent = '개발 메모';
    var code = document.createElement('code');
    code.className = 'dev-note-code';
    code.textContent = text;
    // 한국어 문장이 주 줄, 영어 API 원문은 그 아래 작은 보조 줄
    note.appendChild(tag);
    if (ko) {
      var gloss = document.createElement('span');
      gloss.className = 'dev-note-ko';
      gloss.textContent = ko;
      note.appendChild(gloss);
    }
    note.appendChild(code);
    note.dgHost = host;
    return note;
  }

  function hasNote(host, area) {
    var prev = host.previousElementSibling;
    return !!(prev && prev.classList.contains('dev-note') && prev.getAttribute('data-area') === area && prev.dgHost === host);
  }

  function attachAll() {
    var i;
    // 영역이 사라졌거나 쪽지와 떨어진 경우 정리
    var notes = document.querySelectorAll('[data-testid="dev-note"]');
    for (i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (!n.dgHost || n.nextElementSibling !== n.dgHost) n.parentNode.removeChild(n);
    }
    for (i = 0; i < AREAS.length; i++) {
      var a = AREAS[i];
      var hosts = document.querySelectorAll(a.sel);
      for (var j = 0; j < hosts.length; j++) {
        var host = hosts[j];
        if (!host.parentNode || hasNote(host, a.area)) continue;
        var text = typeof a.text === 'function' ? a.text(host) : a.text;
        var ko = typeof a.ko === 'function' ? a.ko(host) : a.ko;
        host.parentNode.insertBefore(makeNote(a.area, text, host, ko), host);
      }
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(function () {
      queued = false;
      if (on) attachAll();
    });
  }

  function removeAll() {
    var notes = document.querySelectorAll('[data-testid="dev-note"]');
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].parentNode) notes[i].parentNode.removeChild(notes[i]);
    }
  }

  function set(next) {
    on = !!next;
    if (on) {
      document.documentElement.dataset.dev = 'on';
      attachAll();
      if (!observer && typeof MutationObserver === 'function') {
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      delete document.documentElement.dataset.dev;
      removeAll();
    }
  }

  window.DGDev = {
    set: set,
    isOn: function () { return on; }
  };
})();
