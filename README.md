# Video Detection Chart Plugin for FiftyOne

A [FiftyOne](https://github.com/voxel51/fiftyone) plugin that renders an interactive SVG line chart of per-frame temporal data in the modal view, with **bidirectional sync**.

Supports **native video datasets** and **dynamically grouped image datasets** (e.g., NuScenes scenes played back as video via ImaVid) across all navigation modes: pagination, carousel, and video.

- **Video/Image → Chart**: a blue vertical line tracks the current frame in real time
- **Chart → Video/Image**: click or drag anywhere on the chart to seek to that frame

![gif](video-detection-chart-plugin.gif)

## Installation

```shell
fiftyone plugins download https://github.com/mgustineli/video-detection-chart-plugin
```

## Operators

All operators are unlisted (called internally by the JS panel):

| Operator | Description |
|----------|-------------|
| `get_temporal_fields` | Discovers plottable frame-level fields (`FloatField`, `IntField`, `ListField`) |
| `get_frame_values` | Returns per-frame values for any temporal field, with `sample_ids` for carousel sync |
| `get_detection_counts` | Legacy wrapper — delegates to `get_frame_values` with `detections.detections` |

## Panel

### Detection Count Plot (Interactive)

Opens in the modal view alongside the video player. Features:

- **Field selector** dropdown to choose which temporal field to plot
- **Line + area fill** chart of per-frame values
- **Blue frame indicator** (vertical line + dot + value label) tracking the current frame
- **Click/drag to seek** — click anywhere on the chart or drag to scrub through frames
- **Status bar** showing frame number, FPS, and play/pause state

## Usage

### Native video datasets

1. Load a **video dataset** with frame-level data (e.g., `frames.detections`)
2. Open a sample in the modal view
3. Open the panel via the **+** button and select **"Detection Count Plot (Interactive)"**
4. Select a field from the dropdown — the chart plots per-frame values
5. Play the video — the blue line tracks the current frame
6. Click or drag on the chart to seek the video to any frame

### Dynamically grouped image datasets

1. Create a dynamic group view (e.g., `dataset.group_by("scene_token", order_by="timestamp")`)
2. Open a sample in the modal view (works in pagination, carousel, or video mode)
3. Open the panel — the chart plots values across all images in the group
4. Navigate images (click thumbnails in carousel, arrows in pagination) — the chart tracks position
5. Click on the chart — the displayed image changes to the corresponding frame

## How It Works

The plugin is a hybrid Python + JS implementation:

- **Python** (`__init__.py`): Operators discover temporal fields and fetch per-frame data, branching on `ctx.view._is_dynamic_groups` for grouped vs native video datasets
- **JavaScript** (`index.umd.js`): Hand-written UMD panel (no build step) renders an SVG chart with bidirectional sync

### Sync by mode

| Mode | Image/Video → Chart | Chart → Image/Video |
|------|---------------------|---------------------|
| **Native video** | `modalLooker.subscribeToState("frameNumber")` | `modalLooker.getVideo().currentTime` + `updater()` + `pause()` |
| **ImaVid (video mode)** | `fos.imaVidLookerState("currentFrameNumber")` | `drawFrameNoAnimation()` on `ImaVidElement` |
| **Pagination** | `fos.dynamicGroupCurrentElementIndex` | `setDynamicGroupIndex(frame - 1)` |
| **Carousel** | Watch `modalSampleId` → resolve via sample ID mapping | Map frame → sample ID → `setModalSample()` via `fos.modalSelector` |

For a detailed technical walkthrough, see [PLUGIN_IMPLEMENTATION.md](PLUGIN_IMPLEMENTATION.md).

## Requirements

- FiftyOne >= 0.21.0
- Video dataset with frame-level data, or a dynamically grouped image dataset with plottable fields
