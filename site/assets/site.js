/* Static content first; enhancement never fetches data or depends on a module loader. */
(function () {
  "use strict";
  var config = window.SITE || { demo: false, assumption: false };
  var all = function (selector, parent) {
    return Array.from((parent || document).querySelectorAll(selector));
  };
  var tabs = new Map();
  all("[data-tabs]").forEach(function (root) {
    var list = root.firstElementChild;
    var buttons = Array.from(list.children);
    var panels = buttons.map(function (button) {
      return document.getElementById(button.getAttribute("aria-controls"));
    });
    var active = Number(root.dataset.default || 0);
    function select(index, focus) {
      active = (index + buttons.length) % buttons.length;
      buttons.forEach(function (button, i) {
        button.setAttribute("aria-selected", String(i === active));
        button.tabIndex = i === active ? 0 : -1;
        panels[i].hidden = i !== active;
      });
      if (focus) buttons[active].focus();
      if (root.dataset.tabs === "branches") highlightBranch(active + 1);
      if (root.dataset.tabs === "layers" && focus) openCard(["C1", "U1", "K1"][active], false);
      if (root.dataset.tabs === "steps") {
        all("[data-step]").forEach(function (button) {
          button.disabled = Number(button.dataset.step) < 0 ? active === 0 : active === buttons.length - 1;
        });
      }
    }
    buttons.forEach(function (button, i) {
      button.addEventListener("click", function () {
        select(i, true);
      });
      button.addEventListener("keydown", function (event) {
        var next;
        if (event.key === "ArrowRight") next = active + 1;
        if (event.key === "ArrowLeft") next = active - 1;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = buttons.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          select(next, true);
        }
      });
    });
    tabs.set(root.dataset.tabs, {
      select: select,
      current: function () {
        return active;
      },
    });
    select(active, false);
  });
  function highlightBranch(index) {
    all("#structure [data-branch]").forEach(function (element) {
      var highlighted = element.dataset.branch.split(" ").includes(String(index));
      element.classList.toggle("branch-highlight", highlighted);
      element.dataset.activeBranch = highlighted ? String(index) : "";
    });
  }
  function radioStyle(name) {
    all('input[name="' + name + '"]').forEach(function (input) {
      input.parentElement.classList.toggle("is-selected", input.checked);
    });
  }
  function audience(value, updateUrl) {
    value = value === "dev" ? "dev" : "lead";
    all("[data-audience]").forEach(function (element) {
      element.hidden = element.dataset.audience !== value;
    });
    all('input[name="audience"]').forEach(function (input) {
      input.checked = input.value === value;
    });
    document.querySelector(".requests").classList.toggle("dev-first", value === "dev");
    radioStyle("audience");
    if (updateUrl) {
      var url = new URL(location.href);
      url.searchParams.set("for", value);
      try {
        history.replaceState(null, "", url.href);
      } catch (_) {
        /* file:// may forbid history changes; content still switches. */
      }
    }
  }
  audience(new URL(location.href).searchParams.get("for"), false);
  all('input[name="audience"]').forEach(function (input) {
    input.addEventListener("change", function () {
      audience(input.value, true);
    });
  });
  window.addEventListener("popstate", function () {
    audience(new URL(location.href).searchParams.get("for"), false);
  });
  function caseSelect(value) {
    all("[data-case]").forEach(function (element) {
      element.hidden = element.dataset.case !== value;
    });
    radioStyle("before-after");
  }
  all('input[name="before-after"]').forEach(function (input) {
    input.addEventListener("change", function () {
      caseSelect(input.value);
    });
  });
  caseSelect("0");
  all("[data-step]").forEach(function (button) {
    button.addEventListener("click", function () {
      var step = tabs.get("steps");
      step.select(step.current() + Number(button.dataset.step), false);
    });
  });
  all("[data-demo]").forEach(function (element) {
    element.hidden = config.demo !== true;
  });
  all("[data-demo-fallback]").forEach(function (element) {
    element.hidden = config.demo === true;
  });
  all("[data-assumption]").forEach(function (element) {
    element.hidden = config.assumption !== true;
  });
  all("[data-maintenance-status]").forEach(function (element) {
    element.textContent = config.assumption ? "완료(가정)" : "완료";
  });
  var basis = document.querySelector(".basis");
  document.getElementById("basis-label").textContent = config.assumption
    ? "기준 2026-10-13 · 정비 이슈 해결 가정"
    : "기준 " + (config.ref || "2026-10-13") + " · " + (config.builtAt || "2026-10-13");
  if (!config.assumption) {
    basis.querySelector(".basis-popover").hidden = true;
    basis.querySelector("summary").addEventListener("click", function (event) {
      event.preventDefault();
    });
  } else {
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && basis.open) basis.open = false;
    });
    document.addEventListener("click", function (event) {
      if (basis.open && !basis.contains(event.target)) basis.open = false;
    });
  }
  document.getElementById("build-info").textContent =
    "배포 ref " +
    (config.ref || "로컬") +
    " · 커밋 " +
    (config.commit || "미지정") +
    " · 조립일 " +
    (config.builtAt || "미지정");
  var shotDialog = document.getElementById("shot-dialog");
  if (shotDialog) {
    var shotButtons = all("[data-shot-open]");
    var shownShots = shotButtons.slice();
    var shotIndex = 0;
    var shotReturn = null;
    function showShot(index) {
      shotIndex = (index + shownShots.length) % shownShots.length;
      var trigger = shownShots[shotIndex];
      var tile = trigger.closest(".shot-tile");
      var source = trigger.querySelector("img");
      var target = document.getElementById("shot-dialog-image");
      target.src = source.src;
      target.alt = source.alt;
      // 타일의 렌더 크기가 아니라 shots.json의 원본 크기(width/height 속성)를 쓴다.
      target.width = Number(source.getAttribute("width"));
      target.height = Number(source.getAttribute("height"));
      document.getElementById("shot-dialog-title").textContent = tile.querySelector("h4").textContent;
      document.getElementById("shot-dialog-description").textContent = tile.querySelector(".shot-copy p").textContent;
      document.getElementById("shot-dialog-position").textContent = shotIndex + 1 + " / " + shownShots.length;
      var demoLink = document.getElementById("shot-dialog-demo");
      var tileDemo = tile.querySelector("a[data-demo]");
      if (config.demo === true && tileDemo && !tileDemo.hidden) {
        demoLink.href = tileDemo.href;
        demoLink.hidden = false;
      } else {
        demoLink.hidden = true;
      }
    }
    function filterShots(group) {
      all("[data-shot-filter]").forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.shotFilter === group));
      });
      all("[data-shot-group]").forEach(function (tile) {
        tile.hidden = group !== "all" && tile.dataset.shotGroup !== group;
      });
      shownShots = shotButtons.filter(function (button) {
        return !button.closest(".shot-tile").hidden;
      });
      document.getElementById("shot-count").textContent = shownShots.length + "개 화면";
    }
    all("[data-shot-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        filterShots(button.dataset.shotFilter);
      });
    });
    all("[data-chart-shots-link]").forEach(function (link) {
      link.addEventListener("click", function () {
        filterShots("charts");
      });
    });
    shotButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        shotReturn = button;
        showShot(shownShots.indexOf(button));
        shotDialog.showModal();
        shotDialog.querySelector("[data-shot-close]").focus();
      });
    });
    shotDialog.querySelector("[data-shot-close]").addEventListener("click", function () {
      shotDialog.close();
    });
    shotDialog.querySelector("[data-shot-prev]").addEventListener("click", function () {
      showShot(shotIndex - 1);
    });
    shotDialog.querySelector("[data-shot-next]").addEventListener("click", function () {
      showShot(shotIndex + 1);
    });
    shotDialog.addEventListener("keydown", function (event) {
      if (event.key === "Tab") {
        // 상태 화면에서는 데모 링크가 hidden이 되므로 보이는 컨트롤만 순환한다.
        var controls = all("button, a[href]", shotDialog).filter(function (el) {
          return !el.hidden;
        });
        var first = controls[0];
        var last = controls[controls.length - 1];
        var active = document.activeElement;
        if (event.shiftKey && (active === first || !shotDialog.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !shotDialog.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        showShot(shotIndex + (event.key === "ArrowLeft" ? -1 : 1));
      }
    });
    shotDialog.addEventListener("close", function () {
      if (shotReturn) shotReturn.focus();
    });
  }
  var lastCard = null;
  var gallery = document.querySelector(".gallery");
  var detailSlot = document.querySelector(".detail-slot");
  function openCard(id, focus) {
    var card = document.querySelector('[data-card="' + id + '"]');
    if (!card) return;
    lastCard = card;
    all("[data-card]").forEach(function (element) {
      element.setAttribute("aria-expanded", String(element === card));
    });
    all("[data-detail]").forEach(function (element) {
      element.hidden = element.dataset.detail !== id;
    });
    detailSlot.hidden = false;
    gallery.classList.add("has-detail");
    detailSlot.scrollTop = 0;
    if (focus)
      document
        .getElementById("detail-" + id)
        .querySelector("h3")
        .focus();
  }
  function closeCard() {
    detailSlot.hidden = true;
    gallery.classList.remove("has-detail");
    all("[data-card]").forEach(function (element) {
      element.setAttribute("aria-expanded", "false");
    });
    if (lastCard) lastCard.focus();
  }
  all("[data-card]").forEach(function (card) {
    card.addEventListener("click", function () {
      openCard(card.dataset.card, true);
    });
  });
  document.getElementById("close-detail").addEventListener("click", closeCard);
  detailSlot.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCard();
    }
  });
  openCard("C1", false);
  var expand = document.getElementById("expand-all");
  expand.addEventListener("click", function () {
    var next = all(".claim").some(function (detail) {
      return !detail.open;
    });
    all(".claim").forEach(function (detail) {
      detail.open = next;
    });
    expand.textContent = next ? "모두 접기" : "모두 펼치기";
  });
  function filter() {
    var statusInput = document.querySelector('input[name="tech-filter"]:checked');
    var stageInput = document.querySelector('input[name="stage-filter"]:checked');
    var status = statusInput.value;
    var stage = stageInput.value;
    var count = 0;
    all("[data-tech]").forEach(function (row) {
      var matchesStatus =
        status === "all" ||
        status === row.dataset.tech ||
        (status === "commercial" && row.dataset.commercial === "true");
      var matchesStage = stage === "all" || row.dataset.stage.split(" ").includes(stage);
      row.hidden = !(matchesStatus && matchesStage);
      if (!row.hidden) count++;
    });
    var statusLabel = status === "all" ? "전체 상태" : statusInput.nextElementSibling.textContent;
    // Same guidance as #tech-empty-row, so the status line alone explains a 0-result combination.
    var emptyGuide = " 이 조합에 맞는 기술이 없습니다. 상태나 단계를 ‘전체’로 바꾸세요.";
    document.getElementById("tech-empty-row").hidden = count > 0;
    document.getElementById("filter-count").textContent =
      statusLabel +
      " · " +
      stageInput.nextElementSibling.textContent +
      " · " +
      count +
      "개 표시" +
      (count === 0 ? " —" + emptyGuide : "");
    radioStyle("tech-filter");
    radioStyle("stage-filter");
  }
  all('input[name="tech-filter"], input[name="stage-filter"]').forEach(function (input) {
    input.addEventListener("change", filter);
  });
  filter();
  all("[data-vision-step]").forEach(function (link) {
    link.addEventListener("click", function () {
      tabs.get("vision").select(Number(link.dataset.visionStep), false);
    });
  });
  // A linked candidate must remain visible even after filtering the table.
  all("[data-tech-link]").forEach(function (link) {
    link.addEventListener("click", function () {
      document.querySelector('input[name="tech-filter"][value="all"]').checked = true;
      document.querySelector('input[name="stage-filter"][value="all"]').checked = true;
      filter();
    });
  });
  // Explicit links between explanatory notes, key tokens, and comparison rows.
  var comparisonRows = [[[0, 2], [9], [1], [6], [0]], [[2, 5], [9], [9], [6]], [[8]], [[11], [11], [11], [11]]];
  function annotation(value, on) {
    var pair = value.split(":").map(Number);
    all('[data-code="' + pair[0] + '"] mark[data-k]').forEach(function (mark) {
      mark.classList.toggle("on", on && mark.dataset.k.split(" ").indexOf(value) !== -1);
    });
    all("#compare table tbody tr").forEach(function (row, i) {
      row.classList.toggle("highlight", on && comparisonRows[pair[0]][pair[1]].includes(i));
    });
  }
  all("[data-annotation]").forEach(function (button) {
    ["mouseenter", "focus"].forEach(function (event) {
      button.addEventListener(event, function () {
        annotation(button.dataset.annotation, true);
      });
    });
    ["mouseleave", "blur"].forEach(function (event) {
      button.addEventListener(event, function () {
        annotation(button.dataset.annotation, false);
      });
    });
  });
  function resizeMini(element) {
    var shell = element.querySelector(".mini-shell");
    var scale = element.clientWidth / 960;
    shell.style.transform = "scale(" + scale + ")";
    element.style.height = 600 * scale + 2 + "px";
    element.style.overflow = "hidden";
  }
  all(".mini-viewport").forEach(function (element) {
    resizeMini(element);
    if (window.ResizeObserver)
      new ResizeObserver(function () {
        resizeMini(element);
      }).observe(element);
    else
      window.addEventListener("resize", function () {
        resizeMini(element);
      });
  });
  var navLinks = all('nav a[href^="#"]');
  function current(id) {
    navLinks.forEach(function (a) {
      if (a.hash === "#" + id) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }
  current(location.hash.slice(1) || "intro");
  if (window.IntersectionObserver) {
    var sections = all("main>section");
    // Anchor jumps land a section at scroll-padding-top + scroll-margin-top;
    // comparing with the same offset (+1px for sub-pixel rounding) keeps the
    // jumped-to section ahead of the one whose top is still above it.
    var rootPad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    var landing = sections.map(function (section) {
      return rootPad + (parseFloat(getComputedStyle(section).scrollMarginTop) || 0);
    });
    var updateCurrent = function () {
      // Recompute from live geometry so in-page links and deep links land on
      // the right entry; stale entry/exit rects must not decide the current one.
      var best = sections[0].id;
      sections.forEach(function (section, i) {
        if (section.getBoundingClientRect().top <= landing[i] + 1) best = section.id;
      });
      current(best);
    };
    var observer = new IntersectionObserver(updateCurrent, {
      rootMargin: "-50px 0px -60% 0px",
      threshold: 0,
    });
    sections.forEach(function (section) {
      observer.observe(section);
    });
    // The observer only fires when an intersection changes, so the final
    // callback can predate the last sub-pixel of a smooth or instant scroll.
    // Recompute once the scroll settles.
    var scrollSettle = 0;
    window.addEventListener(
      "scroll",
      function () {
        clearTimeout(scrollSettle);
        scrollSettle = setTimeout(updateCurrent, 120);
      },
      { passive: true },
    );
  }
  navLinks.forEach(function (a) {
    a.addEventListener("click", function () {
      document.querySelector(".mobile-toc").open = false;
      current(a.hash.slice(1));
    });
  });
  function revealSource() {
    if (location.hash.startsWith("#source-")) document.querySelector(".source-ledger").open = true;
  }
  all('a[href^="#source-"]').forEach(function (a) {
    a.addEventListener("click", function () {
      document.querySelector(".source-ledger").open = true;
    });
  });
  window.addEventListener("hashchange", revealSource);
  revealSource();
  // 초기 JS(읽는 사람 전환, 원장 열기)가 앞부분 높이를 바꾸면, 브라우저가 JS보다
  // 먼저 한 앵커 점프의 착지가 어긋난다. 절의 scroll-margin-top이 반영된 위치로
  // 한 번 더 맞춰 점프 결과와 사이드바 표시를 일치시킨다.
  var reanchor = document.querySelector('main>section[id="' + CSS.escape(location.hash.slice(1)) + '"]');
  if (reanchor) reanchor.scrollIntoView({ block: "start", behavior: "instant" });
  var printDetails = [];
  window.addEventListener("beforeprint", function () {
    printDetails = all("details").map(function (detail) {
      return { detail: detail, open: detail.open };
    });
    printDetails.forEach(function (item) {
      item.detail.open = true;
    });
  });
  window.addEventListener("afterprint", function () {
    printDetails.forEach(function (item) {
      item.detail.open = item.open;
    });
  });
  document.documentElement.classList.add("js");
})();
