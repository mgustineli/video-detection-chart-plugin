# Video Detection Chart — Plugin Implementation Guide

## Overview

A hybrid Python + JS FiftyOne plugin that renders an interactive SVG line chart of per-frame temporal data in the modal view, with **bidirectional sync**. Supports two data models:

1. **Native video datasets** — frame-level data under `frames[]`
2. **Dynamically grouped image datasets** — e.g., NuScenes scenes played back as video via ImaVid (fields are top-level, not under `frames[]`)

Dynamic groups support all three navigation modes: **pagination**, **carousel**, and **video** (ImaVid).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ FiftyOne App (Browser)                                           │
│                                                                  │
│ ┌─────────────────┐   Recoil atoms    ┌────────────────────────┐ │
│ │ Video Player    │ ─(modalLooker)──▶ │ JS Panel               │ │
│ │ / ImaVid        │ ─(imaVidState)──▶ │ (index.umd.js)         │ │
│ │ / Carousel      │ ─(modalSampleId)▶ │                        │ │
│ │                 │                   │ ── useVideoState()      │ │
│ │                 │ ◀── getVideo() ── │ ── SVGChart             │ │
│ │                 │ ◀── drawFrame() ─ │ ── Field selector       │ │
│ │                 │ ◀── modalSelector │ ── Status bar           │ │
│ └─────────────────┘                   └────────────┬───────────┘ │
│                                                    │             │
│                                          useOperatorExecutor()   │
│                                                    │             │
│ ┌──────────────────────────────────────────────────▼───────────┐ │
│ │ Python Operators (__init__.py)                                │ │
│ │ ── GetTemporalFields: discovers plottable fields             │ │
│ │ ── GetFrameValues: per-frame data + sample_ids               │ │
│ │ ── GetDetectionCounts: legacy wrapper                        │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## File Structure

```
plugin/
├── __init__.py      # Python operators (+ FrameDataPlot reference panel, disabled)
├── index.umd.js     # JS panel (hand-written UMD, no build step)
├── fiftyone.yml     # Plugin manifest (1 panel, 3 operators)
└── package.json     # Points FiftyOne to index.umd.js
```

## Key Components

### 1. Python Operators (`__init__.py`)

**`GetTemporalFields`** — discovers plottable fields (`FloatField`, `IntField`, `ListField`):

```python
# Branches on ctx.view._is_dynamic_groups
if _is_dynamic_groups(ctx):
    schema = ctx.view.get_field_schema(flat=True, ftype=ftypes)
else:
    schema = ctx.view.get_frame_field_schema(flat=True, ftype=ftypes)
```

**`GetFrameValues`** — fetches per-frame values for any field:

```python
if _is_dynamic_groups(ctx):
    group = ctx.view.get_dynamic_group(group_key)
    values = group.values(expr)
    frame_numbers = list(range(1, len(values) + 1))
    sample_ids = [str(s) for s in group.values("id")]  # for carousel sync
else:
    view = fov.make_optimized_select_view(ctx.view, [sample_id])
    frame_numbers, values = view.values(["frames[].frame_number", expr])
```

For `ListField` types (like detections), plots `F(expr).length()` (count). For scalar fields, plots the value directly. Returns `sample_ids` for dynamic groups to enable carousel mode bidirectional sync.

### 2. JS Panel — `DetectionCountPlotInteractive` (`index.umd.js`)

Hand-written UMD module (no JSX, no build step). Uses `React.createElement` directly. Accesses FiftyOne internals via window globals:

| Global | Purpose |
|--------|---------|
| `__fos__` | Recoil atoms — `modalSampleId`, `modalLooker`, `isDynamicGroup`, `dynamicGroupsViewMode`, `imaVidLookerState`, `modalSelector` |
| `__foo__` | Operator execution — `useOperatorExecutor()` |
| `__fop__` | Plugin registration — `registerComponent()` |
| `__mui__` | MUI components — `Box`, `Typography`, `CircularProgress` |

#### Component Hierarchy

```
DetectionCountPlotPanel (main component)
├── useVideoState()          — reads frame number + playing state for all modes
├── useOperatorExecutor()    — discovers fields, loads per-frame data
├── Field selector (<select>) — VOODO-styled native dropdown
├── SVGChart                 — pure SVG rendering + click/drag-to-seek
├── Carousel sync            — sampleId ↔ frame mapping, modalSelector navigation
└── Status Bar               — frame counter, FPS, play/pause indicator
```

## Bidirectional Sync — How It Works

The `useVideoState` hook detects which mode is active and reads frame state accordingly. The `handleFrameSeek` callback dispatches to the correct seek mechanism.

### Mode Detection

```js
var isImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));
var isDynamicGroup = useRecoilValue(fos.isDynamicGroup);
var dynamicGroupsViewMode = useRecoilValue(fos.dynamicGroupsViewMode(true));
var isCarousel = isDynamicGroup && dynamicGroupsViewMode === "carousel";
```

### Native Video — Bidirectional Sync

**Video → Chart**: The `modalLooker` object (shared via Recoil) exposes live state subscriptions:

```js
modalLooker.subscribeToState("frameNumber", function(v) {
    // Update chart's blue vertical line position
});
modalLooker.subscribeToState("playing", function(v) { ... });
```

**Chart → Video**: Uses three `modalLooker` methods:

```js
function seekVideoToFrame(frameNumber, modalLooker, fps) {
    // 1. Seek the <video> element (not in regular DOM, only via modalLooker)
    var video = modalLooker.getVideo();
    video.currentTime = (frameNumber - 1) / fps;

    // 2. Sync the looker's internal state (overlays, frame counter)
    modalLooker.updater({ frameNumber: frameNumber });

    // 3. Pause playback (stay on the seeked frame)
    modalLooker.pause();
}
```

### ImaVid (Video Mode) — Bidirectional Sync

ImaVid treats a sequence of images as a "video" — there is no `<video>` element. Individual images are loaded into a frame store and painted onto an HTML canvas.

**Video → Chart**: Reads from the ImaVid Recoil state atoms:

```js
var imaVidFrameNumber = useRecoilValue(fos.imaVidLookerState("currentFrameNumber"));
var imaVidPlaying = useRecoilValue(fos.imaVidLookerState("playing"));
```

**Chart → Video**: Calls `drawFrameNoAnimation` directly on the `ImaVidElement`, matching FiftyOne's own `renderFrame` pattern in `ImaVidLookerReact`:

```js
function seekImaVidToFrame(frameNumber, modalLooker) {
    // Access ImaVidElement via lookerElement.children[0]
    // Matches ImaVidLooker.element getter: this.lookerElement.children[0]
    var el = modalLooker.lookerElement &&
             modalLooker.lookerElement.children &&
             modalLooker.lookerElement.children[0];

    if (el && typeof el.drawFrameNoAnimation === "function") {
        el.drawFrameNoAnimation(frameNumber);
    }
    // drawFrameNoAnimation handles: image retrieval from frame store,
    // canvas painting, state update, and retry if frame isn't buffered yet
}
```

**Why `updater()` alone doesn't work for ImaVid**: `ImaVidElement.renderSelf()` in modal mode never calls `drawFrameNoAnimation()` during seeking — it has a `thumbnail` guard (`if (!playing && !seeking && thumbnail)`) that is false in modal. So `updater({currentFrameNumber: N})` updates overlays but the canvas retains the old frame.

### Pagination Mode — Bidirectional Sync

**Image → Chart**: Reads the dynamic group element index:

```js
var dynamicGroupIndex = useRecoilValue(fos.dynamicGroupCurrentElementIndex);
var frameNumber = (dynamicGroupIndex || 0) + 1;
```

**Chart → Image**: Sets the index directly:

```js
setDynamicGroupIndex(frame - 1);
```

### Carousel Mode — Bidirectional Sync

Carousel mode required a fundamentally different approach because:
- `dynamicGroupCurrentElementIndex` does NOT update when carousel thumbnails are clicked
- The carousel does not react to `dynamicGroupCurrentElementIndex` changes — it only reacts to `modalSelector` changes

**Carousel → Chart**: Watches `modalSampleId` (which changes on thumbnail click) and resolves to frame number via a mapping built from the operator response:

```js
// Build mapping from operator response (sample_ids field)
var sampleIdToFrame = {};  // { "abc123": 1, "def456": 2, ... }

// Watch for navigation
useEffect(function () {
    if (!isCarousel || !modalSampleId) return;
    var frame = sampleIdToFrame[modalSampleId];
    if (frame !== undefined) setCarouselFrame(frame);
}, [modalSampleId, isCarousel]);
```

**Chart → Carousel**: Maps frame to sample ID, then navigates via `fos.modalSelector`:

```js
var targetSampleId = frameToSampleId[frame];
if (targetSampleId) {
    setModalSample(function (current) {
        return current ? Object.assign({}, current, { id: targetSampleId }) : current;
    });
}
```

### Why other approaches don't work (native video)

| Approach | Why it fails |
|----------|-------------|
| `fopb.seekTo()` via `useTimelineVizUtils` | Writes to jotai atoms, but UMD plugins have a different jotai store context than the video player. Atom writes are invisible to the video player. |
| `fopb.dispatchTimelineSetFrameNumberEvent()` | Dispatches a CustomEvent on `window`, but the listener (`useCreateTimeline`) is not active in this FOE version. |
| `document.querySelector("video")` | Returns `null` — the `<video>` element is not in the regular DOM. FiftyOne renders video through a canvas-based Looker that manages the `<video>` element internally. |
| `modalLooker.updateOptions({frameNumber})` | Updates viewer options (zoom, pan, etc.), not playback state. |

### Why `modalLooker` works

The `modalLooker` is the actual Looker instance, shared between the video player and plugin panels via a **Recoil atom** (`fos.modalLooker`). Recoil atoms are shared across the entire app, unlike jotai atoms which can be scoped to different Providers. This gives the plugin direct access to:

- `getVideo()` — the hidden `<video>` element (native video only)
- `lookerElement.children[0]` — the `ImaVidElement` with `drawFrameNoAnimation()` (ImaVid only)
- `updater()` — the state synchronization function
- `pause()` / `play()` — playback control
- `subscribeToState()` — live state subscriptions

## Data Flow

1. **Panel opens** in modal → reads `fos.modalSampleId` from Recoil
2. **Discovers fields** via `useOperatorExecutor("video-detection-chart/get_temporal_fields")`
3. **Auto-selects** first field (prefers `detections.detections` if available)
4. **Loads data** via `useOperatorExecutor("video-detection-chart/get_frame_values")`
5. **Python operator** returns `{frames, values, fps, total_frames, field, sample_ids}` — branching on `_is_dynamic_groups`
6. **Builds sample ID mappings** (for carousel mode) from `sample_ids` in the response
7. **SVG chart renders** with line + area fill + axis labels + field selector
8. **During playback/navigation**: frame state updates → blue vertical line moves on chart
9. **On chart click/drag**: `mouseDown` handler calculates frame → dispatches to mode-specific seek function

## SVG Chart Details

The chart is pure SVG (no charting library). Key elements:

- **Data line**: `<polyline>` connecting values per frame
- **Area fill**: `<path>` with low-opacity fill under the line
- **Gridlines**: dashed horizontal lines with Y-axis labels
- **Frame indicator**: blue vertical `<line>` + `<circle>` dot + value label
- **Click overlay**: transparent `<rect>` on top capturing `mouseDown`
- **Drag support**: `mouseDown` registers `mousemove`/`mouseup` on `document` for continuous seeking

## Deployment

```bash
# Zip the plugin
rm -f plugin.zip && zip -r plugin.zip __init__.py fiftyone.yml index.umd.js package.json

# Upload plugin.zip via FiftyOne UI (Settings → Plugins)
# Or via CLI:
# fiftyone plugins upload plugin.zip --url $FIFTYONE_API_URI --key $FIFTYONE_API_KEY

# Hard refresh browser (Cmd+Shift+R)
```

## Key Recoil Atoms

| Atom | Type | Purpose |
|------|------|---------|
| `fos.modalSampleId` | atom | Current sample ID in modal |
| `fos.modalLooker` | atom | The Looker instance (video player / ImaVid) |
| `fos.modalSelector` | atom | Set to navigate carousel (`{id: sampleId}`) |
| `fos.isDynamicGroup` | atom | Whether current view is a dynamic group |
| `fos.dynamicGroupCurrentElementIndex` | atom | Current element index in pagination mode |
| `fos.dynamicGroupsViewMode(true)` | selectorFamily | Returns `"pagination"`, `"carousel"`, or `"video"` |
| `fos.shouldRenderImaVidLooker(true)` | selectorFamily | Whether ImaVid mode is active |
| `fos.imaVidLookerState("currentFrameNumber")` | selectorFamily | ImaVid current frame number |
| `fos.imaVidLookerState("playing")` | selectorFamily | ImaVid playing state |

## Version Requirements

- FiftyOne Enterprise >= v2.16.2 (OSS >= v1.13.2) for timeline sync
- PR [#7044](https://github.com/voxel51/fiftyone/pull/7044) fixed a jotai store mismatch that prevented timeline subscribers from receiving frame updates
