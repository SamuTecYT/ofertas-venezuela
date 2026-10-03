/* Lógica del cliente: país, filtros, orden y búsqueda. Sin dependencias ni terceros. */
(function () {
  "use strict";
  var KEY = "ds_market";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  };
  var body = document.body;

  // Página raíz: elegir idioma del navegador
  if (body.dataset.redirect) {
    var langs = Array.prototype.map.call(document.querySelectorAll("a[hreflang]"), function (a) { return a.getAttribute("hreflang"); });
    var pref = (navigator.language || "").slice(0, 2).toLowerCase();
    if (langs.indexOf(pref) > -1) { location.replace(pref + "/"); }
    return;
  }

  // Imagen rota en origen -> marcador visual (el evento error no burbujea: captura)
  document.addEventListener("error", function (ev) {
    var im = ev.target;
    if (!im || im.tagName !== "IMG" || !im.closest(".media, .dimg")) return;
    var ph = document.createElement("div");
    ph.className = "ph" + (im.closest(".dimg") ? " big" : "");
    ph.textContent = "🛍️";
    im.replaceWith(ph);
  }, true);

  // Nombres de país en el idioma del visitante (API del navegador; si no existe, queda el texto del servidor)
  try {
    var dn = new Intl.DisplayNames([body.dataset.lang], { type: "region" });
    document.querySelectorAll("option[data-flag]").forEach(function (o) {
      if (o.value === "global") return;
      var code = o.value === "uk" ? "GB" : o.value.toUpperCase();
      var n = dn.of(code);
      if (n && n !== code) o.textContent = o.dataset.flag + " " + n;
    });
  } catch (err) { /* navegador antiguo */ }

  var marketSel = $("#market");
  var fMarket = $("#f-market");
  var fSort = $("#f-sort");
  var fNiche = $("#f-niche");
  var q = $("#q");
  var grid = $("#grid");
  var none = $(".none");
  var count = $("#count");
  var cards = grid ? Array.prototype.slice.call(grid.querySelectorAll(".card")) : [];

  function guessMarket() {
    var saved = store.get(KEY);
    if (saved) return saved;
    var m = ((navigator.language || "").split("-")[1] || "").toLowerCase();
    return marketSel && marketSel.querySelector('option[value="' + m + '"]') ? m : "global";
  }
  var market = guessMarket();
  [marketSel, fMarket].forEach(function (s) {
    if (s && s.querySelector('option[value="' + market + '"]')) s.value = market === "global" && s === fMarket ? "" : market;
  });

  function setMarket(v) {
    market = v || "global";
    store.set(KEY, market);
    if (marketSel) marketSel.value = market;
    if (fMarket) fMarket.value = market === "global" ? "" : market;
    apply();
  }
  if (marketSel) marketSel.addEventListener("change", function () { setMarket(marketSel.value); });
  if (fMarket) fMarket.addEventListener("change", function () { setMarket(fMarket.value); });

  function apply() {
    if (!grid) return;
    var term = (q && q.value || "").trim().toLowerCase();
    var niche = fNiche ? fNiche.value : "";
    var sort = fSort ? fSort.value : "new";
    var visible = cards.filter(function (c) {
      var okM = market === "global" || c.dataset.market === market || c.dataset.market === "global";
      var okN = !niche || c.dataset.niche === niche;
      var okQ = !term || term.split(/\s+/).every(function (w) { return c.dataset.q.indexOf(w) > -1; });
      var show = okM && okN && okQ;
      c.hidden = !show;
      return show;
    });
    visible.sort(function (a, b) {
      if (sort === "disc") return b.dataset.disc - a.dataset.disc;
      if (sort === "price") return a.dataset.price - b.dataset.price;
      return a.dataset.ts < b.dataset.ts ? 1 : -1;
    }).forEach(function (c) { grid.appendChild(c); });
    if (count) count.textContent = visible.length + " " + (body.dataset.results || "");
    if (none) none.hidden = visible.length > 0 || !cards.length;
  }


  // Mini-bot de búsqueda con IA (API en Cloudflare Workers). Todo se pinta con textContent: sin HTML inyectado.
  var askForm = $("#ask-form"), out = $("#ask-out");
  if (askForm && out && out.dataset.api) {
    var D = out.dataset;
    var okUrl = function (u) { try { return new URL(u).protocol === "https:"; } catch (e) { return false; } };
    var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
    var show = function (nodes) { out.textContent = ""; nodes.forEach(function (n) { out.appendChild(n); }); };
    askForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var qv = $("#ask-q").value.trim();
      if (qv.length < 2) return;
      var btn = askForm.querySelector("button");
      btn.disabled = true;
      show([el("p", "meta", D.wait)]);
      fetch(D.api + "/ask", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: qv, lang: body.dataset.lang }), credentials: "omit", referrerPolicy: "no-referrer"
      }).then(function (r) {
        if (r.status === 429) throw new Error("limit");
        if (!r.ok) throw new Error("err");
        return r.json();
      }).then(function (d) {
        var nodes = [];
        if (d.kind === "travel" || d.kind === "unclear") {
          var a = el("a", "btn", "✈️ Telegram"); a.href = D.bot; a.target = "_blank"; a.rel = "noopener noreferrer";
          nodes.push(el("p", "", D.travel), a);
          return show(nodes);
        }
        if (d.name) nodes.push(el("h3", "", d.name));
        nodes.push(el("h4", "", D.links));
        var ul = el("div", "asklinks");
        (d.links || []).forEach(function (l) {
          if (!okUrl(l.url)) return;
          var a = el("a", "btn ghost", "🔎 " + l.store); a.href = l.url; a.target = "_blank"; a.rel = "sponsored nofollow noopener noreferrer"; ul.appendChild(a);
        });
        nodes.push(ul, el("p", "meta", D.note));
        nodes.push(el("h4", "", D.offers));
        if (d.offers && d.offers.length) {
          var g = el("div", "asklist");
          d.offers.forEach(function (o) {
            if (!okUrl(o.url)) return;
            var row = el("a", "askrow"); row.href = o.url; row.target = "_blank"; row.rel = "sponsored nofollow noopener noreferrer";
            row.appendChild(el("b", "", o.title));
            row.appendChild(el("span", "", o.store + " · " + o.price + " " + o.currency + (o.discount ? " · -" + o.discount + "%" : "")));
            g.appendChild(row);
          });
          nodes.push(g);
        } else { nodes.push(el("p", "meta", D.empty)); }
        show(nodes);
      }).catch(function (e) {
        show([el("p", "meta", e && e.message === "limit" ? D.limit : D.err)]);
      }).then(function () { btn.disabled = false; });
    });
  }

  // Buscadores de cabecera/portada -> página de búsqueda
  var root = body.dataset.root, lang = body.dataset.lang;
  ["#q-top", "#q-hero"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      if (q) { q.value = el.value; apply(); return; }
      location.href = root + lang + "/search/?q=" + encodeURIComponent(el.value);
    });
  });
  document.querySelectorAll("form[role=search]").forEach(function (f) {
    f.addEventListener("submit", function (ev) { ev.preventDefault(); });
  });

  if (q) {
    var p = new URLSearchParams(location.search).get("q");
    if (p) q.value = p.slice(0, 100);
    q.addEventListener("input", apply);
  }
  [fSort, fNiche].forEach(function (s) { if (s) s.addEventListener("change", apply); });
  apply();
})();
