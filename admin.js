/* =========================================================
   PANCETTA 管理者モード（写真の入れ替え・位置調整 → GitHubに保存）

   スマホ →(合言葉)→ 中継所(Cloudflare Worker) →(GitHubの鍵)→ GitHub

   ・合言葉とGitHubの鍵は中継所だけが持っています。このファイルには書きません。
   ・「保存して公開」を押すと、写真(images/)と content.js がGitHubに保存され、
     1〜2分後にホームページへ反映されます。
   ・リポジトリ名や中継所のURLを変えたときは、下の設定を書き換えてください。
   ========================================================= */
(function () {
  var GITHUB_OWNER = "tomozyo2";
  var GITHUB_REPO = "pancetta-asakura";
  var GITHUB_BRANCH = "main";
  var CONTENT_PATH = "content.js";
  var RELAY_URL = "https://pancetta-admin-relay.amagifc.workers.dev";
  var PASS_KEY = "pancetta-passphrase";

  var SLOTS = [
    ["01-samurai-bolognese-top", "侍ボロネーゼ（トップ用・横長）"],
    ["02-samurai-bolognese-angle", "侍ボロネーゼ 別角度"],
    ["03-kombu", "昆布"],
    ["04-dried-shiitake", "干し椎茸"],
    ["05-kosho-chicken-pasta", "古処鶏と朝倉ねぎのパスタ"],
    ["06-roman-pizza", "ローマ風ピッツァ"],
    ["07-antipasti", "前菜盛り"],
    ["08-antipasti-sake", "前菜＋日本酒"],
    ["09-sake-wineglass", "日本酒＋ワイングラス"],
    ["10-interior", "店内"],
    ["11-terrace", "テラス"],
    ["12-exterior-day", "外観・昼"],
    ["13-exterior-night", "外観・夜"],
    ["asakura-landscape", "朝倉の風景"]
  ];

  var P = window.PHOTOS || (window.PHOTOS = {});
  var touched = {};   // 変更した写真 key -> true
  var newB64 = {};    // 新しく選んだ写真 key -> base64（JPEG）
  var pass = "";
  var rows = {};

  function $(id) { return document.getElementById(id); }
  function apply(key) { if (window.applyPhotos) window.applyPhotos(key); }

  /* ---------- 画面部品を作る ---------- */
  var root = document.createElement("div");
  root.innerHTML =
    '<button id="lockBtn" type="button" aria-label="管理者モード"><span id="lockIcon">🔒</span><span id="lockTxt">管理者</span></button>' +
    '<div id="lockToast" hidden></div>' +
    '<div id="pwBox" hidden><div class="pw-card"><strong>管理者ログイン</strong>' +
      '<label for="pwIn">合言葉</label>' +
      '<input id="pwIn" type="password" autocomplete="off">' +
      '<div class="as-st err" id="pwErr"></div>' +
      '<div class="as-acts"><button type="button" class="as-btn" id="pwOk">入る</button>' +
      '<button type="button" class="as-btn ghost" id="pwCancel">やめる</button></div></div></div>' +
    '<div id="adminBar" hidden>' +
      '<button id="adminFab" type="button">📷 写真の一覧</button>' +
      '<button id="saveBtn" type="button">💾 保存して公開</button>' +
    '</div>' +
    '<div id="adminSheet" hidden>' +
      '<div class="as-head"><strong>写真の入れ替え</strong><button class="as-btn" id="asClose" type="button">閉じる</button></div>' +
      '<p class="as-note">「写真を選ぶ」で写真を選び、バーで位置と大きさを合わせます。最後に「保存して公開」を押すと、ホームページに反映されます（1〜2分かかります）。</p>' +
      '<div id="asList"></div>' +
    '</div>';
  document.body.appendChild(root);

  function toast(text) {
    var t = $("lockToast");
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 7000);
  }

  function status(key, text, err) {
    var s = rows[key] && rows[key].st; if (!s) return;
    s.textContent = text || ""; s.className = "as-st" + (err ? " err" : "");
  }

  function markDirty() {
    var n = Object.keys(touched).length;
    $("saveBtn").textContent = n ? "💾 保存して公開（" + n + "件）" : "💾 保存して公開";
    $("saveBtn").className = n ? "dirty" : "";
  }

  /* ---------- 写真を小さくする ---------- */
  function shrink(file) {
    return createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bmp) {
      var s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.85);
    });
  }

  function pick(key, file) {
    status(key, "読み込み中…");
    shrink(file).then(function (dataUrl) {
      P[key] = { dataUrl: dataUrl, v: (P[key] && P[key].v) || 0, x: 50, y: 50, z: 100 };
      newB64[key] = dataUrl.split(",")[1];
      touched[key] = true;
      apply(key); sync(); markDirty();
      status(key, "選びました。位置を調整して「保存して公開」を押してください。");
    }).catch(function () {
      status(key, "この写真は読み込めませんでした。JPGかPNGの写真を選んでください。", true);
    });
  }

  function removePhoto(key) {
    delete P[key]; delete newB64[key];
    touched[key] = true;
    apply(key); sync(); markDirty();
    status(key, "写真を外しました。「保存して公開」で反映されます。");
  }

  function sync() {
    SLOTS.forEach(function (s) {
      var r = rows[s[0]]; if (!r) return;
      var p = P[s[0]];
      r.ctl.hidden = !p;
      if (p) { r.x.value = p.x == null ? 50 : p.x; r.y.value = p.y == null ? 50 : p.y; r.z.value = p.z || 100; }
    });
  }

  /* ---------- 一覧パネル ---------- */
  function buildPanel() {
    var list = $("asList");
    SLOTS.forEach(function (s) {
      var key = s[0], row = document.createElement("div");
      row.className = "as-row";
      row.innerHTML =
        '<div class="as-top"><div><b></b><small>' + key + '.jpg</small></div>' +
        '<label class="as-btn pick">写真を選ぶ<input type="file" accept="image/*" hidden></label></div>' +
        '<div class="photo pv" data-slot="' + key + '"><span class="ph">まだ写真がありません</span></div>' +
        '<div class="as-ctl" hidden>' +
          '<label>左右<input type="range" min="0" max="100" step="1" data-f="x"></label>' +
          '<label>上下<input type="range" min="0" max="100" step="1" data-f="y"></label>' +
          '<label>拡大<input type="range" min="100" max="300" step="1" data-f="z"></label>' +
          '<div class="as-acts"><button type="button" class="as-btn ghost" data-a="go">ページで見る</button>' +
          '<button type="button" class="as-btn ghost" data-a="rm">写真を外す</button></div>' +
        '</div><div class="as-st"></div>';
      row.querySelector("b").textContent = s[1];
      row.querySelector(".pv").dataset.alt = s[1];
      list.appendChild(row);
      var r = rows[key] = {
        el: row, ctl: row.querySelector(".as-ctl"), st: row.querySelector(".as-st"),
        x: row.querySelector('[data-f="x"]'), y: row.querySelector('[data-f="y"]'), z: row.querySelector('[data-f="z"]')
      };
      row.querySelector('input[type="file"]').addEventListener("change", function (ev) {
        var f = ev.target.files && ev.target.files[0]; ev.target.value = "";
        if (f) pick(key, f);
      });
      ["x", "y", "z"].forEach(function (f) {
        r[f].addEventListener("input", function () {
          var p = P[key]; if (!p) return;
          p.x = +r.x.value; p.y = +r.y.value; p.z = +r.z.value;
          touched[key] = true; apply(key); markDirty();
        });
      });
      var rmTimer = null;
      row.querySelector('[data-a="rm"]').addEventListener("click", function (ev) {
        var b = ev.currentTarget;
        if (b.dataset.armed) { b.dataset.armed = ""; b.textContent = "写真を外す"; clearTimeout(rmTimer); removePhoto(key); return; }
        b.dataset.armed = "1"; b.textContent = "もう一度押すと外します";
        rmTimer = setTimeout(function () { b.dataset.armed = ""; b.textContent = "写真を外す"; }, 3000);
      });
      row.querySelector('[data-a="go"]').addEventListener("click", function () {
        var t = document.querySelector('.photo:not(.pv)[data-slot="' + key + '"]');
        $("adminSheet").hidden = true;
        if (t) t.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    // ページ上の各写真に出るボタン
    document.querySelectorAll(".photo[data-slot]:not(.pv)").forEach(function (el) {
      var key = el.dataset.slot, box = document.createElement("div");
      box.className = "pctl";
      box.innerHTML = '<label class="as-btn pick sm">写真を変更<input type="file" accept="image/*" hidden></label>' +
        '<button type="button" class="as-btn sm">位置を調整</button>';
      el.appendChild(box);
      box.querySelector("input").addEventListener("change", function (ev) {
        var f = ev.target.files && ev.target.files[0]; ev.target.value = "";
        if (f) pick(key, f);
      });
      box.querySelector("button").addEventListener("click", function () {
        $("adminSheet").hidden = false;
        var r = rows[key]; if (r && r.el) r.el.scrollIntoView({ block: "start" });
      });
    });
    apply(); sync();
  }

  /* ---------- GitHubへ保存（中継所経由） ---------- */
  function ghUrl(path, withRef) {
    return RELAY_URL + "/gh/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/" + path +
      (withRef ? "?ref=" + GITHUB_BRANCH : "");
  }
  function ghFetch(method, path, body) {
    var opt = { method: method, cache: "no-store", headers: { "X-Passphrase": pass, "Accept": "application/vnd.github+json" } };
    if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(ghUrl(path, method === "GET"), opt);
  }
  function getFile(path) {
    return ghFetch("GET", path).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("GET " + res.status);
      return res.json();
    });
  }
  function putFile(path, b64, sha, message) {
    var body = { message: message, content: b64, branch: GITHUB_BRANCH };
    if (sha) body.sha = sha;
    return ghFetch("PUT", path, body).then(function (res) {
      if (!res.ok) throw new Error("PUT " + res.status);
      return res.json();
    });
  }
  function utf8ToB64(text) {
    var bytes = new TextEncoder().encode(text), bin = "", i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, "")), bytes = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  var saving = false;
  function save() {
    var keys = Object.keys(touched);
    if (!keys.length) { toast("変更はありません。"); return; }
    if (saving) return;
    saving = true;
    var btn = $("saveBtn"); btn.disabled = true; btn.textContent = "保存しています…";
    var now = Date.now();
    var chainP = Promise.resolve();

    keys.forEach(function (key) {
      if (!newB64[key]) return;
      chainP = chainP.then(function () {
        var path = "images/" + key + ".jpg";
        return getFile(path).then(function (f) {
          return putFile(path, newB64[key], f && f.sha, "写真を更新: " + key);
        });
      });
    });

    chainP = chainP.then(function () {
      return getFile(CONTENT_PATH);
    }).then(function (f) {
      var photos = {};
      if (f) {
        try {
          var txt = b64ToUtf8(f.content);
          var m = txt.match(/=\s*([\s\S]*?);?\s*$/);
          var cur = JSON.parse(m[1]);
          photos = cur.photos || {};
        } catch (e) { photos = {}; }
      }
      keys.forEach(function (key) {
        var p = P[key];
        if (!p) { delete photos[key]; return; }
        var v = newB64[key] ? now : (p.v || (photos[key] && photos[key].v) || now);
        photos[key] = { v: v, x: p.x == null ? 50 : p.x, y: p.y == null ? 50 : p.y, z: p.z || 100 };
        p.v = v;
      });
      var out = "window.SITE_CONTENT = " + JSON.stringify({ photos: photos }, null, 2) + ";\n";
      return putFile(CONTENT_PATH, utf8ToB64(out), f && f.sha, "写真の位置を更新");
    }).then(function () {
      keys.forEach(function (k) { delete touched[k]; delete newB64[k]; status(k, "保存しました。"); });
      toast("保存しました。ホームページへの反映まで1〜2分かかります。");
    }).catch(function (e) {
      var m = String(e && e.message || "");
      if (/401/.test(m)) toast("合言葉が違うか、期限切れです。もう一度ログインしてください。");
      else if (/403|502|503/.test(m)) toast("保存できませんでした。中継所またはGitHubの設定を確認してください（" + m + "）。");
      else toast("保存できませんでした。通信を確認して、もう一度押してください（" + m + "）。");
    }).then(function () {
      saving = false; btn.disabled = false; markDirty();
    });
  }

  /* ---------- ログイン ---------- */
  function setAdmin(on) {
    document.body.classList.toggle("adminmode", on);
    $("lockIcon").textContent = on ? "🔓" : "🔒";
    $("lockTxt").textContent = on ? "管理者モード中" : "管理者";
    $("adminBar").hidden = !on;
    if (!on) $("adminSheet").hidden = true;
  }
  function closePw() { $("pwBox").hidden = true; $("pwIn").value = ""; $("pwErr").textContent = ""; }

  function login(given, silent) {
    return fetch(RELAY_URL + "/check", { headers: { "X-Passphrase": given }, cache: "no-store" }).then(function (res) {
      if (res.ok) {
        pass = given;
        try { sessionStorage.setItem(PASS_KEY, given); } catch (e) {}
        closePw(); setAdmin(true);
      } else if (!silent) {
        $("pwErr").textContent = "合言葉が違います。";
      } else {
        try { sessionStorage.removeItem(PASS_KEY); } catch (e) {}
      }
    }).catch(function () {
      if (!silent) $("pwErr").textContent = "中継所につながりませんでした。設定を確認してください。";
    });
  }

  buildPanel();
  $("lockBtn").addEventListener("click", function () {
    if (document.body.classList.contains("adminmode")) {
      if (Object.keys(touched).length && !window.confirmedLeave) {
        toast("まだ保存していない変更があります。「保存して公開」を押してから閉じてください。もう一度鍵を押すと、保存せずに終了します。");
        window.confirmedLeave = true; return;
      }
      window.confirmedLeave = false;
      pass = ""; try { sessionStorage.removeItem(PASS_KEY); } catch (e) {}
      setAdmin(false); return;
    }
    $("pwBox").hidden = false; $("pwIn").focus();
  });
  $("pwOk").addEventListener("click", function () { login($("pwIn").value, false); });
  $("pwCancel").addEventListener("click", closePw);
  $("pwIn").addEventListener("keydown", function (ev) { if (ev.key === "Enter") login($("pwIn").value, false); });
  $("adminFab").addEventListener("click", function () { $("adminSheet").hidden = false; });
  $("asClose").addEventListener("click", function () { $("adminSheet").hidden = true; });
  $("saveBtn").addEventListener("click", save);
  window.addEventListener("beforeunload", function (ev) {
    if (Object.keys(touched).length) { ev.preventDefault(); ev.returnValue = ""; }
  });

  try {
    var saved = sessionStorage.getItem(PASS_KEY);
    if (saved) login(saved, true);
  } catch (e) {}
})();
