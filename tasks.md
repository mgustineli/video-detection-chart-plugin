# Video Detection Chart Plugin — Tasks

**Status:** In progress — VOODO design complete, field selector and grouped dataset support next

## Completed

### Design

- [x] Refactor plugin colors and typography to use VOODO design system
- [x] Update demo GIF and README to reflect new design
- [x] Send plugin repo and video recording to Porsche (Matthias)

## In Progress

### Field Selector

- [ ] Add a dropdown/selector UI for choosing which temporal field to plot
- [ ] Discover compatible frame-level fields dynamically (`FloatField`, `IntField`, `ListField`)
- [ ] Support persisting the selected field(s) across panel reloads
- [ ] Support multiple plots (multiple fields visualized simultaneously)

### Dynamic Group Support

- [ ] Support dynamically grouped image datasets (e.g., NuScenes)
- [ ] Handle `ctx.view._is_dynamic_groups` branch for fetching frame data
- [ ] Use `get_dynamic_group(sample_id)` instead of `select()` for grouped views

## Backlog

### Reference Review

- [ ] Review `@voxel51/frame_label_plots` plugin source (demo deployment only)
- [ ] Study `FrameLoaderView` timeline sync pattern as alternative to JS `subscribeToState`
- [ ] Send Python-only example to Porsche with interactivity trade-off explanation

### Future

- [ ] Explore support for non-frame-level temporal data (higher-frequency sensor data — Eric's scope)

## Key Files

- `index.umd.js` — JS panel: SVG chart with bidirectional video sync
- `__init__.py` — Python operator: `GetDetectionCounts` fetches per-frame data
- `fiftyone.yml` — Plugin manifest
