(function () {
  "use strict";

  var LS_CUSTOM = "wk-custom-walls";
  var LS_HIDDEN = "wk-hidden-walls";
  var LS_SOCIALS = "wk-social-links";
  var LS_THEME = "wk-theme";

  /* ---------- helpers ---------- */
  function lsSave(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function lsLoad(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") el.className = v;
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function fileToDataUrl(file, maxSide) {
    maxSide = maxSide || 1600;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("load")); };
      img.src = url;
    });
  }
  function downloadWall(wall) {
    if (wall.link) { window.open(wall.link, "_blank", "noopener"); return; }
    var a = document.createElement("a");
    a.download = wall.id + ".jpg";
    a.href = wall.src;
    a.click();
  }

  /* ---------- state ---------- */
  var root = document.getElementById("root");
  var state = {
    theme: "light",
    activeId: null,
    customWalls: lsLoad(LS_CUSTOM, []),
    hiddenIds: lsLoad(LS_HIDDEN, []),
    socialLinks: lsLoad(LS_SOCIALS, {}),
    cpMsg: ""
  };

  try {
    var stored = localStorage.getItem(LS_THEME);
    if (stored === "light" || stored === "dark") state.theme = stored;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) state.theme = "dark";
  } catch (e) {}

  function displayWalls() {
    return WALLPAPERS.filter(function (w) { return state.hiddenIds.indexOf(w.id) === -1; }).concat(state.customWalls);
  }
  function socials() {
    return SOCIALS.map(function (s) {
      return { key: s.key, label: s.label, href: state.socialLinks[s.key] != null ? state.socialLinks[s.key] : s.href };
    });
  }

  /* ---------- layers ---------- */
  var gridEl, themeBtnPath, socialsEl;
  var overlayHost = h("div", {});

  function applyTheme() {
    root.setAttribute("data-theme", state.theme);
    if (themeBtnPath) themeBtnPath.setAttribute("d", state.theme === "dark" ? SUN_PATH : MOON_PATH);
  }
  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(LS_THEME, state.theme); } catch (e) {}
    applyTheme();
  }

  /* ---------- gallery ---------- */
  function renderGrid() {
    gridEl.innerHTML = "";
    displayWalls().forEach(function (wall) {
      var lastTap = 0;
      var btn = h("button", {
        class: "wk-dl" + (state.activeId === wall.id ? " show" : ""),
        tabindex: state.activeId === wall.id ? "0" : "-1",
        onclick: function (e) { e.stopPropagation(); downloadWall(wall); }
      }, ["تحميل"]);
      var card = h("div", {
        class: "wk-card",
        onclick: function (e) {
          e.stopPropagation();
          var now = Date.now();
          if (now - lastTap < 320) {
            lastTap = 0;
            state.activeId = null;
            renderGrid();
            openViewer(wall);
          } else {
            lastTap = now;
            state.activeId = state.activeId === wall.id ? null : wall.id;
            // update buttons without rebuilding (keeps double-tap timing)
            Array.prototype.forEach.call(gridEl.children, function (c, i) {
              var w = displayWalls()[i];
              var b = c.querySelector(".wk-dl");
              var on = w && w.id === state.activeId;
              b.classList.toggle("show", on);
              b.tabIndex = on ? 0 : -1;
            });
          }
        }
      }, [h("img", { src: wall.src, alt: wall.id, loading: "lazy" }), h("div", { class: "wk-noise" }), btn]);
      gridEl.appendChild(card);
    });
  }

  /* ---------- viewer ---------- */
  function openViewer(wall) {
    var viewer = h("div", { class: "wk-viewer", onclick: close }, [
      h("div", { class: "wk-viewer-bg", style: 'background-image:url("' + wall.src + '")' }),
      h("div", { class: "wk-viewer-stack", onclick: function (e) { e.stopPropagation(); } }, [
        h("div", { class: "wk-viewer-img" }, [h("img", { src: wall.src, alt: wall.id })]),
        h("div", { class: "wk-viewer-btns" }, [
          h("button", { class: "wk-viewer-dl", onclick: function () { downloadWall(wall); } }, ["تحميل"]),
          h("button", { class: "wk-viewer-close", onclick: close }, ["اغلاق"])
        ])
      ])
    ]);
    function close() { viewer.remove(); }
    root.appendChild(viewer);
  }

  /* ---------- control panel ---------- */
  function closeOverlay() { overlayHost.innerHTML = ""; }

  function openLogin() {
    var shake = false;
    var input = h("input", {
      class: "wk-cp-input", type: "password", dir: "rtl", placeholder: "كلمة السر", autocomplete: "off",
      oninput: function () { input.classList.remove("err"); var er = dialog.querySelector(".wk-cp-error"); if (er) er.remove(); },
      onkeydown: function (e) { if (e.key === "Enter") submit(); }
    });
    var dialog = h("div", { class: "wk-cp-dialog", onclick: function (e) { e.stopPropagation(); },
      onanimationend: function () { dialog.classList.remove("shake"); } }, [
      h("h2", {}, ["لوحة التحكم"]),
      h("p", { class: "wk-cp-sub" }, ["أدخل كلمة السر للدخول"]),
      input,
      h("button", { class: "wk-cp-gold", onclick: submit }, ["دخول"]),
      h("button", { class: "wk-cp-ghost", onclick: closeOverlay }, ["إلغاء"])
    ]);
    function submit() {
      if (input.value === CP_PASSWORD) {
        state.cpMsg = "";
        openPanel();
      } else {
        input.value = "";
        input.classList.add("err");
        if (!dialog.querySelector(".wk-cp-error")) {
          dialog.insertBefore(h("div", { class: "wk-cp-error" }, ["كلمة السر غير صحيحة"]), input.nextSibling);
        }
        dialog.classList.remove("shake");
        void dialog.offsetWidth;
        dialog.classList.add("shake");
      }
    }
    overlayHost.innerHTML = "";
    overlayHost.appendChild(h("div", { class: "wk-cp-overlay", onclick: closeOverlay }, [dialog]));
    input.focus();
  }

  function openPanel() {
    var picked = null, pickedUrl = null, busy = false, confirmId = null;
    var linkInput;

    function render() {
      if (pickedUrl) { /* keep */ }
      var walls = displayWalls();
      var fileInput = h("input", { type: "file", accept: "image/*", hidden: true, onchange: function (e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (f) {
          if (pickedUrl) URL.revokeObjectURL(pickedUrl);
          picked = f; pickedUrl = URL.createObjectURL(f);
          keepLink(); render();
        }
      } });
      var savedLink = linkInput ? linkInput.value : "";
      linkInput = h("input", { class: "wk-cp-input small", dir: "ltr", placeholder: "https://..." });
      linkInput.value = savedLink;

      var addSection = h("section", {}, [
        h("h3", {}, ["إضافة خلفية"]),
        fileInput,
        h("button", { class: "wk-cp-ghost wk-cp-pick", disabled: busy, onclick: function () { fileInput.click(); } },
          [picked ? "تغيير الصورة" : "اختيار صورة من الجهاز"]),
        picked ? h("div", { class: "wk-cp-row" }, [
          h("div", { class: "wk-cp-thumb" }, [h("img", { src: pickedUrl, alt: "" })]),
          h("div", { class: "wk-cp-name" }, [picked.name])
        ]) : null,
        h("label", { class: "wk-cp-field" }, [h("span", {}, ["رابط تحميل الصورة (اختياري)"]), linkInput]),
        h("button", { class: "wk-cp-gold", disabled: busy || !picked, onclick: save }, [busy ? "جارٍ الحفظ..." : "حفظ"])
      ]);

      var list = h("div", { class: "wk-cp-list" }, walls.map(function (w) {
        var delBtn = confirmId === w.id
          ? h("button", { class: "wk-cp-del sure", onclick: function () { deleteWall(w.id); confirmId = null; keepLink(); render(); } }, ["تأكيد الحذف"])
          : h("button", { class: "wk-cp-del", onclick: function () { confirmId = w.id; keepLink(); render(); } }, ["حذف"]);
        return h("div", { class: "wk-cp-row" }, [
          h("div", { class: "wk-cp-thumb" }, [h("img", { src: w.src, alt: w.id })]),
          h("div", { class: "wk-cp-name" }, [w.id.indexOf("custom-") === 0 ? "خلفية مضافة" : w.id]),
          delBtn
        ]);
      }));
      if (!walls.length) list.appendChild(h("div", { class: "wk-cp-empty" }, ["لا توجد خلفيات"]));

      var listSection = h("section", {}, [
        h("h3", {}, ["الخلفيات (" + walls.length + ")"]),
        list,
        state.hiddenIds.length ? h("button", { class: "wk-cp-ghost", onclick: function () {
          state.hiddenIds = []; lsSave(LS_HIDDEN, []); state.cpMsg = "تمت استعادة الخلفيات ✓";
          renderGrid(); keepLink(); render();
        } }, ["استعادة الخلفيات المحذوفة (" + state.hiddenIds.length + ")"]) : null
      ]);

      var socialSection = h("section", {}, [h("h3", {}, ["روابط التواصل"])].concat(socials().map(function (s) {
        var inp = h("input", { class: "wk-cp-input small", dir: "ltr", oninput: function () {
          state.socialLinks[s.key] = inp.value; lsSave(LS_SOCIALS, state.socialLinks); renderSocials();
        } });
        inp.value = s.href;
        return h("label", { class: "wk-cp-field" }, [h("span", {}, [s.label]), inp]);
      })));

      var sheet = h("div", { class: "wk-cp-sheet", onclick: function (e) { e.stopPropagation(); } }, [
        h("div", { class: "wk-cp-head" }, [
          h("h2", {}, ["لوحة التحكم"]),
          h("button", { class: "wk-cp-x", "aria-label": "إغلاق", onclick: closeOverlay }, ["✕"])
        ]),
        state.cpMsg ? h("div", { class: "wk-cp-msg" }, [state.cpMsg]) : null,
        addSection, listSection, socialSection,
        h("button", { class: "wk-cp-ghost", onclick: closeOverlay }, ["تسجيل الخروج"])
      ]);

      var prevScroll = overlayHost.firstChild && overlayHost.firstChild.firstChild ? overlayHost.firstChild.firstChild.scrollTop : 0;
      overlayHost.innerHTML = "";
      overlayHost.appendChild(h("div", { class: "wk-cp-overlay", onclick: closeOverlay }, [sheet]));
      sheet.scrollTop = prevScroll;
    }
    function keepLink() { /* link value is preserved inside render() */ }

    function save() {
      if (!picked) return;
      busy = true; render();
      var clean = (linkInput.value || "").trim();
      var fullLink = clean && !/^https?:\/\//i.test(clean) ? "https://" + clean : clean;
      fileToDataUrl(picked).then(function (src) {
        var wall = { id: "custom-" + Date.now(), src: src };
        if (fullLink) wall.link = fullLink;
        state.customWalls = state.customWalls.concat([wall]);
        state.cpMsg = lsSave(LS_CUSTOM, state.customWalls) ? "تمت إضافة الخلفية ✓" : "أُضيفت الخلفية لكن تعذّر حفظها (المساحة ممتلئة)";
        if (pickedUrl) URL.revokeObjectURL(pickedUrl);
        picked = null; pickedUrl = null; linkInput = null; busy = false;
        renderGrid(); render();
      }).catch(function () {
        state.cpMsg = "تعذّر قراءة الصورة"; busy = false; render();
      });
    }
    function deleteWall(id) {
      if (id.indexOf("custom-") === 0) {
        state.customWalls = state.customWalls.filter(function (w) { return w.id !== id; });
        lsSave(LS_CUSTOM, state.customWalls);
      } else {
        state.hiddenIds = state.hiddenIds.concat([id]);
        lsSave(LS_HIDDEN, state.hiddenIds);
      }
      state.cpMsg = "تم الحذف ✓";
      renderGrid();
    }
    render();
  }

  /* ---------- page ---------- */
  function renderSocials() {
    socialsEl.innerHTML = "";
    socials().forEach(function (s) {
      socialsEl.appendChild(h("a", { class: "wk-social-pill " + s.key, href: s.href, target: "_blank", rel: "noopener noreferrer" },
        [h("span", {}, [s.label])]));
    });
  }

  function build() {
    var NS = "http://www.w3.org/2000/svg";
    var sliders = document.createElementNS(NS, "svg");
    sliders.setAttribute("viewBox", "0 0 24 24");
    sliders.setAttribute("fill", "none");
    sliders.setAttribute("stroke", "currentColor");
    sliders.setAttribute("stroke-width", "2");
    sliders.setAttribute("stroke-linecap", "round");
    sliders.innerHTML =
      '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/>' +
      '<line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/>' +
      '<line x1="4" y1="18" x2="20" y2="18"/><circle cx="11" cy="18" r="2" fill="currentColor" stroke="none"/>';

    var themeSvg = document.createElementNS(NS, "svg");
    themeSvg.setAttribute("viewBox", "0 0 24 24");
    themeSvg.setAttribute("fill", "currentColor");
    themeBtnPath = document.createElementNS(NS, "path");
    themeSvg.appendChild(themeBtnPath);

    gridEl = h("div", { class: "wk-grid" });
    socialsEl = h("div", { class: "wk-socials" });

    var wrap = h("div", { class: "wk-wrap", onclick: function () {
      if (state.activeId) { state.activeId = null; renderGrid(); }
    } }, [
      h("header", {}, [
        h("div", { class: "wk-icon-row" }, [
          h("button", { class: "wk-icon-btn", "aria-label": "لوحة التحكم", onclick: function (e) { e.stopPropagation(); openLogin(); } }, [sliders]),
          h("button", { class: "wk-icon-btn", "aria-label": "تبديل الوضع الليلي والنهاري", onclick: function (e) { e.stopPropagation(); toggleTheme(); } }, [themeSvg])
        ]),
        h("div", { class: "wk-brand" }, ["Wall", h("span", { class: "wk-accent" }, ["Khattab"])])
      ]),
      h("div", { class: "wk-hero" }, [
        h("h1", {}, ["ارفع مستوى ", h("span", { class: "wk-g" }, ["شاشتك"])]),
        h("p", {}, ["خلفيات عالية الدقة — مجاناً"])
      ]),
      gridEl
    ]);

    root.appendChild(wrap);
    root.appendChild(overlayHost);
    root.appendChild(socialsEl);
    applyTheme();
    renderGrid();
    renderSocials();
  }

  build();
})();
