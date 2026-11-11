(function(){ window.regulars.register({ id:'profile', mount:{tab:'home', slot:'detail', order:10}, title:'단골 프로필',
  render: function (el, ctx) {
    if (!ctx.candidate) return;
    var path = '/api/profile/' + encodeURIComponent(ctx.candidate.customerId);
    if (ctx.asOf) path += '?asOf=' + encodeURIComponent(ctx.asOf);
    return window.regulars.api(path).then(function (data) {
      el.textContent = '';
      var p = document.createElement('p');
      p.setAttribute('data-testid', 'profile-line');
      p.textContent = data.line;
      el.appendChild(p);
    });
  }
}); })();
