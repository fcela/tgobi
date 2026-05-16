# Post-GGobi Roadmap: Feature Status and Next Steps

A survey of advances in interactive high-dimensional data visualization since the
GGobi era (2003--2007), with implementation status and remaining work.

---

## Survey of Advances

### 1. Steerable Tours with Geodesic Scrubbing (dtour, 2026)

**Paper**: Lekschas & Abdennur, "dtour: a steerable tour de vis through
high-dimensional data," arXiv:2605.04306, 2026.

**Key innovations**:

- **Keyframe gallery**: static projection previews surrounding the central
scatter, giving an overview before committing to a path.
- **Reversible scrubbing**: a circular slider for arc-length-parameterized
traversal along continuous geodesic projection paths.
- **Catmull-Rom spline interpolation** with Gram-Schmidt re-orthonormalization:
$C^1$-continuous, avoids velocity discontinuities.
- **Arc-length parameterization**: precomputed cumulative arc-length table with
$O(\log n)$ binary search at runtime.
- **Geodesic distance**: measured via principal angles from the SVD of
$\mathbf{F}_a^\top \mathbf{F}_z$.
- **Manual tour with dimension-axis handles**: draggable handles encode each
dimension's current contribution.
- **Sequential embedding tours**: compare DR methods by interpolating between
aligned 2D embeddings.
- **GPU-accelerated rendering**: WebGPU/WebGL with OffscreenCanvas.

**Status in tgobi**: Partially implemented.

- ✅ Catmull-Rom spline interpolation with Gram-Schmidt re-orthonormalization
- ✅ Arc-length parameterization with $O(\log n)$ binary search
- ✅ Geodesic distance via principal angles
- ✅ Keyframe gallery with thumbnails
- ✅ Reversible scrubber slider
- ✅ Manual tour with variable contribution slider
- ✅ DR comparison (Procrustes-aligned keyframe tour)
- ✅ PP score trace sparkline
- ❌ Static projection previews in the gallery
- ❌ Attraction-repulsion spectrum tour
- ❌ GPU-accelerated rendering (WebGL, not WebGPU)

**References**: Lekschas & Abdennur 2026, Buja et al. 2005, Cook & Buja 1997.

---

### 2. Concentric Coordinates (2025)

**Paper**: Williams & Kovalerchuk, "High-Dimensional Data Classification in
Concentric Coordinates," arXiv:2507.18450, 2025.

**Status in tgobi**: ✅ Implemented.

- Concentric coordinates plot type with canvas rendering
- Axes as concentric circles
- Linked brushing and painting
- Available in AddPlotMenu

**References**: Williams & Kovalerchuk 2025.

---

### 3. Scagnostics --- Scatter Plot Diagnostics (2004--2022)

**Foundational paper**: Wilkinson, Anand, & Grossman, "Graph-theoretic
scagnostics," Proc. IEEE InfoVis 2005.

**Recent work**: Wanniarachchi & Talagala, "scatteR: Generating instance space
based on scagnostics," arXiv:2209.06682, 2022.

**Status in tgobi**: ✅ Implemented.

- Nine scagnostic measures computed from Delaunay triangulation
- Sort and filter by measure
- Scatmat highlighting by threshold
- Scagnostics panel in right sidebar

**Remaining work**:

- ❌ Move computation to a web worker
- ❌ Reorder scatmat cells by selected measure
- ❌ "Open top pair" / "Make tour seed" actions
- ❌ Stability estimates through subsampling

**References**: Wilkinson, Anand, & Grossman 2005, Wanniarachchi & Talagala 2022.

---

### 4. Mapper / TDA Visualization (2020)

**Paper**: Zhou, Chalapathi, Rathore, Zhao, & Wang, "Mapper Interactive: A
Scalable, Extendable, and Interactive Toolbox for the Visual Exploration of
High-Dimensional Data," arXiv:2011.03209, 2020.

**Status in tgobi**: ✅ Implemented (basic).

- Mapper panel in right sidebar
- Variable, PCA1, PCA2, residual, eccentricity, and density lenses
- SVG node-link graph with force-directed layout
- Linked selection (click node → select rows)
- Adjustable intervals, overlap, cluster count
- Node detail view: connection summary, variable statistics (mean, sd, min, max)

**Remaining work**:

- ✅ Full plot-panel Mapper view (zoom, pan, hover, linked selection)
- ✅ Additional lens choices (PCA1, PCA2, residual, density, eccentricity)
- ✅ Node detail views (overlap rows, variable summaries)
- ❌ Clustering choices inside intervals
- ✅ Parameter sweep and graph stability (5x5 interval×overlap heatmap with nodes/edges/components/avg degree/modularity)

**References**: Zhou et al. 2020, Singh, Mémoli, & Carlsson 2007.

---

### 5. Andrews Curves / Plots

**Foundational paper**: Andrews, "Plots of high-dimensional data,"
Biometrics, 1972.

**Status in tgobi**: ✅ Implemented.

- Andrews curves plot type with canvas rendering
- Linked brushing and painting
- Available in AddPlotMenu

**References**: Andrews 1972.

---

### 6. Langevin Dynamics Tours (2023)

**Paper**: Harrison, "Langevitour: smooth interactive touring of high
dimensions," The R Journal, 2023.

**Status in tgobi**: ✅ Implemented.

- Langevin tour mode with step and diffusion controls
- Stochastic perturbations in the tangent plane
- Gram-Schmidt retraction to Stiefel manifold
- Available as a tour mode option

**Remaining work**:

- ❌ Clearer UI labeling of stochastic vs. constrained components
- ❌ Smoother dynamics (current implementation is simplified relative to the
  R Journal method)

**References**: Harrison 2023.

---

### 7. GPU-Accelerated Rendering at Scale

**Papers**: regl-scatterplot (Lekschas 2023), Jupyter Scatter (Lekschas &
Manz 2024).

**Status in tgobi**: Partially implemented.

- ✅ WebGL scatter rendering via regl
- ✅ 2D rendering handles tens of thousands of points smoothly
- ❌ Level-of-detail rendering for >100K points
- ❌ WebGPU compute shaders
- ❌ OffscreenCanvas for worker-based rendering

---

### 8. Conditional Parallel Coordinates

**Status in tgobi**: ✅ Implemented.

- Conditional faceting by a categorical variable
- One mini-parallel-coords per category level
- Vertical stack with shared axis scales

**References**: Standard multivariate visualization technique (cf. trellis
displays, Becker & Cleveland 1996).

---

### 9. DR Validation via Sequential Embedding Tours

**Status in tgobi**: ✅ Implemented (basic).

- DR comparison computes multiple embeddings
- Procrustes alignment and keyframe tour
- Guided tour interpolation between aligned layouts

**Known issues**:

- The current approach fits nonlinear embeddings back into a linear tour basis
  (`embeddingToBasis`), which is conceptually fragile for t-SNE/UMAP.
- A safer design would compare aligned 2D layouts directly and label the
  animation as a display-space morph, not a linear basis tour.

**References**: Lekschas & Abdennur 2026, Section 2.3; Nagy et al. 2020,
"Casting Multiple Shadows," arXiv:2012.06077.

---

## Feature Status Summary

| Feature | Status | Notes |
|---------|--------|-------|
| F1. Steerable Tour | ✅ Partial | Keyframes, scrubber, Catmull-Rom, manual tour done; projection previews and spectrum tour remain |
| F2. Scagnostics | ✅ Done | Nine measures, sort/filter, scatmat highlighting |
| F3. Concentric Coords | ✅ Done | Canvas rendering, linked brushing |
| F4. Andrews Curves | ✅ Done | Canvas rendering, linked brushing |
| F5. Mapper Graph | ✅ Done | Sidebar TDA view + first-class plot type with zoom/pan/hover |
| F6. Langevin Tour | ✅ Done | Step/diffusion controls, stochastic perturbation |
| F7. Conditional Parcoords | ✅ Done | Categorical faceting |
| F8. DR Validation Tours | ✅ Basic | Procrustes-aligned keyframe tour; basis fitting needs redesign |
| F9. WebGPU Compute | ❌ Future | Depends on browser adoption |
| F10. 3D Tour | ❌ Parked | 3D scatter exists but tour integration disabled; camera conflict unresolved |

## Additional Features Implemented (Beyond Original Proposals)

- **1D tour on dotplots**: Projects onto a 1D strip chart. Now fixed to
  retarget `activePanelId` when switching tour shape.
- **Projection pursuit**: Holes, central mass, LDA, PCA variance, kurtosis
  indices with real-time score display and score trace sparkline.
- **LDA class source**: Supports both brushed groups and categorical variables.
- **Clustering**: K-means, hierarchical, DBSCAN, OPTICS, X-Means with
  interactive dendrogram cut.
- **Classification**: KNN, Gaussian NB, Random Forest with decision boundary
  overlay and misclassification marking.
- **Projection Explorer**: PCA, MDS, ICA, t-SNE, UMAP with loadings and
  permutation importance.
- **DR quality metrics**: Trustworthiness and continuity (Venna & Kaski
  2006) with Shepard diagram, computed automatically after every
  projection run.
- **Educational HelpPopovers**: Every panel and toolbar now has `?` buttons
  with what/why/how explanations and misconception warnings.
- **Data export**: CSV export with paint and cluster columns.
- **Keyboard shortcuts**: B/I/T/E/R/Space/Esc/? for common actions.

---

## Next Priorities

1. **Redesign DR comparison** as explicit embedding morphs, not fitted tour bases ✅
2. **Build tour diagnostics panel**: basis coefficients, variable contribution history, PP score trend, frozen variables, coverage metrics ✅
3. **Add guided lessons**: flea (brushing/tours), olive (LDA/classification), missing (imputation/uncertainty), synthetic (scagnostics/clustering) ✅
4. **Workerize expensive computations**: scagnostics ✅, projection ✅, Mapper (pending)
5. **Promote Mapper to a first-class plot type** ✅
6. **Add clustering/classification diagnostics**: k-distance, silhouette, confusion matrix, train/test split ✅
7. **Add misconception warnings**: t-SNE distances, PP local optima, extrapolation, multiple comparisons ✅
8. **Additional lens choices for Mapper** (PCA, residual, probability)
9. **Parameter sweep and graph stability for Mapper**
10. **Node detail views for Mapper** (overlap rows, variable summaries)
