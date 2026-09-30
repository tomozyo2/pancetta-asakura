/* PANCETTA BGM
   ・管理画面で入れた音楽（content.js の music）を流します。
   ・ページを開くと自動再生を試します。ブラウザにブロックされたときは、最初のタップ・クリックで開始します。
   ・左下のボタンで停止／再生。自分で止めたあとは、自動では鳴らしません。
   ・音楽が無いときは、ボタンは出ません。 */
(function () {
  var VOLUME = 0.4;
  var EVENTS = ["pointerup", "touchend", "click", "keydown"];

  var css = document.createElement("style");
  css.textContent =
    "#musicBtn{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:40;display:flex;align-items:center;gap:8px;" +
    "background:rgba(20,17,16,.82);color:#c9a45c;border:1px solid rgba(201,164,92,.7);border-radius:999px;padding:10px 16px;" +
    "font:700 13px 'Noto Sans',system-ui,sans-serif;letter-spacing:.12em;cursor:pointer}" +
    "#musicBtn[hidden]{display:none}" +
    "#musicBtn .bars{display:inline-flex;gap:2px;align-items:flex-end;height:12px}" +
    "#musicBtn .bars i{display:block;width:3px;height:4px;background:#c9a45c}" +
    "#musicBtn.on .bars i{animation:mbar .9s ease-in-out infinite}" +
    "#musicBtn.on .bars i:nth-child(2){animation-delay:.3s}" +
    "#musicBtn.on .bars i:nth-child(3){animation-delay:.6s}" +
    "@keyframes mbar{0%,100%{height:4px}50%{height:12px}}" +
    "@media (prefers-reduced-motion:reduce){#musicBtn.on .bars i{animation:none;height:8px}}";
  document.head.appendChild(css);

  var audio = new Audio();
  audio.loop = true;
  audio.volume = VOLUME;
  audio.preload = "none";

  var btn = document.createElement("button");
  btn.id = "musicBtn";
  btn.type = "button";
  btn.hidden = true;
  btn.innerHTML = '<span class="bars"><i></i><i></i><i></i></span><span class="lbl">MUSIC</span>';
  document.body.appendChild(btn);

  var userStopped = false;   // お客さんが自分で止めたら、もう自動では鳴らさない
  var waiting = false;

  function setOn(on) {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Turn music off" : "Turn music on");
  }
  setOn(false);

  function start() {
    return audio.play().then(function () { setOn(true); stopWaiting(); }).catch(function () { setOn(false); });
  }
  function onFirstTouch() {
    if (!userStopped && audio.paused && audio.getAttribute("src")) start();
  }
  function startWaiting() {
    if (waiting) return;
    waiting = true;
    EVENTS.forEach(function (e) { document.addEventListener(e, onFirstTouch, true); });
  }
  function stopWaiting() {
    waiting = false;
    EVENTS.forEach(function (e) { document.removeEventListener(e, onFirstTouch, true); });
  }

  function setSrc(url) {
    audio.src = url;
    btn.hidden = false;
  }
  function clearSrc() {
    stopWaiting();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    btn.hidden = true;
    setOn(false);
  }
  function begin() {
    audio.preload = "auto";
    start();            // 1) まず、そのまま自動再生を試す
    startWaiting();     // 2) ブロックされたら、最初の操作で開始する
  }

  btn.addEventListener("click", function () {
    if (audio.paused) {
      userStopped = false;
      start();
    } else {
      userStopped = true;
      audio.pause(); setOn(false); stopWaiting();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && !audio.paused) { audio.pause(); setOn(false); }
  });

  // 管理画面から使う窓口
  window.PancettaMusic = {
    play: function (url) { userStopped = false; setSrc(url); return start(); },
    clear: clearSrc
  };

  // 保存されている音楽を読み込む
  var m = (window.SITE_CONTENT || {}).music;
  if (m && m.v) {
    setSrc("music.mp3?v=" + m.v);
    begin();
  } else if (m === undefined) {
    // content.js に記録がないとき（music.mp3 を直接置いた場合）は、ファイルの有無を見る
    fetch("music.mp3", { method: "HEAD" }).then(function (res) {
      if (res.ok) { setSrc("music.mp3"); begin(); }
    }).catch(function () {});
  }
})();
