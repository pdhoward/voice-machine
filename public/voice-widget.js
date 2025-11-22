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
    // Inline SVG icon (VoiceIcon) (Speech bubble with dots)
    // ─────────────────────────────────────────────
 
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "26");
    svg.setAttribute("height", "26");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "none");

    // Soft circular backdrop to keep it feeling “orb-y”
    var bgCircle = document.createElementNS(svgNS, "circle");
    bgCircle.setAttribute("cx", "12");
    bgCircle.setAttribute("cy", "12");
    bgCircle.setAttribute("r", "11");
    bgCircle.setAttribute("fill", "#ffffff");
    bgCircle.setAttribute("fill-opacity", "0.95");
    svg.appendChild(bgCircle);

    // Speech bubble
    var bubble = document.createElementNS(svgNS, "path");
    // Rounded speech bubble with tail
    bubble.setAttribute(
      "d",
      "M4 7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5.5a4 4 0 0 1-4 4H13l-2.8 2.8c-.6.6-1.6.2-1.6-.6V16H8a4 4 0 0 1-4-4V7z"
    );
    bubble.setAttribute("fill", "#ffffff");
    bubble.setAttribute("stroke", primaryColor);
    bubble.setAttribute("stroke-width", "1.7");
    bubble.setAttribute("stroke-linejoin", "round");
    svg.appendChild(bubble);

  // Three dots inside bubble (typing / ongoing conversation feel)
  function makeDot(cx) {
    var dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", "10.3");
    dot.setAttribute("r", "0.85");
    dot.setAttribute("fill", primaryColor);
    return dot;
    }

    svg.appendChild(makeDot(9));
    svg.appendChild(makeDot(12));
    svg.appendChild(makeDot(15));

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
