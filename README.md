# Room to Grow

County-level view of North Carolina's housing gap, building pace and local options. Built by Ezra Zhang for the Carolina Across 100 student fellowship (ncIMPACT Initiative, UNC School of Government), November 2026.

Plain static site. No build step, no backend.

- `index.html`, `styles.css`, `app.js`: the page
- `geo.js`: county outlines, pre-projected
- `d3.min.js`: d3 v7.9.0
- `data/`: the three JSON files the page reads
- `source/`: the inputs and `build.py`, which merges them into `data/`

To view locally: `python3 -m http.server` in this folder, then open http://localhost:8000.

To publish on GitHub Pages: Settings, Pages, deploy from branch `main`, folder `/ (root)`.

To update the data: replace the files in `source/`, run `python3 source/build.py`, and copy the output into `data/`.
