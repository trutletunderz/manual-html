/* ============================================================
   Pedpro Testing & QE Field Manual — shared behaviour
   ไม่ใช้ localStorage / sessionStorage โดยเจตนา
   ============================================================ */
(function () {
  "use strict";

  var main = document.querySelector(".main");
  var tocEl = document.getElementById("toc");
  var railCol = document.querySelector(".rail-col");

  /* ---------------------------------------------------------
     1. slug + heading prep
     --------------------------------------------------------- */
  function slug(txt) {
    return txt
      .trim()
      .replace(/[⭐★]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9._-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  }

  var heads = main ? Array.prototype.slice.call(main.querySelectorAll("h2, h3, h4")) : [];
  var used = {};

  heads.forEach(function (h) {
    if (!h.id) {
      var base = slug(h.textContent) || "s";
      used[base] = (used[base] || 0) + 1;
      h.id = used[base] > 1 ? base + "-" + used[base] : base;
    }
    // ⭐ ในหัวข้อ = สัญญาณความสำคัญ → ขีดทองที่ขอบซ้าย
    if (/[⭐★]/.test(h.textContent)) h.classList.add("imp");
  });

  /* ---------------------------------------------------------
     2. build page TOC
     --------------------------------------------------------- */
  if (tocEl && heads.length) {
    var ul = document.createElement("ul");
    heads.forEach(function (h) {
      var lv = +h.tagName.slice(1);
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.className = lv === 3 ? "lv3" : lv === 4 ? "lv4" : "lv2";
      if (/[⭐★]/.test(h.textContent)) a.classList.add("star");
      a.textContent = h.textContent.replace(/[⭐★]/g, "").trim();
      li.appendChild(a);
      ul.appendChild(li);
    });
    var empty = document.createElement("div");
    empty.className = "toc-empty";
    empty.textContent = "ไม่พบหัวข้อที่ตรงกัน";
    tocEl.appendChild(ul);
    tocEl.appendChild(empty);
  }

  /* ---------------------------------------------------------
     3. scrollspy
     --------------------------------------------------------- */
  var links = tocEl ? Array.prototype.slice.call(tocEl.querySelectorAll("a")) : [];
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });

  var visible = new Set();

  function paint() {
    if (!links.length) return;
    var best = null, bestTop = Infinity;
    visible.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var t = el.getBoundingClientRect().top;
      if (t < bestTop) { bestTop = t; best = id; }
    });
    if (!best) {
      // ไม่มีหัวข้อในจอ → เลือกหัวข้อสุดท้ายที่ผ่านไปแล้ว
      for (var i = heads.length - 1; i >= 0; i--) {
        if (heads[i].getBoundingClientRect().top < 120) { best = heads[i].id; break; }
      }
    }
    links.forEach(function (a) { a.classList.remove("on"); });
    if (best && byId[best]) {
      byId[best].classList.add("on");
      var a = byId[best];
      var rTop = railCol.scrollTop, rBot = rTop + railCol.clientHeight;
      var aTop = a.offsetTop, aBot = aTop + a.offsetHeight;
      if (aTop < rTop + 60 || aBot > rBot - 40) {
        railCol.scrollTo({ top: aTop - railCol.clientHeight / 2, behavior: "auto" });
      }
    }
  }

  if ("IntersectionObserver" in window && heads.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      });
      paint();
    }, { rootMargin: "-" + (56 + 24) + "px 0px -70% 0px", threshold: 0 });
    heads.forEach(function (h) { io.observe(h); });
    window.addEventListener("scroll", function () {
      clearTimeout(paint._t);
      paint._t = setTimeout(paint, 90);
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     4. copy buttons
     --------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll(".code"), function (box) {
    var bar = box.querySelector(".code-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "code-bar";
      bar.innerHTML = '<span class="code-lang">code</span>';
      box.insertBefore(bar, box.firstChild);
    }
    if (bar.querySelector(".code-copy")) return;
    var btn = document.createElement("button");
    btn.className = "code-copy";
    btn.type = "button";
    btn.textContent = "คัดลอก";
    btn.addEventListener("click", function () {
      var pre = box.querySelector("pre");
      var txt = pre ? pre.innerText : "";
      var done = function () {
        btn.textContent = "คัดลอกแล้ว ✓";
        btn.classList.add("done");
        setTimeout(function () { btn.textContent = "คัดลอก"; btn.classList.remove("done"); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, fallback);
      } else fallback();
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
    bar.appendChild(btn);
  });

  /* ---------------------------------------------------------
     5. collapsible h3 sections
     หมายเหตุ: default = กางไว้ เพื่อให้ Ctrl+F ของเบราว์เซอร์
     ค้นเจอทั้งหน้า — reference guide ต้องค้นได้ก่อนต้องสวย
     --------------------------------------------------------- */
  var folds = [];
  heads.filter(function (h) { return h.tagName === "H3"; }).forEach(function (h3) {
    var body = document.createElement("div");
    body.className = "fold-b";
    var n = h3.nextSibling;
    while (n) {
      var next = n.nextSibling;
      if (n.nodeType === 1 && (/^H[123]$/.test(n.tagName) || n.classList.contains("pager"))) break;
      body.appendChild(n);
      n = next;
    }
    h3.parentNode.insertBefore(body, h3.nextSibling);
    h3.classList.add("fold-h");
    h3.setAttribute("role", "button");
    h3.setAttribute("tabindex", "0");
    h3.setAttribute("aria-expanded", "true");
    function toggle() {
      var open = h3.getAttribute("aria-expanded") === "true";
      h3.setAttribute("aria-expanded", open ? "false" : "true");
    }
    h3.addEventListener("click", function (e) {
      if (e.target.tagName === "A") return;
      toggle();
    });
    h3.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    folds.push(h3);
  });

  var foldBtn = document.getElementById("foldAll");
  if (foldBtn) {
    foldBtn.addEventListener("click", function () {
      var collapse = foldBtn.getAttribute("aria-pressed") !== "true";
      folds.forEach(function (h) { h.setAttribute("aria-expanded", collapse ? "false" : "true"); });
      foldBtn.setAttribute("aria-pressed", collapse ? "true" : "false");
      foldBtn.textContent = collapse ? "กางทั้งหมด" : "ยุบหัวข้อย่อย";
    });
  }

  /* ---------------------------------------------------------
     6. search — กรอง TOC ของหน้าปัจจุบัน
     --------------------------------------------------------- */
  var search = document.getElementById("search");
  if (search && tocEl) {
    var items = Array.prototype.slice.call(tocEl.querySelectorAll("li"));
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      tocEl.classList.toggle("filtered", !!q);
      var hits = 0;
      items.forEach(function (li) {
        var a = li.querySelector("a");
        var hit = !q || a.textContent.toLowerCase().indexOf(q) > -1;
        li.classList.toggle("hide", !hit);
        if (hit) hits++;
      });
      var e = tocEl.querySelector(".toc-empty");
      if (e) e.style.display = q && hits === 0 ? "block" : "none";
    });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var first = tocEl.querySelector("li:not(.hide) a");
        if (first) { first.click(); search.blur(); }
      }
      if (e.key === "Escape") { search.value = ""; search.dispatchEvent(new Event("input")); search.blur(); }
    });
  }

  /* ---------------------------------------------------------
     7. rail drawer (mobile)
     --------------------------------------------------------- */
  var railBtn = document.getElementById("railToggle");
  if (railBtn && railCol) {
    railBtn.addEventListener("click", function () {
      railCol.classList.toggle("open");
      railBtn.setAttribute("aria-expanded", railCol.classList.contains("open") ? "true" : "false");
    });
    railCol.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && window.innerWidth <= 860) railCol.classList.remove("open");
    });
  }

  /* ---------------------------------------------------------
     8. keyboard
     --------------------------------------------------------- */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "/") { e.preventDefault(); if (search) search.focus(); }
    if (e.key === "t" && railCol) railCol.classList.toggle("open");

    var prev = document.querySelector('link[rel="prev"]');
    var next = document.querySelector('link[rel="next"]');
    if (e.key === "[" && prev) location.href = prev.href;
    if (e.key === "]" && next) location.href = next.href;
  });

  /* ---------------------------------------------------------
     9. back to top
     --------------------------------------------------------- */
  var top = document.querySelector(".top");
  if (top) {
    top.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("scroll", function () {
      top.classList.toggle("on", window.scrollY > 700);
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     10. deep-link highlight
     --------------------------------------------------------- */
  function flash() {
    if (!location.hash) return;
    var el = document.getElementById(location.hash.slice(1));
    if (!el) return;
    el.classList.add("mark");
    setTimeout(function () { el.classList.remove("mark"); }, 1900);
  }
  window.addEventListener("hashchange", flash);
  flash();
})();
