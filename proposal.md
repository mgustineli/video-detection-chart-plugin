# Video Detection Chart Plugin — Implementation Proposal

## Context

This plugin renders an interactive SVG line chart of per-frame detection counts in the FiftyOne modal view, with bidirectional video sync. Following a sync with Eric Hofesmann, three areas of improvement were identified: design (done), field selection, and dynamic group compatibility.

## Current Architecture

- **JS panel** (`index.umd.js`): Hand-written UMD — renders SVG chart, subscribes to video state via `modalLooker.subscribeToState()`, seeks video via `modalLooker.getVideo()` + `modalLooker.updater()`
- **Python operator** (`__init__.py`): `GetDetectionCounts` — fetches `frames.detections.detections` counts for a single sample using `dataset.select(sample_id).values()`

## Feature 1: Field Selector

### Goal

Let users choose which temporal field(s) to plot instead of hardcoding `frames.detections.detections`.

### Approach

**Python side** — add a new operator `get_temporal_fields` that discovers plottable fields:

```python
# For regular video datasets
schema = ctx.view.get_frame_field_schema(
    flat=True, ftype=(fo.FloatField, fo.IntField, fo.ListField)
)

# For dynamic groups
schema = ctx.view.get_field_schema(
    flat=True, ftype=(fo.FloatField, fo.IntField, fo.ListField)
)
```

For `ListField` types (like `detections`), plot `F(expr).length()` (count of items). For scalar fields (`FloatField`, `IntField`), plot the value directly.

Generalize `GetDetectionCounts` → `GetFrameValues` that accepts a `field` parameter:

```python
def execute(self, ctx):
    field_path = ctx.params.get("field", "detections.detections")
    field = ctx.view.get_field("frames." + field_path)

    if isinstance(field, fo.ListField):
        expr = F("frames[]." + field_path).length()
    else:
        expr = "frames[]." + field_path

    view = fov.make_optimized_select_view(ctx.view, [sample_id])
    frame_numbers, values = view.values(["frames[].frame_number", expr])
```

**JS side** — add a field selector dropdown above the chart:

1. On panel mount, call `get_temporal_fields` to populate dropdown options
2. Store selected field in component state
3. On field change, call `get_frame_values` with the new field
4. For multiple plots, allow selecting multiple fields and render stacked SVG charts or overlaid lines with a legend

### Persistence

Use `ctx.panel.state` to persist the selected field(s) so they survive panel close/reopen within the same session.

### UI Options

Two approaches for the dropdown:

1. **Native HTML `<select>`** — simplest, works in UMD with no dependencies, basic styling
2. **VOODO `Select` component** — requires importing from `@voxel51/voodo` package; provides typeahead filtering, multi-select, and on-brand styling. The `Select` component accepts:
   - `options`: `Descriptor<{label: string}>[]`
   - `exclusive`: `boolean` (single vs multi-select)
   - `onChange`: `(value: string | string[]) => void`

**Recommendation**: Start with a native `<select>` styled to match VOODO colors for v1. Migrate to the VOODO `Select` component later if the plugin moves to a build step.

## Feature 2: Dynamic Group Support

### Goal

Support dynamically grouped image datasets (e.g., NuScenes scenes rendered as "videos" via ImaVid) in addition to native video datasets.

### Approach

The `@voxel51/label_count` plugin demonstrates the pattern:

```python
def _get_values(ctx, path):
    if ctx.view._is_dynamic_groups:
        # Grouped dataset — each "frame" is actually a separate sample in the group
        sample_id = ctx.view._base_view[ctx.current_sample].sample_id
        view = ctx.view.get_dynamic_group(sample_id)
        # Fields are top-level (not under frames[])
        return view.values(["frame_number", expr])
    else:
        # Native video — fields are under frames[]
        sample_id = ctx.current_sample
        view = fov.make_optimized_select_view(ctx.view, [sample_id])
        return view.values(["frames[].frame_number", expr])
```

Key differences:
| | Native Video | Dynamic Groups |
|---|---|---|
| Frame data access | `frames[].field` | `field` (top-level) |
| Schema discovery | `get_frame_field_schema()` | `get_field_schema()` |
| View construction | `select(sample_id)` | `get_dynamic_group(sample_id)` |
| Sample ID | `ctx.current_sample` | `ctx.view._base_view[ctx.current_sample].sample_id` |

### JS Side

The JS panel already handles ImaVid via `useVideoState()` which reads `fos.shouldRenderImaVidLooker` and `fos.imaVidLookerState`. No JS changes needed for dynamic group support — only the Python operator needs branching.

## Implementation Order

1. **Field selector** (Python operator + JS dropdown) — highest user impact
2. **Dynamic group support** (Python operator branching) — required for NuScenes-style datasets
3. **Multiple plots** (JS rendering of overlaid/stacked charts) — nice-to-have, builds on field selector

## Reference Plugins

- `@voxel51/label_count` — Python-only panel using `FrameLoaderView` + `panel.plot()` (Plotly bar chart). Source: `voxel51/fiftyone-plugins/plugins/label_count/`. Shows field discovery, dynamic group support, and timeline sync via `FrameLoaderView`.
- `@voxel51/frame_label_plots` — available on demo deployment only. Eric to provide download access.
- Eric's table panel plugin — reference for field selector UX pattern.

## Trade-offs: JS Panel vs Python Panel

| | JS Panel (current) | Python Panel (`FrameLoaderView`) |
|---|---|---|
| Timeline sync | `subscribeToState` — real-time, no latency | `FrameLoaderView` — buffered, slight latency |
| Chart rendering | Custom SVG — full control, lightweight | Plotly via `panel.plot()` — feature-rich, heavier |
| Click-to-seek | Direct `modalLooker.getVideo().currentTime` | Not natively supported |
| Build step | None (hand-written UMD) | None (Python only) |
| Complexity | Higher (manual SVG + event handling) | Lower (declarative Plotly) |

**Decision**: Keep the JS panel approach for bidirectional sync (the plugin's core value proposition). Use Python operator improvements for field discovery and data fetching.
