# tgobi

Interactive high-dimensional data visualization in the browser, inspired by
[GGobi](https://ggobi.org/). Explore data through linked plots, animated tours,
clustering, classification, and dimensionality reduction --- all without leaving
your browser.

![tgobi: linked brushing, grand tour, parallel coordinates, and barcharts](docs/screenshots/tour-parcoords-barchart-selection.png)

## Install

```bash
npm install -g tgobi
```

Use a local install when tgobi is part of a project:

```bash
npm install tgobi
npm exec tgobi
```

`npm install tgobi` puts the executable at `node_modules/.bin/tgobi` for that
project. It does not make `tgobi` available as a bare shell command unless that
directory is on your `PATH`. These are equivalent ways to run a local install:

```bash
npm exec tgobi
npx tgobi
./node_modules/.bin/tgobi
```

Use a global install when you want `tgobi` available directly from your shell:

```bash
npm install -g tgobi
tgobi
```

## Command Line

The CLI serves the built standalone app and opens it in your browser:

```bash
tgobi
tgobi --port 8787
tgobi --host 0.0.0.0 --no-open
```

From this repository, build first and run the source checkout directly:

```bash
npm run build
node bin/tgobi.js --no-open
```

## Screenshots

Load data from disk or start with a bundled sample:

![tgobi file and sample loader](docs/screenshots/start-screen.png)

Open the variables panel and add linked plots:

![tgobi flea sample workspace](docs/screenshots/flea-workspace.png)

Brush in one plot to highlight the same rows in every linked view, color by a
categorical variable, and run a grand tour from the tour panel:

![tgobi linked brushing and tour](docs/screenshots/linked-brush-and-tour.png)

Combine multiple plot types like parallel coordinates and barcharts to explore
complex relationships across dimensions. Selections are instantly linked across
all views, allowing you to highlight subsets in a categorical barchart and
immediately observe their structural distribution in a 2D grand tour or
high-dimensional parallel coordinates projection:

![tgobi multi-plot analysis with tour, parallel coordinates, and barcharts](docs/screenshots/tour-parcoords-barchart-selection.png)

## Working With Data

tgobi accepts CSV, TSV, JSON, and GGobi-style XML files from the start screen.
After loading a file, the schema preview lets you confirm inferred column types
before committing the dataset.

The bundled samples are useful for quick checks:

- **flea**: small categorical dataset for brushing, color, and tour examples.
- **olive**: regional olive oil measurements.
- **places**: mixed geographic and numeric data.
- **cycle**: XML sample for GGobi import coverage.
- **large**: synthetic large dataset for performance testing.

## Using The App

### Plots

Add plots with **+ Plot**. Supported plot types:

| Type | Description |
|------|-------------|
| Scatterplot | Two numeric variables, x-y |
| Scatterplot matrix | 2-8 numeric variables, all pairwise scatterplots |
| Parallel coordinates | 2+ numeric variables, linked axes |
| Dotplot | Single numeric variable, 1D strip |
| Barchart | Single variable (categorical or numeric), frequency counts |
| Time series | Numeric x-axis, one or more y variables with optional grouping |
| Missing pattern | Overview of missingness across all variables |

Multiple plots are linked: selecting, painting, or hovering in one plot
highlights the same rows in every other plot.

### Brushing and Painting

Use the brush toolbar to select rows:

- **Transient**: selection disappears when you release the mouse.
- **Persistent**: each brush stroke paints a group with a distinct color (paint
  groups 1-8).

The selection toolbar offers:
- **Exclude/Include**: hide or restore ghosted (shadowed) rows.
- **Invert**: flip selection.
- **Isolate**: keep only selected rows visible.
- **Restore**: bring all rows back.

### Coloring

The color toolbar controls how points are colored:

- **Fixed**: all points in one color.
- **Paint**: color by painted group (persistent brushing).
- **By variable**: color by a data column. Categorical variables pair well with
  `tableau10`; numeric variables support sequential or diverging scales.

### Identify Tool

Switch to the **Identify** tool to hover over points and see their row label.
Click to pin a label; click again to unpin. Set the label variable in the
identify toolbar.

### Edges

Load an edges layer (e.g. a graph or path) alongside your data. Edge visibility,
alpha, and color mode are configurable. You can also draw sequential edges that
connect rows in dataset order.

### Hulls

Toggle convex hulls per paint group or color group to visually enclose clusters
in scatterplots.

---

## Right Sidebar Tabs

The right sidebar has four tabs: **Tour**, **Project**, **Cluster**, and
**Classify**.

### Tour Tab

Animate projections through high-dimensional space. Requires a scatterplot (2D
tour) or dotplot (1D tour) to be open.

**Shape**:
- **2D (scatter)**: rotates a 2D projection plane through p-dimensional space.
- **1D (dotplot)**: rotates a 1D projection direction.

**Modes**:

| Mode | Description |
|------|-------------|
| Grand | Randomly walks through all projection planes. Good for overview. |
| Projection pursuit | Steers the tour toward projections that optimize an index. |
| Manual | Fixes all variables except one, letting you scrub that variable's contribution with a slider. |

**Projection pursuit goals**:

| Goal | Optimizes | When to use |
|------|-----------|-------------|
| Holes | 1 - central density | Finding projections with hollow structure (clusters on the rim) |
| Central mass | Central density | Finding projections with dense centers |
| LDA | Between-class / within-class variance | Requires 2+ painted groups; finds projections that separate groups |
| PCA variance | Total variance in projection | Finds projections that spread data out most |
| Kurtosis | Absolute excess kurtosis | Finding heavy-tailed or multi-modal structure |

The variable circle shows each variable's current contribution as a point on a
unit circle. Frozen variables hold their direction while others rotate.

**Saved views**: click **Save** to bookmark the current projection. Click a
saved view to restore it.

### Project Tab

Compute a static low-dimensional embedding and add it to the dataset as new
columns.

**Methods**:

| Method | Type | Output | Loadings |
|--------|------|--------|----------|
| PCA | Linear | Orthogonal components maximizing variance | Yes (eigenvectors) |
| MDS | Distance-based | Preserves pairwise distances | Permutation importance |
| ICA | Linear | Statistically independent components | Yes (mixing matrix) |
| t-SNE | Nonlinear | Preserves local neighborhoods | Permutation importance |
| UMAP | Nonlinear | Preserves local+global structure | Permutation importance |

**Controls**:
- **Method**: choose the algorithm.
- **Dims**: number of output dimensions (2+).
- **Variables**: check which numeric columns to include.
- Method-specific parameters (perplexity/iterations for t-SNE, neighbors/min
  dist for UMAP).

**After computing**:
- **X / Y**: pick which dimensions to plot.
- **Add to data**: materializes the embedding as new columns (e.g. `PCA.1`,
  `PCA.2`) and opens a scatterplot.
- **Clear**: resets the projection.

**Component information**:

For PCA and ICA, the panel displays a **loadings table** showing how much each
original variable contributes to each component. Headers are labeled `PC1`,
`PC2`, ... (PCA) or `IC1`, `IC2`, ... (ICA). Values with |loading| > 0.5 are
highlighted. A cumulative variance row (`Cum %`) shows running explained
variance for PCA.

For MDS, t-SNE, and UMAP, a **variable importance** table ranks variables by
how much the embedding changes when that variable is permuted (permutation
importance, 3 repetitions). This identifies which variables most influence the
nonlinear structure.

See [Methods Guide](docs/methods.md) for the mathematical details.

### Cluster Tab

Assign cluster labels to rows and paint them with distinct colors.

**Methods**:

| Method | Type | Key parameter | When to use |
|--------|------|---------------|-------------|
| K-Means | Fixed k | k | Known number of clusters, spherical clusters |
| Hierarchical | Fixed k | k, linkage | Small datasets, dendrogram-style |
| DBSCAN | Density-based | eps, minPts | Arbitrary shapes, noise detection |
| OPTICS | Density-based | eps, minPts, xi | Variable-density clusters |
| X-Means | Auto k | kMax | Unknown number of clusters (uses BIC) |

**Workflow**:
1. Check the numeric variables to cluster on.
2. Set method and parameters.
3. Click **Compute**.
4. Click **Paint** to color rows by cluster assignment.

**Linkage options** (hierarchical): complete, single, average.

X-Means iterates k = 1..kMax and picks the best k by Bayesian Information
Criterion. OPTICS extracts clusters using the xi steepness parameter.

### Classify Tab

Build a classifier from painted groups and visualize decision boundaries.

**Methods**:

| Method | Key parameter | Description |
|--------|---------------|-------------|
| KNN | k | k-nearest neighbors |
| Naive Bayes | - | Gaussian naive Bayes |
| Random Forest | trees, max depth | Ensemble of decision trees |

**Workflow**:
1. Brush 2+ groups of points (persistent mode) --- these are the training
   classes.
2. Check 2 numeric variables as classification features.
3. Set grid resolution (controls boundary detail).
4. Click **Classify** to train the model.
5. Click **Apply** to overlay a grid of predicted boundary points (ghosted,
   colored by predicted class).

The decision boundary grid is added as shadow rows so they don't affect
downstream analysis.

---

## Methods Guide

See [docs/methods.md](docs/methods.md) for the mathematical foundations of each
algorithm, key equations, and implementation notes.

## Embed In React

```tsx
import { Tgobi } from "tgobi";
import "tgobi/styles.css";

export function MyPage() {
  return (
    <div style={{ height: "100vh" }}>
      <Tgobi />
    </div>
  );
}
```

You can pass a `DataFrame`-compatible object as `data`:

```tsx
<Tgobi data={myDataFrame} />
```
