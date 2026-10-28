/* Static content first; enhancement never fetches data or depends on a module loader. */
(function () {
  "use strict";
  var config = window.SITE || { demo: false, assumption: false };
  var all = function (selector, parent) {
    return Array.from((parent || document).querySelectorAll(selector));
  };
  // PROTOTYPE #1053 — throwaway
  var prototypeVariants = ["A", "B", "C"];
  var prototypeQuery = new URLSearchParams(window.location.search);
  var prototypeParamPresent = prototypeQuery.has("variant");
  var prototypeSwitcher = document.querySelector("[data-prototype-switcher]");
  var prototypeLabel = prototypeSwitcher && prototypeSwitcher.querySelector("[data-prototype-label]");
  var selectedPrototype = null;
  function applyPrototypeVariant(variant) {
    selectedPrototype = variant;
    all("[data-prototype-variant]").forEach(function (block) {
      block.hidden = block.dataset.prototypeVariant !== variant;
    });
    var baseline = document.getElementById("intro");
    if (baseline) baseline.hidden = Boolean(variant);
    if (prototypeSwitcher) prototypeSwitcher.hidden = !variant;
    if (prototypeLabel && variant) prototypeLabel.textContent = "안 " + variant + " · 첫 장점 비교";
  }
  function setPrototypeVariant(variant) {
    if (prototypeVariants.indexOf(variant) === -1) return;
    var url = new URL(window.location.href);
    url.searchParams.set("variant", variant);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    applyPrototypeVariant(variant);
  }
  function stepPrototypeVariant(amount) {
    if (!selectedPrototype) return;
    var index = prototypeVariants.indexOf(selectedPrototype);
    setPrototypeVariant(prototypeVariants[(index + amount + prototypeVariants.length) % prototypeVariants.length]);
  }
  if (prototypeParamPresent) {
    var initialPrototype = prototypeVariants.indexOf(prototypeQuery.get("variant")) === -1 ? "A" : prototypeQuery.get("variant");
    applyPrototypeVariant(initialPrototype);
    if (prototypeQuery.get("variant") !== initialPrototype) setPrototypeVariant(initialPrototype);
    all("[data-prototype-step]", prototypeSwitcher).forEach(function (button) {
      button.addEventListener("click", function () {
        stepPrototypeVariant(Number(button.dataset.prototypeStep));
      });
    });
    document.addEventListener("keydown", function (event) {
      var targetName = event.target && event.target.tagName;
      if (!selectedPrototype || targetName === "INPUT" || targetName === "TEXTAREA" || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopImmediatePropagation();
        stepPrototypeVariant(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopImmediatePropagation();
        stepPrototypeVariant(1);
      }
    });
  }
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

  var board = document.getElementById("analysis-board");
  if (board) {
    var boardGrid = document.getElementById("board-grid");
    var selectedContext = document.getElementById("selected-context");
    var boardTabs = all(".board-sheets [role=tab]", board);
    // Narrow screens start with two cells; the four-cell layout is one tap away.
    var boardLayout = window.matchMedia && window.matchMedia("(max-width: 700px)").matches ? "1x2" : "2x2";
    var selectedSheet = 0;
    var selectedPane = 0;
    var sheets = [
      {
        name: "견본 비교",
        panes: [
          { system: "MARS", screen: "견본 화면 A", context: { 기간: "9월", 사이트: "MEM", 공정: "A", 설비: "전체" }, kind: "line", values: [34, 46, 39, 55, 43, 64] },
          { system: "BRAVO", screen: "견본 화면 B", context: { 기간: "9월", 사이트: "MEM", 공정: "A", 설비: "전체", 버전: "v2" }, kind: "bar", values: [28, 42, 36, 59, 48, 67] },
          { system: "MARS", screen: "견본 화면 C", context: { 기간: "10월", 사이트: "MEM", 공정: "A", 설비: "1", 집계: "일" }, kind: "dist", values: [12, 26, 52, 70, 44, 18] },
          { system: "MARS", screen: "견본 화면 D", context: { 기간: "10월", 사이트: "FDRY", 공정: "A", 설비: "2", 집계: "시간" }, kind: "table", values: [38, 48, 43, 62, 51, 70] },
        ],
      },
      {
        name: "견본 전·후",
        panes: [
          { system: "MARS", screen: "견본 화면 C · 전", context: { 기간: "9월", 사이트: "MEM", 공정: "A", 설비: "1", 구간: "개선 전" }, kind: "line", values: [36, 54, 48, 68, 58, 76] },
          { system: "MARS", screen: "견본 화면 C · 후", context: { 기간: "10월", 사이트: "MEM", 공정: "A", 설비: "1", 구간: "개선 후" }, kind: "bar", values: [32, 43, 39, 51, 44, 57] },
        ],
      },
    ];
    boardTabs.forEach(function (tab, index) {
      tab.dataset.boardSheet = String(index);
      tab.addEventListener("click", function () {
        selectSheet(index, true);
      });
      tab.addEventListener("keydown", function (event) {
        var next;
        if (event.key === "ArrowRight") next = (selectedSheet + 1) % boardTabs.length;
        if (event.key === "ArrowLeft") next = (selectedSheet + boardTabs.length - 1) % boardTabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = boardTabs.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          selectSheet(next, true);
        }
      });
    });
    function currentSheet() {
      return sheets[selectedSheet];
    }
    function paneCount() {
      return boardLayout === "1x1" ? 1 : boardLayout === "2x2" ? 4 : 2;
    }
    function addText(parent, tag, value, className) {
      var element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = value;
      parent.appendChild(element);
      return element;
    }
    function contextString(context) {
      return Object.keys(context).map(function (key) {
        return key + " " + context[key];
      }).join(" · ");
    }
    // board-diff:start
    // Keys the selected cell has and this cell lacks show as "—", never "undefined".
    function contextDiff(activeContext, paneContext) {
      var differences = [];
      var same = 0;
      Object.keys(activeContext).forEach(function (key) {
        if (key in paneContext && paneContext[key] === activeContext[key]) same += 1;
        else differences.push({ key: key, value: key in paneContext ? paneContext[key] : "—" });
      });
      Object.keys(paneContext).forEach(function (key) {
        if (!(key in activeContext)) differences.push({ key: key, value: paneContext[key] });
      });
      return { differences: differences, same: same };
    }
    // board-diff:end
    // At most two differing conditions show as chips; the rest fold into "+N" so a cell header keeps one line.
    function showDifferences(container, diff) {
      container.replaceChildren();
      diff.differences.slice(0, 2).forEach(function (item) {
        addText(container, "span", item.key + " " + item.value, "difference-chip");
      });
      if (diff.differences.length > 2) {
        var rest = diff.differences.slice(2);
        var more = addText(container, "span", "+" + rest.length, "difference-chip difference-more");
        more.title = rest.map(function (item) {
          return item.key + " " + item.value;
        }).join(" · ");
      }
    }
    function sameNoteText(same) {
      return "이 칸의 조건 전체 · 선택한 칸과 같은 것 " + same + "개";
    }
    function updatePaneSelection() {
      var sheet = currentSheet();
      var activeContext = sheet.panes[selectedPane].context;
      selectedContext.textContent = "선택한 칸 " + (selectedPane + 1) + " · " + contextString(activeContext);
      all(".board-pane", boardGrid).forEach(function (article) {
        var index = Number(article.dataset.boardPane);
        var pane = sheet.panes[index];
        article.classList.toggle("is-selected", index === selectedPane);
        var diff = contextDiff(activeContext, pane.context);
        showDifferences(article.querySelector(".pane-differences"), diff);
        var sameSummary = article.querySelector(".board-context summary");
        sameSummary.textContent = "같음 " + diff.same;
        sameSummary.title = "다른 칸과 같은 조건 " + diff.same + "개";
        sameSummary.setAttribute("aria-label", "칸 " + (index + 1) + "의 같은 조건 전체 보기");
        var sameNote = article.querySelector(".board-popover-note");
        if (sameNote) sameNote.textContent = sameNoteText(diff.same);
      });
    }
    function svgNode(name, attributes, className) {
      var node = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.keys(attributes).forEach(function (key) {
        node.setAttribute(key, attributes[key]);
      });
      if (className) node.classList.add(className);
      return node;
    }
    // Each cell sketches a different chart shape so the board reads as different analyses: trend, bars, distribution, table.
    function buildMiniChart(kind, values) {
      var chart = svgNode("svg", { viewBox: "0 0 360 112", preserveAspectRatio: "none" }, "board-chart");
      chart.setAttribute("aria-hidden", "true");
      if (kind === "table") {
        [0, 1, 2, 3].forEach(function (row) {
          chart.appendChild(svgNode("rect", { x: 0, y: 4 + row * 27, width: 360, height: 22, rx: 3 }, row === 0 ? "board-chart-head" : "board-chart-row"));
          [0, 1, 2].forEach(function (column) {
            chart.appendChild(svgNode("rect", { x: 10 + column * 120, y: 11 + row * 27, width: row === 0 ? 56 : 34 + ((values[row + column] * 3) % 40), height: 8, rx: 2 }, "board-chart-cell"));
          });
        });
        return chart;
      }
      [28, 56, 84].forEach(function (y) {
        chart.appendChild(svgNode("path", { d: "M0 " + y + "H360" }, "board-chart-grid"));
      });
      if (kind === "bar" || kind === "dist") {
        var width = kind === "bar" ? 36 : 52;
        values.forEach(function (value, index) {
          chart.appendChild(svgNode("rect", { x: index * 58 + 8, y: 98 - value, width: width, height: value, rx: 3 }, kind === "bar" ? "board-chart-bar" : "board-chart-dist"));
        });
        return chart;
      }
      var points = values.map(function (value, index) {
        return (index * 70 + 8) + " " + (98 - value);
      }).join("L");
      chart.appendChild(svgNode("path", { d: "M" + points }, "board-chart-line"));
      return chart;
    }
    function selectPane(index, restoreFocus) {
      if (selectedPane === index) return;
      selectedPane = index;
      renderBoard();
      if (restoreFocus) {
        var focusedPane = boardGrid.querySelector('[data-board-pane="' + index + '"]');
        if (focusedPane) focusedPane.focus({ preventScroll: true });
      }
    }
    function renderBoard() {
      var sheet = currentSheet();
      if (selectedPane >= Math.min(paneCount(), sheet.panes.length)) selectedPane = 0;
      boardGrid.dataset.layout = boardLayout;
      boardGrid.replaceChildren();
      all("[data-board-layout]", board).forEach(function (button) {
        var selected = button.dataset.boardLayout === boardLayout;
        button.setAttribute("aria-pressed", String(selected));
      });
      boardTabs.forEach(function (tab, index) {
        var selected = index === selectedSheet;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      document.getElementById("board-title").textContent = sheet.name === "견본 비교" ? "견본 분석 보드" : "견본 전·후 보드";
      var activeContext = sheet.panes[selectedPane].context;
      selectedContext.textContent = "선택한 칸 " + (selectedPane + 1) + " · " + contextString(activeContext);
      sheet.panes.slice(0, paneCount()).forEach(function (pane, index) {
        var article = document.createElement("article");
        article.className = "board-pane" + (index === selectedPane ? " is-selected" : "");
        article.tabIndex = 0;
        article.dataset.boardPane = String(index);
        article.setAttribute("aria-label", "칸 " + (index + 1) + " · " + pane.system + " · " + pane.screen);
        article.addEventListener("click", function (event) {
          if (event.target.closest(".board-popover")) {
            if (selectedPane !== index) {
              selectedPane = index;
              updatePaneSelection();
            }
            return;
          }
          selectPane(index, false);
        });
        // Focus entering the pane or any control inside it selects the pane in place, so the focused control keeps focus.
        article.addEventListener("focusin", function () {
          if (selectedPane === index) return;
          selectedPane = index;
          updatePaneSelection();
        });
        var header = document.createElement("div");
        header.className = "board-pane-head";
        var identity = document.createElement("div");
        identity.className = "board-pane-identity";
        addText(identity, "span", "칸 " + (index + 1), "pane-number");
        addText(identity, "span", pane.system, "system-chip");
        addText(identity, "b", pane.screen, "pane-screen");
        header.appendChild(identity);
        var differences = document.createElement("div");
        differences.className = "pane-differences";
        differences.setAttribute("aria-label", "선택한 칸과 다른 조건");
        var diff = contextDiff(activeContext, pane.context);
        showDifferences(differences, diff);
        var sameDetails = document.createElement("details");
        sameDetails.className = "board-popover board-context";
        var sameSummary = addText(sameDetails, "summary", "같음 " + diff.same);
        sameSummary.title = "다른 칸과 같은 조건 " + diff.same + "개";
        sameSummary.setAttribute("aria-label", "칸 " + (index + 1) + "의 같은 조건 전체 보기");
        var allConditions = document.createElement("ul");
        addText(allConditions, "li", sameNoteText(diff.same), "board-popover-note");
        Object.keys(pane.context).forEach(function (key) {
          addText(allConditions, "li", key + " · " + pane.context[key]);
        });
        sameDetails.appendChild(allConditions);
        header.appendChild(sameDetails);
        var menu = document.createElement("details");
        menu.className = "board-popover board-menu";
        var menuSummary = addText(menu, "summary", "⋯");
        menuSummary.setAttribute("aria-label", "칸 " + (index + 1) + " 메뉴");
        var apply = addText(menu, "button", "이 조건을 시트의 모든 칸에 적용");
        apply.type = "button";
        apply.addEventListener("click", function () {
          selectedPane = index;
          var chosen = Object.assign({}, currentSheet().panes[index].context);
          currentSheet().panes.forEach(function (item) {
            item.context = Object.assign({}, chosen);
          });
          menu.open = false;
          renderBoard();
          var activePane = boardGrid.querySelector('[data-board-pane="' + index + '"]');
          if (activePane) activePane.focus({ preventScroll: true });
        });
        header.appendChild(menu);
        // The differing-condition chips come last: selecting a pane changes how many chips a head shows, and chips placed before
        // the popover buttons moved them between mousedown and mouseup, so the first click only selected the pane.
        header.appendChild(differences);
        article.appendChild(header);
        var content = document.createElement("div");
        content.className = "board-pane-body";
        content.appendChild(buildMiniChart(pane.kind, pane.values));
        var metrics = document.createElement("div");
        metrics.className = "board-metrics";
        addText(metrics, "span", "예시 값 A " + (39 + index * 2));
        addText(metrics, "span", "예시 값 B " + (66 + index * 3));
        content.appendChild(metrics);
        article.appendChild(content);
        boardGrid.appendChild(article);
      });
    }
    function selectSheet(index, focus) {
      selectedSheet = index;
      selectedPane = 0;
      renderBoard();
      if (focus) boardTabs[index].focus();
    }
    all("[data-board-layout]", board).forEach(function (button) {
      button.addEventListener("click", function () {
        boardLayout = button.dataset.boardLayout;
        renderBoard();
      });
    });
    board.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var popover = event.target.closest("details.board-popover[open]");
      if (!popover) return;
      event.preventDefault();
      popover.open = false;
      popover.querySelector("summary").focus();
    });
    renderBoard();
  }
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
    // 본문 그림과 부록 갤러리 타일이 같은 캡처(data-shot-open 값이 같음)를 가리키면 한 장으로 센다.
    // 앞쪽(본문) 단추를 대표로 남기고 뒤에 오는 같은 캡처는 쪽수에서 뺀다.
    var uniqueShotButtons = shotButtons.filter(function (button, index) {
      return !shotButtons.some(function (other, otherIndex) {
        return otherIndex < index && other.dataset.shotOpen === button.dataset.shotOpen;
      });
    });
    var shownShots = uniqueShotButtons.slice();
    var shotIndex = 0;
    var shotReturn = null;
    function showShot(index) {
      shotIndex = (index + shownShots.length) % shownShots.length;
      var trigger = shownShots[shotIndex];
      var tile = trigger.closest(".shot-tile");
      var figure = trigger.closest("figure");
      var caption = figure && figure.querySelector("figcaption");
      var source = trigger.querySelector("img");
      var target = document.getElementById("shot-dialog-image");
      target.src = source.src;
      target.alt = source.alt;
      // 타일의 렌더 크기가 아니라 shots.json의 원본 크기(width/height 속성)를 쓴다.
      if (source.getAttribute("width")) {
        target.width = Number(source.getAttribute("width"));
        target.height = Number(source.getAttribute("height"));
      } else {
        target.removeAttribute("width");
        target.removeAttribute("height");
      }
      document.getElementById("shot-dialog-title").textContent = tile ? tile.querySelector("h4").textContent : caption ? caption.textContent : source.alt;
      document.getElementById("shot-dialog-description").textContent = tile ? tile.querySelector(".shot-copy p").textContent : source.alt;
      document.getElementById("shot-dialog-position").textContent = shotIndex + 1 + " / " + shownShots.length;
      var demoLink = document.getElementById("shot-dialog-demo");
      var tileDemo = tile && tile.querySelector("a[data-demo]");
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
      shownShots = uniqueShotButtons.filter(function (button) {
        var tile = button.closest(".shot-tile");
        return !tile || !tile.hidden;
      });
      document.getElementById("shot-count").textContent = shownShots.filter(function (button) {
        return button.closest(".shot-tile");
      }).length + "개 화면";
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
    all("[data-shot-group-link]").forEach(function (link) {
      link.addEventListener("click", function () {
        filterShots(link.dataset.shotGroupLink);
      });
    });
    shotButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        // 대표 단추가 아니어도(갤러리의 같은 캡처) 대표의 자리를 열어 준다.
        var target = uniqueShotButtons.filter(function (seen) {
          return seen.dataset.shotOpen === button.dataset.shotOpen;
        })[0];
        shotReturn = button;
        showShot(shownShots.indexOf(target));
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
  if (expand) {
    expand.addEventListener("click", function () {
      var next = all(".claim").some(function (detail) {
        return !detail.open;
      });
      all(".claim").forEach(function (detail) {
        detail.open = next;
      });
      expand.textContent = next ? "모두 접기" : "모두 펼치기";
    });
  }
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
    // The current section is the last one whose top has passed a reading line:
    // header height + 30% of the viewport. An anchor jump lands a section at
    // scroll-padding-top, well above that line, so the jumped-to section wins.
    var topbar = document.querySelector(".topbar");
    var updateCurrent = function () {
      var line = (topbar ? topbar.getBoundingClientRect().height : 0) + window.innerHeight * 0.3;
      var best = sections[0].id;
      sections.forEach(function (section) {
        if (section.getBoundingClientRect().top <= line) best = section.id;
      });
      current(best);
    };
    var observer = new IntersectionObserver(updateCurrent, {
      rootMargin: "0px 0px 0px 0px",
      threshold: 0,
    });
    sections.forEach(function (section) {
      observer.observe(section);
    });
    // The observer only fires when an intersection changes, so the final
    // callback can predate the last sub-pixel of a smooth or instant scroll.
    // Recompute once the scroll settles.
    var scrollSettle = 0;
    var scrollFrame = 0;
    window.addEventListener(
      "scroll",
      function () {
        if (!scrollFrame)
          scrollFrame = requestAnimationFrame(function () {
            scrollFrame = 0;
            updateCurrent();
          });
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
  // 열린 모바일 목차는 Esc로 닫고, 포커스를 토글(summary)로 돌린다.
  var mobileToc = document.querySelector(".mobile-toc");
  if (mobileToc)
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !mobileToc.open) return;
      mobileToc.open = false;
      var toggle = mobileToc.querySelector("summary");
      if (toggle) toggle.focus();
    });
  // 앵커 대상이 닫힌 <details>(원장·부록 접기) 안에 있으면 조상을 모두 연다 — 열지 않으면 대상이 숨어 스크롤이 일어나지 않는다.
  function revealTarget(hash) {
    if (!hash || hash.length < 2) return;
    var id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch (error) {
      return;
    }
    var target = document.getElementById(id);
    var opened = false;
    for (var d = target && target.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) {
      if (!d.open) opened = true;
      d.open = true;
    }
    return opened ? target : null;
  }
  all('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function () {
      revealTarget(a.hash);
    });
  });
  // 주소창에서 바꾼 해시는 브라우저가 먼저 점프하고 나서 이 이벤트가 오므로, 접기를 연 경우에만 다시 맞춘다.
  window.addEventListener("hashchange", function () {
    var revealed = revealTarget(location.hash);
    if (revealed) {
      revealed.scrollIntoView({ block: "start", behavior: "instant" });
      // 열린 부록의 지연 로딩 이미지가 높이를 바꾸면 목표 행이 밀리므로, 이미지가 로드될 때마다 같은 위치로 다시 맞춘다.
      var settling = all("#appendix img").filter(function (img) {
        return !img.complete;
      });
      settling.forEach(function (img) {
        img.addEventListener("load", function () {
          if (location.hash.slice(1) === revealed.id) revealed.scrollIntoView({ block: "start", behavior: "instant" });
        }, { once: true });
      });
    }
  });
  revealTarget(location.hash);
  // 초기 JS(읽는 사람 전환, 원장 열기)가 앞부분 높이를 바꾸면, 브라우저가 JS보다
  // 먼저 한 앵커 점프의 착지가 어긋난다. 절의 scroll-margin-top이 반영된 위치로
  // 한 번 더 맞춰 점프 결과와 사이드바 표시를 일치시킨다.
  // 닫힌 접기 안의 대상(부록·원장)도 브라우저 점프가 숨은 상태에서 일어나므로 같이 맞춘다.
  var reanchor = location.hash.length > 1 && document.querySelector('[id="' + CSS.escape(location.hash.slice(1)) + '"]');
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
