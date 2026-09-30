/* PANCETTA 写真の表示（誰が開いても動く部分）
   content.js に書かれた写真の位置情報を読んで、images フォルダの写真を枠にはめ込みます。 */
(function () {
  var src = (window.SITE_CONTENT && window.SITE_CONTENT.photos) || {};
  var P = (window.PHOTOS = JSON.parse(JSON.stringify(src)));

  function srcOf(key, p) {
    return p.dataUrl || "images/" + key + ".jpg?v=" + (p.v || 0);
  }

  function applyTo(el) {
    var p = P[el.dataset.slot];
    var img = null, i, kids = el.children;
    for (i = 0; i < kids.length; i++) {
      if (kids[i].classList.contains("pimg")) { img = kids[i]; break; }
    }
    if (p && (p.dataUrl || p.v)) {
      if (!img) {
        img = document.createElement("img");
        img.className = "pimg";
        img.decoding = "async";
        el.insertBefore(img, el.firstChild);
      }
      img.alt = el.dataset.alt || "";
      var s = srcOf(el.dataset.slot, p);
      if (img.getAttribute("src") !== s) img.src = s;
      var pos = (p.x == null ? 50 : p.x) + "% " + (p.y == null ? 50 : p.y) + "%";
      img.style.objectPosition = pos;
      img.style.transformOrigin = pos;
      img.style.transform = "scale(" + ((p.z || 100) / 100) + ")";
      el.classList.add("has");
    } else {
      if (img) img.remove();
      el.classList.remove("has");
    }
  }

  window.applyPhotos = function (key) {
    var sel = key ? '[data-slot="' + key + '"]' : "[data-slot]";
    document.querySelectorAll(sel).forEach(applyTo);
  };
  window.applyPhotos();
})();
