(function () {
  'use strict';

  var reduced = false;
  try {
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    reduced = false;
  }

  var g = !reduced && window.gsap ? window.gsap : null;

  if (g && window.ScrollTrigger) {
    try {
      g.registerPlugin(window.ScrollTrigger);
    } catch (e) {
      /* plugin already registered or unusable: timelines still run without it */
    }
  }

  document.documentElement.dataset.motion = g ? 'on' : 'off';

  window.DGMotion = {
    reduced: reduced,
    gsap: g,
    run: function (play, finalState) {
      if (!g) {
        if (typeof finalState === 'function') finalState();
        return;
      }
      try {
        play(g);
      } catch (e) {
        if (typeof console !== 'undefined' && console.error) console.error(e);
        if (typeof finalState === 'function') finalState();
      }
    },
  };
})();
