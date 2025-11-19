// public/voice-widget.js
(function () {
  var WIDGET_ATTR = "data-tenant-widget-key";
  var SCRIPT_MATCH = 'script[src*="voice-widget.js"][' + WIDGET_ATTR + "]";

  // Global state for active overlay / launcher / iframe
  var activeOverlay = null;
  var activeLauncherContainer = null;
  var activeIframe = null;
  var STYLES_INJECTED = false;

  function injectPulseStyles() {
    if (STYLES_INJECTED) return;
    STYLES_INJECTED = true;

    var style = document.createElement("style");
    //style.type = "text/css";
    style.textContent = `
      @keyframes sm-voice-orb-pulse {
        0% {
          transform: translateY(0) scale(1);
          box-shadow: 0 10px 16px -6px rgba(15,23,42,0.35),
                      0 4px 8px -4px rgba(15,23,42,0.25);
        }
        50% {
          transform: translateY(-1px) scale(1.05);
          box-shadow: 0 16px 24px -8px rgba(15,23,42,0.45),
                      0 6px 12px -6px rgba(15,23,42,0.35);
        }
        100% {
          transform: translateY(0) scale(1);
          box-shadow: 0 10px 16px -6px rgba(15,23,42,0.35),
                      0 4px 8px -4px rgba(15,23,42,0.25);
        }
      }

      .sm-voice-orb {
        animation: sm-voice-orb-pulse 2.2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  function closeOverlay() {
    if (activeOverlay && activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
    activeIframe = null;

    if (activeLauncherContainer) {
      activeLauncherContainer.style.display = "flex";
    }
  }

  // Listen for messages from the iframe
  window.addEventListener("message", function (event) {
    if (!event.data || !event.data.type) return;

    if (event.data.type === "sm-voice-widget-close") {
      closeOverlay();
      return;
    }

    if (event.data.type === "sm-voice-widget-resize" && activeIframe) {
      var h = parseInt(event.data.height, 10);
      var w = parseInt(event.data.width, 10);

      if (!isNaN(h) && h > 0) {
        // Keep a little margin from viewport edges
        var maxH = window.innerHeight - 40;
        activeIframe.style.height = Math.min(h, maxH) + "px";
      }

      // Width is optional; usually we keep maxWidth fixed.
      if (!isNaN(w) && w > 0) {
        var maxW = Math.min(w, window.innerWidth - 32);
        activeIframe.style.width = maxW + "px";
      }
    }
  });

  function createVoiceButton(options) {
    var displayName = options.displayName || "Our Team";
    var primaryColor = options.primaryColor || "#2563eb";
    var baseUrl = options.baseUrl;
    var token = options.token;
    var tenantId = options.tenantId;

    injectPulseStyles();

    // ─────────────────────────────────────────────
    // Container for tooltip + orb
    // ─────────────────────────────────────────────
    var container = document.createElement("div");
    container.style.position = "fixed";
    container.style.right = "16px";
    container.style.bottom = "16px";
    container.style.zIndex = "999999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "flex-end";
    container.style.gap = "6px";

    // ─────────────────────────────────────────────
    // Round orb button (with pulse)
    // ─────────────────────────────────────────────
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Talk to " + displayName);
    btn.className = "sm-voice-orb";
    btn.style.width = "52px";
    btn.style.height = "52px";
    btn.style.borderRadius = "9999px";
    btn.style.border = "2px solid " + primaryColor;
    btn.style.background = "#ffffff";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.cursor = "pointer";
    btn.style.boxShadow =
      "0 10px 16px -6px rgba(15,23,42,0.35), 0 4px 8px -4px rgba(15,23,42,0.25)";
    btn.style.padding = "0";
    btn.style.outline = "none";
    btn.style.transition =
      "transform 0.15s ease-out, box-shadow 0.15s ease-out, border-color 0.15s ease-out, background-color 0.15s ease-out";

    btn.addEventListener("mouseenter", function () {
      btn.style.transform = "translateY(-2px) scale(1.05)";
      btn.style.boxShadow =
        "0 18px 28px -8px rgba(15,23,42,0.5), 0 8px 14px -6px rgba(15,23,42,0.4)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.transform = "translateY(0) scale(1)";
      btn.style.boxShadow =
        "0 10px 16px -6px rgba(15,23,42,0.35), 0 4px 8px -4px rgba(15,23,42,0.25)";
    });
    btn.addEventListener("focus", function () {
      btn.style.boxShadow =
        "0 0 0 2px #ffffff, 0 0 0 4px " + primaryColor;
    });
    btn.addEventListener("blur", function () {
      btn.style.boxShadow =
        "0 10px 16px -6px rgba(15,23,42,0.35), 0 4px 8px -4px rgba(15,23,42,0.25)";
    });

    // ─────────────────────────────────────────────
    // Orb click → open iframe overlay & hide orb
    // ─────────────────────────────────────────────
    btn.addEventListener("click", function () {
      if (activeOverlay) return;

      var overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "999998";
      overlay.style.background = "rgba(15,23,42,0.55)";
      overlay.style.display = "flex";
      overlay.style.justifyContent = "flex-end";
      overlay.style.alignItems = "flex-end";

      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          closeOverlay();
        }
      });

      var iframe = document.createElement("iframe");
      iframe.src =
        baseUrl +
        "/widget?token=" +
        encodeURIComponent(token) +
        "&tenantId=" +
        encodeURIComponent(tenantId);
      iframe.style.border = "none";
      iframe.style.width = "100%";
      iframe.style.maxWidth = "420px";
      // Initial height; will be refined by sm-voice-widget-resize
      iframe.style.height = "420px";
      iframe.style.borderRadius = "16px 16px 0 0";
      iframe.style.boxShadow =
        "0 20px 40px rgba(15,23,42,0.45)";
      iframe.allow = "microphone;";

      overlay.appendChild(iframe);
      document.body.appendChild(overlay);

      // Hide launcher while panel is open
      container.style.display = "none";

      activeOverlay = overlay;
      activeLauncherContainer = container;
      activeIframe = iframe;
    });

    // ─────────────────────────────────────────────
    // Inline SVG icon (VoiceIcon)
    // ─────────────────────────────────────────────
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "28");
    svg.setAttribute("height", "28");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", primaryColor);
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    var rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("width", "24");
    rect.setAttribute("height", "24");
    rect.setAttribute("fill", "white");
    svg.appendChild(rect);

    var circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    svg.appendChild(circle);

    var p1 = document.createElementNS(svgNS, "path");
    p1.setAttribute("d", "M5.969 4a9.12 9.12 0 0 1 12.061 0");
    svg.appendChild(p1);

    var p2 = document.createElementNS(svgNS, "path");
    p2.setAttribute("d", "M8.01 7.55a6.27 6.27 0 0 1 8.026 0");
    svg.appendChild(p2);

    var p3 = document.createElementNS(svgNS, "path");
    p3.setAttribute("d", "M10.02 11.11a3.42 3.42 0 0 1 3.962 0");
    svg.appendChild(p3);

    var dot = document.createElementNS(svgNS, "line");
    dot.setAttribute("x1", "12");
    dot.setAttribute("y1", "15");
    dot.setAttribute("x2", "12");
    dot.setAttribute("y2", "15");
    svg.appendChild(dot);

    var baseRect = document.createElementNS(svgNS, "rect");
    baseRect.setAttribute("x", "8");
    baseRect.setAttribute("y", "17");
    baseRect.setAttribute("width", "8");
    baseRect.setAttribute("height", "2");
    baseRect.setAttribute("rx", "1");
    svg.appendChild(baseRect);

    btn.appendChild(svg);

    // ─────────────────────────────────────────────
    // Tooltip label
    // ─────────────────────────────────────────────
    var label = document.createElement("div");
    label.textContent = "Talk to " + displayName;
    label.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    label.style.fontSize = "12px";
    label.style.lineHeight = "1.3";
    label.style.padding = "6px 10px";
    label.style.borderRadius = "9999px";
    label.style.background = "rgba(15,23,42,0.96)";
    label.style.color = "#f9fafb";
    label.style.boxShadow =
      "0 10px 15px -3px rgba(15,23,42,0.35),0 4px 6px -4px rgba(15,23,42,0.3)";
    label.style.opacity = "0";
    label.style.transform = "translateY(4px)";
    label.style.pointerEvents = "none";
    label.style.transition =
      "opacity 0.15s ease-out, transform 0.15s ease-out";
    label.style.maxWidth = "220px";
    label.style.textAlign = "right";
    label.style.whiteSpace = "nowrap";

    btn.addEventListener("mouseenter", function () {
      label.style.opacity = "1";
      label.style.transform = "translateY(0)";
    });
    btn.addEventListener("mouseleave", function () {
      label.style.opacity = "0";
      label.style.transform = "translateY(4px)";
    });
    btn.addEventListener("focus", function () {
      label.style.opacity = "1";
      label.style.transform = "translateY(0)";
    });
    btn.addEventListener("blur", function () {
      label.style.opacity = "0";
      label.style.transform = "translateY(4px)";
    });

    container.appendChild(label);
    container.appendChild(btn);
    document.body.appendChild(container);
  }

  function init() {
    var scripts = document.querySelectorAll(SCRIPT_MATCH);
    if (!scripts.length) return;

    scripts.forEach(function (script) {
      var key = script.getAttribute(WIDGET_ATTR);
      if (!key) return;

      var scriptSrc = script.getAttribute("src") || "";
      var baseUrl;
      try {
        var url = new URL(scriptSrc, window.location.href);
        baseUrl = url.origin;
      } catch (e) {
        baseUrl = "https://chaotic.ngrok.io";
      }

      fetch(
        baseUrl +
          "/api/public/widget/bootstrap?key=" +
          encodeURIComponent(key),
        {
          credentials: "omit",
        }
      )
        .then(function (res) {
          return res.json();
        })
        .then(function (json) {
          if (!json || !json.ok) {
            console.warn(
              "[SM Voice Widget] bootstrap failed:",
              json && json.error
            );
            return;
          }

          var token = json.widgetSessionToken;
          var displayName = json.displayName || "Our Team";
          var primaryColor =
            (json.branding && json.branding.primaryColor) || "#2563eb";

          createVoiceButton({
            displayName: displayName,
            primaryColor: primaryColor,
            baseUrl: baseUrl,
            token: token,
            tenantId: json.tenantId || "machine",
          });
        })
        .catch(function (err) {
          console.error("[SM Voice Widget] bootstrap error", err);
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
