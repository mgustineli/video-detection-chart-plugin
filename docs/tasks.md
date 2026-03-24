# Temporal Detection Plugin — Tasks

**Status:** Complete — multi-chart panel with label timeline heatmap, add/remove/reorder, per-dataset persistence, all dynamic group view modes with full bidirectional sync

## Completed

### Design

- [x] Refactor plugin colors and typography to use VOODO design system
- [x] Update demo GIF and README to reflect new design
- [x] Send plugin repo and video recording to Porsche (Matthias)

### Field Selector

- [x] Add `GetTemporalFields` operator — discovers plottable frame-level fields (`FloatField`, `IntField`, `ListField`)
- [x] Add `GetFrameValues` operator — fetches per-frame values for any field, defaults to `detections.detections`
- [x] Keep `GetDetectionCounts` as legacy wrapper for backward compatibility
- [x] Add dropdown/selector UI (native `<select>` styled to VOODO) in JS panel toolbar
- [x] Dynamic Y-axis title and value label based on selected field

### Python-Only Panel (Frame Data Plot)

- [x] Implement `FrameDataPlot` panel using `FrameLoaderView` + `panel.plot()` (Plotly)
- [x] Plotly line chart with area fill and moving dot via `selectedpoints`
- [x] Field selector via `AutocompleteView` dropdown
- [x] VOODO dark theme matching the JS panel
- [x] Timeline sync (video → chart) via `FrameLoaderView` without `timeline_name`

### Reference Review

- [x] Study `FrameLoaderView` timeline sync pattern — used for Python panel
- [x] Research `@voxel51/label_count` plugin source (GitHub: `voxel51/fiftyone-plugins`)
- [x] Confirmed `@voxel51/frame_label_plots` only available on demo deployment

### Dynamic Group Support — Python Operators

- [x] Detect dynamic groups via `ctx.view._is_dynamic_groups` in `_get_fields` and `_get_frame_values`
- [x] Field discovery: `get_field_schema()` for groups vs `get_frame_field_schema()` for video
- [x] Data fetch: `get_dynamic_group(group_key)` via `_get_dynamic_group_key()` — resolves `GroupBy` stage field
- [x] Sequential frame numbers: `list(range(1, len(values) + 1))` for dynamic groups (no `frame_number` field)
- [x] Test with NuScenes `cam_front_video` view on Murilo deployment

### Dynamic Group Support — JS Panel (Pagination mode)

- [x] Read `fos.isDynamicGroup` and `fos.dynamicGroupCurrentElementIndex` for image→chart sync
- [x] Set `dynamicGroupCurrentElementIndex` via `useSetRecoilState` for chart→image seek
- [x] Skip redundant data reloads during intra-group navigation (`groupDataLoadedRef`)

### Bidirectional Sync for All Dynamic Group View Modes

- [x] Fix chart→video seek in "video" mode (ImaVid) — `drawFrameNoAnimation` directly on `ImaVidElement` via `lookerElement.children[0]`, matching FiftyOne's own `renderFrame` pattern
- [x] Fix chart→image seek in "pagination" mode — uses `setDynamicGroupIndex` via `fos.dynamicGroupCurrentElementIndex`
- [x] Fix chart→image seek in "carousel" mode — maps frame→sampleId, navigates via `fos.modalSelector`
- [x] Fix carousel→chart sync — watches `modalSampleId` changes, resolves to frame via `sampleIdToFrame` mapping
- [x] Add `sample_ids` to Python operator response for dynamic groups — enables carousel mode bidirectional sync
- [x] Add `dynamicGroupsViewMode` detection to distinguish carousel from pagination in JS
- [x] Ensure video→chart sync works in all modes
- [x] Clean up debug logging

### Multi-Chart Panel Support

- [x] Add `dataset_name` to `GetTemporalFields` operator response for localStorage key
- [x] Replace single-chart state model with `charts[]` array, `chartStatus{}` object, and `dataStoreRef` cache
- [x] Implement sequential load queue (`loadQueueRef`, `loadingFieldRef`, `processQueue()`) for single `dataExecutor`
- [x] Create `ChartCard` component with header (field label + move up/down/remove buttons) and loading/error/data states
- [x] Add "Add chart" toolbar dropdown showing fields not yet added
- [x] Wire up remove (filter from `charts`), move up/down (swap adjacent in `charts`)
- [x] Implement localStorage persistence per dataset — save on chart change, restore on field discovery
- [x] Handle sample change: clear data cache, preserve chart selections, re-queue all fields
- [x] Shared frame indicator and seek across all charts via `effectiveFrame` and `handleFrameSeek`
- [x] Scrollable container with `maxHeight` for 3+ charts
- [x] Status bar shows chart count instead of "frames with data"

### Label Timeline Chart (Swim Lane Heatmap)

- [x] Add `has_labels` flag to field discovery — query full schema, check for `.label` sub-field
- [x] Implement `_get_label_timeline()` helper — aggregates per-label counts server-side for both native video and dynamic groups
- [x] Add `mode` param to `GetFrameValues` operator — `count` (default) or `labels`
- [x] State model refactored to composite keys (`field:type`) for `dataStoreRef`, `chartStatus`, and load queue
- [x] localStorage format updated to `[{field, type}]` with migration from old string-array format
- [x] `LabelTimelineChart` component — SVG heatmap with color-coded rows per label, opacity-scaled cells
- [x] Frame binning when `plotWidth / totalFrames < 2px` — max count per bin
- [x] Click/drag seeking adapted from SVGChart pattern
- [x] Hover tooltip with portal rendering (`ReactDOM.createPortal`) — overlays other charts
- [x] Top-N filtering (15 labels) with "Show N more…" expander
- [x] `ChartCard` dispatches between `LabelTimelineChart` and `SVGChart` based on `chartType` prop
- [x] Add chart dropdown shows dual entries (labels/count) for label-capable fields
- [x] Default chart prefers `type: "labels"` for first label-capable field
- [x] Panel uses flex layout to fill available space

### Rename

- [x] Repo renamed from `video-detection-chart-plugin` to `temporal-detection-plugin`
- [x] Plugin name: `video-detection-chart` → `temporal-detection`
- [x] Panel name: `Detection Count Plot (Interactive)` → `Temporal Data Explorer`
- [x] Updated operator paths, localStorage prefix, log prefixes, README, and gif

## In Progress

## Backlog

- [ ] Rename local folder from `video-detection-chart-plugin` to `temporal-detection-plugin` (run `mv ~/github/video-detection-chart-plugin ~/github/temporal-detection-plugin`)
- [ ] Send Python-only panel example to Porsche with interactivity trade-off explanation
- [ ] Split Python panel into its own repo — it's a reference example, not part of the production JS plugin
- [ ] Migrate JS dropdown from native `<select>` to VOODO `Select` component (requires build step)
- [ ] Explore support for non-frame-level temporal data (higher-frequency sensor data — Eric's scope)
- [ ] Investigate image loading latency for dynamic group frame navigation (GCS fetch per frame)

## Key Files

- `index.umd.js` — JS panel: multi-chart SVG system with label timeline heatmap, line charts, bidirectional video sync, localStorage persistence
- `__init__.py` — Python operators (field discovery with `has_labels`, count/label timeline data) + `FrameDataPlot` panel (disabled, reference example only)
- `fiftyone.yml` — Plugin manifest (1 panel, 3 operators)

## Architecture Notes

- This plugin targets **native video datasets** AND **dynamically grouped image datasets**
- Dynamic groups have three navigation modes: pagination (images), carousel (filmstrip), video (ImaVid playback)
- The Python panel (`FrameDataPlot`) is a reference example — should be split into a separate repo
- The JS panel is the production version with full bidirectional sync
- Key Recoil atoms for dynamic groups: `isDynamicGroup`, `dynamicGroupCurrentElementIndex`, `dynamicGroupsViewMode`, `shouldRenderImaVidLooker`, `imaVidLookerState`
- Reference: [FiftyOne dynamic grouping docs](https://docs.voxel51.com/user_guide/app.html#grouping-samples)
