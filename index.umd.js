// ============================================================
// DetectionCountPlotInteractive — JS Panel for video-detection-chart
//
// SVG line chart of per-frame detection counts with bidirectional
// video sync:
//   - Video → Chart: vertical blue line tracks current frame
//   - Chart → Video: click/drag on chart seeks the video
//
// Hand-written UMD (no build step). Uses FiftyOne globals:
//   __fos__ (state), __foo__ (operators), __fop__ (plugins),
//   __mui__ (MUI), React, recoil
// ============================================================

(function () {
  "use strict";

  // --- Globals ---
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useCallback = React.useCallback;
  var memo = React.memo;

  var useRecoilValue = window.recoil.useRecoilValue;

  var fos = window.__fos__;
  var foo = window.__foo__;
  var fop = window.__fop__;
  var mui = window.__mui__;

  var Box = mui.Box;
  var Typography = mui.Typography;
  var CircularProgress = mui.CircularProgress;

  var LOG_PREFIX = "[DetectionCountPlot]";

  // --- Constants ---
  var CHART_HEIGHT = 350;
  var MARGIN = { top: 35, right: 30, bottom: 50, left: 65 };

  // ==========================================================
  // Hook: useVideoState
  // Reads video playback state from the modal looker.
  // Handles both regular video and ImaVid modes.
  // Pattern from cariad-imavid-state plugin.
  // ==========================================================
  function useVideoState() {
    var isImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));
    var imaVidFrameNumber = useRecoilValue(
      fos.imaVidLookerState("currentFrameNumber"),
    );
    var imaVidPlaying = useRecoilValue(fos.imaVidLookerState("playing"));
    var modalLooker = useRecoilValue(fos.modalLooker);

    var stateRef = useRef({ playing: false, frameNumber: 1 });
    var _s = useState(0);
    var forceUpdate = _s[1];

    useEffect(
      function () {
        // Path 1: ImaVid mode
        if (isImaVid) {
          stateRef.current = {
            playing: imaVidPlaying,
            frameNumber: imaVidFrameNumber,
          };
          forceUpdate(function (n) {
            return n + 1;
          });
          return;
        }

        // Path 2: Regular video — subscribe to looker state
        // Use feature detection (constructor.name gets minified in production)
        if (modalLooker && typeof modalLooker.subscribeToState === "function") {
          stateRef.current = {
            playing: modalLooker.state.playing,
            frameNumber: modalLooker.state.frameNumber,
          };
          forceUpdate(function (n) {
            return n + 1;
          });

          var unsub1 = modalLooker.subscribeToState("playing", function (v) {
            stateRef.current = {
              playing: v,
              frameNumber: stateRef.current.frameNumber,
            };
            forceUpdate(function (n) {
              return n + 1;
            });
          });

          var unsub2 = modalLooker.subscribeToState(
            "frameNumber",
            function (v) {
              stateRef.current = {
                playing: stateRef.current.playing,
                frameNumber: v,
              };
              forceUpdate(function (n) {
                return n + 1;
              });
            },
          );

          return function () {
            unsub1();
            unsub2();
          };
        }
      },
      [isImaVid, imaVidFrameNumber, imaVidPlaying, modalLooker],
    );

    return {
      playing: stateRef.current.playing,
      frameNumber: stateRef.current.frameNumber,
      modalLooker: modalLooker,
    };
  }

  // ==========================================================
  // Utility: seekVideoToFrame
  // Uses modalLooker.getVideo() to seek the <video> element
  // (not in regular DOM, only accessible via the looker) and
  // modalLooker.updater() to sync internal looker state.
  // ==========================================================
  function seekVideoToFrame(frameNumber, modalLooker, fps) {
    if (!modalLooker) return;

    // Seek the actual video element
    if (typeof modalLooker.getVideo === "function") {
      var video = modalLooker.getVideo();
      if (video && video.currentTime !== undefined) {
        video.currentTime = (frameNumber - 1) / fps;
      }
    }

    // Sync the looker's internal state
    if (typeof modalLooker.updater === "function") {
      modalLooker.updater({ frameNumber: frameNumber });
    }

    // Pause if playing (stay on the seeked frame)
    if (typeof modalLooker.pause === "function") {
      modalLooker.pause();
    }
  }

  // ==========================================================
  // Component: SVGChart
  // Pure SVG line chart with current-frame indicator and
  // click/drag-to-seek.
  // ==========================================================
  function SVGChart(props) {
    var frames = props.frames;
    var counts = props.counts;
    var currentFrame = props.currentFrame;
    var totalFrames = props.totalFrames;
    var onFrameSeek = props.onFrameSeek;
    var width = props.width;

    var plotWidth = width - MARGIN.left - MARGIN.right;
    var plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

    if (plotWidth <= 0 || plotHeight <= 0) return null;

    var maxCount = 1;
    for (var i = 0; i < counts.length; i++) {
      if (counts[i] > maxCount) maxCount = counts[i];
    }
    // Add 10% headroom
    var yMax = Math.ceil(maxCount * 1.1);

    // --- Scale functions ---
    var xScale = function (frame) {
      return (
        MARGIN.left + ((frame - 1) / Math.max(totalFrames - 1, 1)) * plotWidth
      );
    };
    var yScale = function (count) {
      return MARGIN.top + plotHeight - (count / yMax) * plotHeight;
    };

    // --- Frame seek from mouse position ---
    var frameFromMouseX = function (clientX, svgEl) {
      var rect = svgEl.getBoundingClientRect();
      var clickX = clientX - rect.left;
      if (clickX < MARGIN.left) clickX = MARGIN.left;
      if (clickX > width - MARGIN.right) clickX = width - MARGIN.right;
      var fraction = (clickX - MARGIN.left) / plotWidth;
      var frame = Math.round(fraction * (totalFrames - 1)) + 1;
      return Math.max(1, Math.min(totalFrames, frame));
    };

    // --- Mouse handlers for click + drag seeking ---
    var svgRef = useRef(null);

    var handleMouseDown = useCallback(
      function (e) {
        if (!svgRef.current) return;
        e.preventDefault();

        var frame = frameFromMouseX(e.clientX, svgRef.current);
        onFrameSeek(frame);

        var svg = svgRef.current;

        var handleMouseMove = function (ev) {
          var f = frameFromMouseX(ev.clientX, svg);
          onFrameSeek(f);
        };

        var handleMouseUp = function () {
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      },
      [onFrameSeek, totalFrames, width],
    );

    // --- Build SVG children ---
    var children = [];

    // Background
    children.push(
      h("rect", {
        key: "bg",
        width: width,
        height: CHART_HEIGHT,
        fill: "#18191A",
        rx: 6,
      }),
    );

    // Y axis gridlines + labels
    var yTickCount = 5;
    for (var t = 0; t <= yTickCount; t++) {
      var tickVal = Math.round((yMax / yTickCount) * t);
      var y = yScale(tickVal);
      children.push(
        h("line", {
          key: "yg-" + t,
          x1: MARGIN.left,
          y1: y,
          x2: width - MARGIN.right,
          y2: y,
          stroke: "#1E1F20",
          strokeWidth: 1,
          strokeDasharray: "4,4",
        }),
      );
      children.push(
        h(
          "text",
          {
            key: "yl-" + t,
            x: MARGIN.left - 10,
            y: y + 4,
            fill: "#8F8D8B",
            fontSize: 12,
            textAnchor: "end",
            fontFamily: "monospace",
          },
          tickVal,
        ),
      );
    }

    // X axis tick labels
    var xTickStep = Math.max(1, Math.floor(totalFrames / 8));
    var xTicks = [];
    for (var f = 1; f <= totalFrames; f += xTickStep) {
      xTicks.push(f);
    }
    if (xTicks[xTicks.length - 1] !== totalFrames) {
      xTicks.push(totalFrames);
    }
    for (var xi = 0; xi < xTicks.length; xi++) {
      var xv = xTicks[xi];
      children.push(
        h(
          "text",
          {
            key: "xl-" + xi,
            x: xScale(xv),
            y: CHART_HEIGHT - MARGIN.bottom + 20,
            fill: "#8F8D8B",
            fontSize: 12,
            textAnchor: "middle",
            fontFamily: "monospace",
          },
          xv,
        ),
      );
      // Small tick mark
      children.push(
        h("line", {
          key: "xt-" + xi,
          x1: xScale(xv),
          y1: MARGIN.top + plotHeight,
          x2: xScale(xv),
          y2: MARGIN.top + plotHeight + 5,
          stroke: "#404040",
          strokeWidth: 1,
        }),
      );
    }

    // Axis lines
    children.push(
      h("line", {
        key: "xaxis",
        x1: MARGIN.left,
        y1: MARGIN.top + plotHeight,
        x2: width - MARGIN.right,
        y2: MARGIN.top + plotHeight,
        stroke: "#404040",
        strokeWidth: 1,
      }),
    );
    children.push(
      h("line", {
        key: "yaxis",
        x1: MARGIN.left,
        y1: MARGIN.top,
        x2: MARGIN.left,
        y2: MARGIN.top + plotHeight,
        stroke: "#404040",
        strokeWidth: 1,
      }),
    );

    // Area fill under line
    if (frames.length > 1) {
      var areaD = "M " + xScale(frames[0]) + "," + (MARGIN.top + plotHeight);
      for (var ai = 0; ai < frames.length; ai++) {
        areaD += " L " + xScale(frames[ai]) + "," + yScale(counts[ai]);
      }
      areaD +=
        " L " +
        xScale(frames[frames.length - 1]) +
        "," +
        (MARGIN.top + plotHeight) +
        " Z";
      children.push(
        h("path", {
          key: "area",
          d: areaD,
          fill: "rgba(255, 109, 4, 0.10)",
        }),
      );
    }

    // Data line
    if (frames.length > 0) {
      var pts = "";
      for (var li = 0; li < frames.length; li++) {
        if (li > 0) pts += " ";
        pts += xScale(frames[li]) + "," + yScale(counts[li]);
      }
      children.push(
        h("polyline", {
          key: "line",
          points: pts,
          fill: "none",
          stroke: "#FF6D04",
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }),
      );
    }

    // Current frame indicator
    if (currentFrame >= 1 && currentFrame <= totalFrames) {
      var cx = xScale(currentFrame);

      // Vertical line
      children.push(
        h("line", {
          key: "vline",
          x1: cx,
          y1: MARGIN.top,
          x2: cx,
          y2: MARGIN.top + plotHeight,
          stroke: "#86B5F6",
          strokeWidth: 2,
          opacity: 0.85,
        }),
      );

      // Frame label above chart
      children.push(
        h(
          "text",
          {
            key: "vlabel",
            x: cx,
            y: MARGIN.top - 10,
            fill: "#86B5F6",
            fontSize: 14,
            fontWeight: "bold",
            textAnchor: "middle",
            fontFamily: "monospace",
          },
          "Frame " + currentFrame,
        ),
      );

      // Dot at data point (if frame exists in data)
      var dataIdx = -1;
      for (var di = 0; di < frames.length; di++) {
        if (frames[di] === currentFrame) {
          dataIdx = di;
          break;
        }
      }
      if (dataIdx >= 0) {
        children.push(
          h("circle", {
            key: "vdot",
            cx: cx,
            cy: yScale(counts[dataIdx]),
            r: 5,
            fill: "#86B5F6",
            stroke: "#FFF9F5",
            strokeWidth: 2,
          }),
        );
        // Count label next to dot
        children.push(
          h(
            "text",
            {
              key: "vcount",
              x: cx + 10,
              y: yScale(counts[dataIdx]) - 8,
              fill: "#86B5F6",
              fontSize: 12,
              fontWeight: "bold",
              fontFamily: "monospace",
            },
            counts[dataIdx] + " det",
          ),
        );
      }
    }

    // Y axis title
    children.push(
      h(
        "text",
        {
          key: "ytitle",
          x: 16,
          y: CHART_HEIGHT / 2,
          fill: "#6E6C6A",
          fontSize: 14,
          textAnchor: "middle",
          transform: "rotate(-90, 16, " + CHART_HEIGHT / 2 + ")",
          fontFamily: "sans-serif",
        },
        "Detection Count",
      ),
    );

    // X axis title
    children.push(
      h(
        "text",
        {
          key: "xtitle",
          x: width / 2,
          y: CHART_HEIGHT - 5,
          fill: "#6E6C6A",
          fontSize: 14,
          textAnchor: "middle",
          fontFamily: "sans-serif",
        },
        "Frame Number",
      ),
    );

    // Transparent overlay for click/drag — on top of everything
    children.push(
      h("rect", {
        key: "overlay",
        x: MARGIN.left,
        y: MARGIN.top,
        width: plotWidth,
        height: plotHeight,
        fill: "transparent",
        cursor: "crosshair",
        onMouseDown: handleMouseDown,
      }),
    );

    return h(
      "svg",
      {
        ref: svgRef,
        width: width,
        height: CHART_HEIGHT,
        style: { display: "block", userSelect: "none" },
      },
      children,
    );
  }

  // ==========================================================
  // Main Panel Component
  // ==========================================================
  function DetectionCountPlotPanel() {
    // --- State ---
    var _data = useState(null);
    var data = _data[0];
    var setData = _data[1];

    var _loading = useState(true);
    var loading = _loading[0];
    var setLoading = _loading[1];

    var _error = useState(null);
    var error = _error[0];
    var setError = _error[1];

    var _width = useState(800);
    var containerWidth = _width[0];
    var setContainerWidth = _width[1];

    var containerRef = useRef(null);
    var prevSampleRef = useRef(null);

    // --- Recoil state ---
    var modalSampleId;
    try {
      modalSampleId = useRecoilValue(fos.modalSampleId);
    } catch (e) {
      // Fallback: try alternative atoms
      console.warn(LOG_PREFIX, "fos.modalSampleId failed, trying fallback", e);
      modalSampleId = null;
    }

    // --- Video state ---
    var videoState = useVideoState();
    var frameNumber = videoState.frameNumber;
    var playing = videoState.playing;
    var modalLooker = videoState.modalLooker;

    // --- Operator executor ---
    var executor = null;
    if (foo && typeof foo.useOperatorExecutor === "function") {
      executor = foo.useOperatorExecutor(
        "video-detection-chart/get_detection_counts",
      );
    } else {
      console.error(
        LOG_PREFIX,
        "foo.useOperatorExecutor not available — cannot load data",
      );
    }

    // --- Load data when sample changes ---
    useEffect(
      function () {
        if (!modalSampleId || !executor) return;
        if (modalSampleId === prevSampleRef.current) return;
        prevSampleRef.current = modalSampleId;

        setLoading(true);
        setError(null);
        setData(null);

        console.log(LOG_PREFIX, "Loading data for sample", modalSampleId);
        executor.execute({ sample_id: modalSampleId });
      },
      [modalSampleId],
    );

    // --- Watch executor result ---
    useEffect(
      function () {
        if (!executor) return;

        if (executor.isExecuting) return;

        if (executor.error) {
          setError(String(executor.error));
          setLoading(false);
          return;
        }

        var result = executor.result;
        if (!result) return;

        // Handle possible wrapping: result might be { result: {...} }
        var payload = result.result || result;

        if (payload.error) {
          setError(payload.error);
        } else if (payload.frames && payload.counts) {
          setData(payload);
          console.log(
            LOG_PREFIX,
            "Loaded",
            payload.frames.length,
            "frames,",
            payload.total_frames,
            "total,",
            payload.fps,
            "fps",
          );
        }
        setLoading(false);
      },
      [executor && executor.isExecuting, executor && executor.result],
    );

    // --- Container resize ---
    useEffect(function () {
      if (!containerRef.current) return;
      var obs = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          setContainerWidth(entries[i].contentRect.width);
        }
      });
      obs.observe(containerRef.current);
      return function () {
        obs.disconnect();
      };
    }, []);

    // --- Chart → Video seeking ---
    var fpsForSeek = (data && data.fps) || 30;

    var handleFrameSeek = useCallback(
      function (frame) {
        seekVideoToFrame(frame, modalLooker, fpsForSeek);
      },
      [modalLooker, fpsForSeek],
    );

    // --- Render: Loading ---
    if (loading) {
      return h(
        Box,
        {
          ref: containerRef,
          sx: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: CHART_HEIGHT,
            bgcolor: "#18191A",
            borderRadius: 1.5,
            gap: 2,
          },
        },
        h(CircularProgress, { size: 36, sx: { color: "#FF6D04" } }),
        h(
          Typography,
          { variant: "body2", sx: { color: "#8F8D8B" } },
          "Loading detection counts\u2026",
        ),
      );
    }

    // --- Render: Error ---
    if (error) {
      return h(
        Box,
        {
          ref: containerRef,
          sx: {
            padding: 3,
            bgcolor: "#18191A",
            borderRadius: 1.5,
            textAlign: "center",
          },
        },
        h(
          Typography,
          { sx: { color: "#FF6767", mb: 1 } },
          "Error loading data",
        ),
        h(
          Typography,
          { variant: "body2", sx: { color: "#8F8D8B" } },
          String(error),
        ),
      );
    }

    // --- Render: No data ---
    if (!data || !data.frames || data.frames.length === 0) {
      return h(
        Box,
        {
          ref: containerRef,
          sx: {
            padding: 3,
            bgcolor: "#18191A",
            borderRadius: 1.5,
            textAlign: "center",
          },
        },
        h(
          Typography,
          { sx: { color: "#8F8D8B" } },
          "No detection data available for this sample",
        ),
      );
    }

    // --- Render: Chart ---
    var totalFrames = data.total_frames || data.frames.length;

    return h(
      Box,
      {
        ref: containerRef,
        sx: { width: "100%", overflow: "hidden" },
      },
      // SVG Chart
      h(SVGChart, {
        frames: data.frames,
        counts: data.counts,
        currentFrame: frameNumber,
        totalFrames: totalFrames,
        onFrameSeek: handleFrameSeek,
        width: containerWidth,
      }),
      // Status bar
      h(
        Box,
        {
          sx: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 2,
            py: 1,
            bgcolor: "#0D0D0D",
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 6,
          },
        },
        h(
          Typography,
          { variant: "body2", sx: { color: "#8F8D8B", fontFamily: "monospace" } },
          "Frame " + frameNumber + " / " + totalFrames,
        ),
        h(
          Typography,
          { variant: "body2", sx: { color: "#8F8D8B", fontFamily: "monospace" } },
          data.fps + " FPS \u00B7 " + data.frames.length + " frames with data",
        ),
        h(
          Typography,
          {
            variant: "body2",
            sx: {
              color: playing ? "#FF6D04" : "#8F8D8B",
              fontFamily: "monospace",
              fontWeight: playing ? "bold" : "normal",
            },
          },
          playing ? "\u25B6 Playing" : "\u23F8 Paused",
        ),
      ),
    );
  }

  // ==========================================================
  // Icon Component — line chart icon
  // ==========================================================
  var ChartIcon = memo(function ChartIcon(props) {
    var size = props.size || "1rem";
    return h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: props.style,
      },
      h("polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" }),
    );
  });

  // ==========================================================
  // Register Panel
  // ==========================================================
  console.log(LOG_PREFIX, "Registering DetectionCountPlotInteractive panel");

  fop.registerComponent({
    name: "DetectionCountPlotInteractive",
    label: "Detection Count Plot (Interactive)",
    component: DetectionCountPlotPanel,
    type: fop.PluginComponentType.Panel,
    Icon: ChartIcon,
    panelOptions: { surfaces: "modal" },
  });

  console.log(LOG_PREFIX, "Registration complete");
})();
