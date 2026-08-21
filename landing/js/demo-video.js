/** Autoplay del demo al entrar en vista. El navegador exige silencio hasta un toque. */
(function () {
  'use strict';

  var host = document.querySelector('[data-youtube]');
  var section = document.getElementById('demo');
  var soundBtn = document.querySelector('.video-sound');
  if (!host || !section) return;

  var id = host.getAttribute('data-youtube');
  var iframe = null;
  var mounted = false;
  var muted = true;
  var tracked = false;
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function origin() {
    return encodeURIComponent(window.location.origin);
  }

  function embedSrc(opts) {
    return (
      'https://www.youtube-nocookie.com/embed/' +
      encodeURIComponent(id) +
      '?rel=0&playsinline=1&modestbranding=1&enablejsapi=1&origin=' +
      origin() +
      '&autoplay=' +
      (opts.autoplay ? '1' : '0') +
      '&mute=' +
      (opts.mute ? '1' : '0')
    );
  }

  function command(func) {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: func, args: [] }),
      'https://www.youtube-nocookie.com'
    );
  }

  function trackPlay() {
    if (tracked) return;
    tracked = true;
    document.dispatchEvent(new CustomEvent('telar:video-play'));
  }

  function showSound(show) {
    if (!soundBtn) return;
    soundBtn.hidden = !show;
  }

  function mount(opts) {
    if (mounted) return;
    mounted = true;
    muted = !!opts.mute;
    iframe = document.createElement('iframe');
    iframe.src = embedSrc(opts);
    iframe.title = 'Telar en 90 segundos';
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    host.replaceWith(iframe);
    showSound(muted);
    trackPlay();
  }

  function play() {
    if (!mounted) {
      mount({ autoplay: true, mute: true });
      return;
    }
    command('playVideo');
  }

  function pause() {
    if (!mounted) return;
    command('pauseVideo');
  }

  host.addEventListener('click', function () {
    mount({ autoplay: true, mute: false });
  });

  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      if (!mounted) mount({ autoplay: true, mute: false });
      command('unMute');
      command('playVideo');
      muted = false;
      showSound(false);
    });
  }

  if (reduceMotion || !('IntersectionObserver' in window)) return;

  var io = new IntersectionObserver(
    function (entries) {
      var entry = entries[0];
      if (!entry) return;
      if (entry.intersectionRatio >= 0.4) play();
      else if (entry.intersectionRatio < 0.15) pause();
    },
    { threshold: [0, 0.15, 0.4, 0.6] }
  );
  io.observe(section);
})();
