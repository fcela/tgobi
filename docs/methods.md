# Methods Guide

Mathematical foundations and implementation notes for tgobi's analysis
algorithms.

---

## Tour

The grand tour [Asimov 1985] animates a sequence of 2D (or 1D) projections of $p$-dimensional
data, interpolating between random projection planes to reveal structure that
individual fixed projections miss [Buja et al. 2005].

### Projection plane

Given $p$-dimensional centered data $\mathbf{X}$ ($n \times p$), a 2D projection
is defined by a $p \times 2$ basis matrix $\mathbf{B}$ where the columns are
orthonormal:

$$\mathbf{Y} = \mathbf{X}\mathbf{B} \qquad (n \times 2 \text{ projection})$$

The 1D tour uses a $p \times 1$ unit vector $\mathbf{b}$ instead.

### Interpolation

The tour interpolates between consecutive planes $\mathbf{B}_\text{old}$ and
$\mathbf{B}_\text{new}$ using Givens rotations [Asimov 1985, Buja et al. 2005]. The path from old to new goes
through the shared principal angles, producing a smooth rotation rather than a
linear interpolation in projection space. This avoids projection artifacts.

### Projection pursuit

Instead of randomly choosing the next plane, projection pursuit [Cook et al. 1993, Cook et al. 1995] steers the tour
toward planes that maximize (or minimize) an index function $f(\mathbf{B})$:

**Holes index** [Cook et al. 1993]: seeks projections with hollow structure.

$$f_\text{holes}(\mathbf{B}) = 1 - \frac{1}{n}\sum_{i=1}^{n} \exp\!\left(-\tfrac{1}{2}\|\mathbf{z}_i\|^2\right)$$

where $\mathbf{z}_i$ are the standardized projected points. Low central density
means the data is concentrated away from the center --- clusters on the rim.

**Central mass index** [Cook et al. 1995]: the complement, for finding dense centers.

$$f_\text{cm}(\mathbf{B}) = \frac{1}{n}\sum_{i=1}^{n} \exp\!\left(-\tfrac{1}{2}\|\mathbf{z}_i\|^2\right)$$

**LDA index** [Cook et al. 1995]: maximizes between-class separation relative to within-class
scatter.

$$f_\text{lda}(\mathbf{B}) = \frac{\operatorname{tr}(\mathbf{B}^T \mathbf{S}_B \mathbf{B})}{\operatorname{tr}(\mathbf{B}^T \mathbf{S}_W \mathbf{B})}$$

where $\mathbf{S}_B$ is the between-class scatter matrix and $\mathbf{S}_W$ is
the within-class scatter matrix. Requires painted groups (2+ colors).

**PCA index**: maximizes total projected variance.

$$f_\text{pca}(\mathbf{B}) = \operatorname{tr}(\mathbf{B}^T \mathbf{S}\,\mathbf{B})$$

where $\mathbf{S}$ is the sample covariance matrix.

**Kurtosis index**: maximizes absolute excess kurtosis of radial distances.

$$f_\text{kurt}(\mathbf{B}) = \left|m_4 - d(d+2)\right|$$

where $m_4$ is the fourth moment of squared Mahalanobis distances, and $d$ is
the projection dimension. Multi-modal or heavy-tailed structure has high
kurtosis.

### Manual tour

Fixes all variables except one. The contribution of the selected variable is
controlled by a slider from 0 (excluded) to 1 (fully contributing). The basis
is re-orthogonalized after adjustment so it remains valid.

---

## Projection (Dimensionality Reduction)

### PCA --- Principal Component Analysis

PCA [Jolliffe 2002] finds orthogonal directions that sequentially maximize variance.

**Centering**: subtract the column means.

$$\mathbf{x}_c = \mathbf{x} - \bar{\mathbf{x}}$$

**Covariance matrix**: $p \times p$ symmetric matrix.

$$\mathbf{S} = \frac{1}{n-1}\mathbf{X}_c^T \mathbf{X}_c$$

**Eigendecomposition** (Jacobi rotation method [Jolliffe 2002]):

$$\mathbf{S} = \mathbf{V}\boldsymbol{\Lambda}\mathbf{V}^T$$

The eigenvectors (columns of $\mathbf{V}$) are the loadings. Eigenvalues on the
diagonal of $\boldsymbol{\Lambda}$ give the variance along each component.

**Projection**: the $k$ leading eigenvectors form the basis:

$$\mathbf{Y} = \mathbf{X}_c \mathbf{V}_k \qquad (n \times k \text{ embedding})$$

**Explained variance ratio**: for component $j$:

$$\frac{\lambda_j}{\sum_{i=1}^{p} \lambda_i}$$

**Loadings table**: the $p \times k$ matrix $\mathbf{V}_k$ shows how each
original variable contributes to each component. Values near $\pm 1$ indicate
strong contribution.

**Variable importance**: for variable $v$, the importance across $k$ components
is:

$$\text{imp}_v = \sum_{j=1}^{k} l_{vj}^2 \cdot \frac{\lambda_j}{\sum_i \lambda_i}$$

normalized so the maximum is 1. This weights each loading by the component's
share of total variance.

### MDS --- Multidimensional Scaling

Classical (metric) MDS [Borg & Groenen 2005] finds a low-dimensional embedding that preserves pairwise
distances from the original space.

**Distance matrix**: Euclidean distances in the original $p$-dimensional space.

$$d_{ij} = \sqrt{\sum_{c=1}^{p}(x_{ic} - x_{jc})^2}$$

**Double centering** [Borg & Groenen 2005]: converts squared distances to a Gram matrix.

$$b_{ij} = -\frac{1}{2}\left(d_{ij}^2 - \bar{d}_{i\cdot}^2 - \bar{d}_{\cdot j}^2 + \bar{d}_{\cdot\cdot}^2\right)$$

where $\bar{d}_{i\cdot}^2$ is the row mean of squared distances and
$\bar{d}_{\cdot\cdot}^2$ is the grand mean.

**Eigendecomposition** of $\mathbf{B}$: the $k$ largest positive eigenvalues
and their eigenvectors give the embedding:

$$y_{ij} = v_{ij}\sqrt{\lambda_j}$$

**Normalized stress**: measures how well the embedding preserves distances.

$$\text{stress} = \sqrt{\frac{\sum_{i<j}(d_{ij}^\text{emb} - d_{ij}^\text{orig})^2}{\sum_{i<j}(d_{ij}^\text{orig})^2}}$$

A stress below 0.1 is generally considered a good fit [Kruskal 1964].

**Subsampling**: for $n > 2000$, the algorithm subsamples to 2000 rows because
the distance matrix is $O(n^2)$ in memory.

**Variable importance** (permutation-based): for each variable, permute its
values across rows, recompute MDS, and measure the shift:

$$\text{imp}_v = \frac{1}{k}\sum_{c=1}^{k}\left(1 - r_c^2\right)$$

where $r_c$ is the Pearson correlation between the original and permuted
embedding along component $c$. Averaged over 3 permutations, normalized to
$[0, 1]$.

### ICA --- Independent Component Analysis

ICA finds components that are statistically independent (not just uncorrelated
as in PCA). Uses FastICA [Hyvärinen 1999] with kurtosis contrast.

**Preprocessing**: center, then whiten using PCA (project onto eigenvectors,
scale by $1/\sqrt{\lambda_j}$).

**Whitened data**:

$$\mathbf{Z} = \mathbf{X}_c \mathbf{V}_k \mathbf{D}_k^{-1/2}$$

where $\mathbf{D}_k$ is the diagonal matrix of the $k$ leading eigenvalues.

**FastICA** [Hyvärinen 1999]: iteratively estimates the unmixing matrix $\mathbf{W}$ ($k \times k$)
one row at a time using the kurtosis contrast function $g(u) = u^3$:

$$\mathbf{w}_\text{new} = E\{\mathbf{Z}\,g(\mathbf{w}^T\mathbf{Z})\} - E\{g'(\mathbf{w}^T\mathbf{Z})\}\,\mathbf{w}$$

with Gram-Schmidt deflation to ensure rows of $\mathbf{W}$ remain orthogonal.

**Projection**:

$$\mathbf{S} = \mathbf{Z}\mathbf{W}^T \qquad (n \times k \text{ independent components})$$

**Loadings**: the mixing matrix from original variables to components is:

$$\mathbf{A} = \mathbf{V}_k \mathbf{D}_k^{-1/2}\mathbf{W}^T$$

Each column of $\mathbf{A}$ shows how original variables mix into each
component.

**Variable importance**: $\text{imp}_v = \sum_{j=1}^{k} a_{vj}^2$, normalized.

### t-SNE --- t-Distributed Stochastic Neighbor Embedding

t-SNE [van der Maaten & Hinton 2008] converts pairwise distances into conditional probabilities, then finds a
low-dimensional embedding that preserves those probabilities using a Student
$t$-distribution kernel.

**Affinity matrix** (high-dimensional space): for each point $i$, find
$\sigma_i$ such that the perplexity of the conditional distribution equals the
target:

$$p_{j|i} = \frac{\exp(-d_{ij}^2 / 2\sigma_i^2)}{\sum_{k \ne i}\exp(-d_{ik}^2 / 2\sigma_i^2)}$$

Perplexity is defined as $2^H$ where $H$ is the Shannon entropy of
$p_{\cdot|i}$:

$$H = -\sum_{j \ne i} p_{j|i} \log_2 p_{j|i}$$

$\sigma_i$ is found via binary search (50 iterations).

**Symmetrization**:

$$p_{ij} = \frac{p_{j|i} + p_{i|j}}{2n}$$

clamped to a minimum of $10^{-12}$.

**Early exaggeration**: multiply all $p_{ij}$ by 4 for the first 1/5 of
iterations. This helps form well-separated clusters early.

**Low-dimensional affinity** (Student $t$-distribution with 1 df):

$$q_{ij} = \frac{(1 + \|\mathbf{y}_i - \mathbf{y}_j\|^2)^{-1}}{\sum_{k \ne l}(1 + \|\mathbf{y}_k - \mathbf{y}_l\|^2)^{-1}}$$

**Gradient descent**: minimize KL divergence with adaptive gains:

$$\frac{\partial C}{\partial \mathbf{y}_i} = 4\sum_{j \ne i}(p_{ij} - q_{ij})\,q_{ij}\,(\mathbf{y}_i - \mathbf{y}_j)$$

- Learning rate: 100
- Momentum: 0.5 for first 250 iterations, then 0.8
- Gains: increased when gradient and previous update have opposite signs,
  decreased when same sign (min gain = 0.01)
- Re-centered every 100 iterations

**Variable importance** (permutation-based, 150 iterations per permuted run,
3 repetitions).

### UMAP --- Uniform Manifold Approximation and Projection

UMAP builds a fuzzy topological representation of the data in high dimensions
and optimizes a low-dimensional layout to match it.

**k-Nearest Neighbors**: brute-force search for each point (all pairs).

**Local connectivity ($\rho$)**: the distance to the nearest neighbor.

$$\rho_i = d_{i,1} \qquad \text{(distance to 1st nearest neighbor)}$$

**Smooth knn distance ($\sigma$)**: find $\sigma_i$ such that:

$$\sum_{j=1}^{k}\exp\!\left(-\frac{d_{ij} - \rho_i}{\sigma_i}\right) = \log_2 k$$

Found via binary search (64 iterations). This normalizes the local neighborhood
to have effective size $k$.

**Fuzzy simplicial set** (high-dimensional graph):

$$v_{ij} = \exp\!\left(-\frac{d_{ij} - \rho_i}{\sigma_i}\right)$$

Symmetrized by fuzzy union: $g_{ij} = \min(v_{ij} + v_{ji},\, 1)$.

**Low-dimensional embedding** (parameterized by $a$, $b$):

The similarity in embedding space is:

$$q_{ij} = \left(1 + a\|\mathbf{y}_i - \mathbf{y}_j\|^{2b}\right)^{-1}$$

Parameters $a$ and $b$ are found by fitting to the target function:

$$f(d) = \begin{cases} 1 & d \le \text{min\_dist} \\ \exp(-(d - \text{min\_dist})) & d > \text{min\_dist} \end{cases}$$

using grid search over $a \in [0.5, 5]$ and $b \in [0.5, 2]$.

**Optimization**: gradient descent for 200 epochs with decaying learning rate
and gradient clipping (max norm = 4):

$$F_{ij} = w_{ij}(1 - q_{ij}) + (1 - w_{ij})\,q_{ij}$$

Attractive forces pull connected points together; repulsive forces push
disconnected points apart. Re-centered each epoch.

**Variable importance** (permutation-based, 50 epochs per permuted run,
3 repetitions).

---

## Clustering

### K-Means

Partitions $n$ observations into $k$ clusters, each defined by its centroid.

**Algorithm**: Lloyd's iteration (via ml-kmeans v7):

1. Initialize $k$ centroids (k-means++ by default).
2. Assign each point to the nearest centroid.
3. Update centroids as the mean of assigned points.
4. Repeat until convergence.

**Objective**: minimize within-cluster sum of squares:

$$\text{WCSS} = \sum_{c=1}^{k}\sum_{i \in C_c}\|\mathbf{x}_i - \boldsymbol{\mu}_c\|^2$$

### Hierarchical Clustering

Builds a dendrogram by iteratively merging the closest pair of clusters.

**Linkage criteria** (via ml-hclust v4):

| Linkage | Distance between clusters |
|---------|--------------------------|
| Complete | $\max_{a \in A,\, b \in B} d(a, b)$ |
| Single | $\min_{a \in A,\, b \in B} d(a, b)$ |
| Average | $\frac{1}{|A||B|}\sum_{a \in A}\sum_{b \in B} d(a, b)$ |

The dendrogram is cut at the level that produces $k$ clusters.

### DBSCAN

Density-based spatial clustering. No need to specify $k$.

**Parameters**:
- **eps** ($\varepsilon$): neighborhood radius.
- **minPts**: minimum points to form a dense region.

**Algorithm** (via density-clustering v1.3):

1. For each point, count neighbors within $\varepsilon$.
2. Points with $\ge$ minPts neighbors are **core points**.
3. Connected core points form a cluster.
4. Border points (within $\varepsilon$ of a core point, but not core
   themselves) join the nearest cluster.
5. Remaining points are **noise** (cluster $-1$).

### OPTICS

Ordering Points To Identify the Clustering Structure. Extends DBSCAN to handle
variable-density clusters.

**Algorithm** (via density-clustering v1.3):
- Produces an ordering of points by their reachability distance.
- Cluster extraction uses the **xi** parameter: a cluster boundary is detected
  where reachability drops by a factor of $\xi$ (e.g., $\xi = 0.05$ means a 5%
  steepness threshold).

**Parameters**: $\varepsilon$ (max neighborhood radius), minPts, $\xi$.

### X-Means

Automatically selects $k$ using the Bayesian Information Criterion.

**Algorithm**:
1. For each $k$ from 1 to $k_\text{max}$, run K-Means with $k$ clusters.
2. Compute BIC for each:

$$\text{BIC}(k) = -2\,L(k) + p_k \ln n$$

where $L(k)$ is the log-likelihood under spherical Gaussian assumptions, $p_k$
is the number of parameters ($k \cdot p$ means $+ k$ variances $+ k - 1$
priors), and $n$ is the number of points.

3. Select the $k$ that maximizes BIC.

---

## Classification

All classifiers use **painted groups** as class labels (no categorical variable
required). The workflow is: brush 2+ groups of points, select features, train,
then visualize decision boundaries.

### KNN --- K-Nearest Neighbors

Non-parametric: assigns a point to the majority class among its $k$ nearest
training neighbors (Euclidean distance, equal weighting).

$$\hat{y}(\mathbf{x}) = \operatorname{mode}\{y_i : i \in k\text{NN}(\mathbf{x})\}$$

Ties broken by the class with the nearest neighbor.

### Gaussian Naive Bayes

Assumes each class-conditional feature distribution is Gaussian, with features
independent given the class.

**Training**: estimate class priors, per-class means, and per-class variances.

$$P(y = c) = \frac{n_c}{n}, \qquad P(x_j \mid y = c) \sim \mathcal{N}(\mu_{cj},\, \sigma_{cj}^2)$$

**Prediction** (via Bayes' theorem, with naive independence assumption):

$$\hat{y}(\mathbf{x}) = \arg\max_c \left[\log P(y{=}c) + \sum_{j=1}^{p}\log P(x_j \mid y{=}c)\right]$$

### Random Forest

Ensemble of decision trees, each trained on a bootstrap sample with random
feature subsets.

**Training** (custom implementation):
- **trees**: number of trees in the ensemble (default 10).
- **max depth**: maximum tree depth (default 5).
- Each tree: bootstrap sample (sampling with replacement), random $\sqrt{p}$
  feature subset at each split.
- Split criterion: Gini impurity.
- Minimum leaf size: 5 observations.

**Prediction**: majority vote across all trees.

### Decision Boundary Visualization

After training, a grid of points is generated over the 2D feature space:

$$x_\text{grid} = \text{linspace}(\min x_1,\, \max x_1,\, \text{res})$$
$$y_\text{grid} = \text{linspace}(\min x_2,\, \max x_2,\, \text{res})$$

Each grid point is classified by the trained model. The grid points are added
to the dataset as **shadow rows** (ghosted, semi-transparent) with their
predicted paint color, showing the decision regions without affecting the real
data.

---

## Permutation Importance

For nonlinear projections (MDS, t-SNE, UMAP) that lack a rotation/loadings
matrix, variable importance is estimated via permutation:

1. Compute the baseline embedding $\mathbf{Y}$ using all variables.
2. For each variable $v$:
   a. Shuffle the values of $v$ across observations (breaking $v$'s
      relationship with all other variables).
   b. Recompute the embedding $\mathbf{Y}_\text{perm}$.
   c. Measure the shift: for each component $c$, compute the Pearson
      correlation $r_c$ between $\mathbf{Y}_{[:,c]}$ and
      $\mathbf{Y}_\text{perm}_{[:,c]}$.
   d. The variable's importance for component $c$ is $1 - r_c^2$
      ($R^2$ loss).
   e. Average across components.
3. Repeat steps 2a--2e for 3 permutations and average.
4. Normalize so the maximum importance is 1.

For t-SNE permutation runs, iterations are reduced to 150 (from the user's
setting) to keep computation manageable. For UMAP, epochs are reduced to 50.
This gives approximate but useful importance scores.

For PCA and ICA, permutation is unnecessary because loadings directly quantify
variable contributions. The importance is computed as a variance-weighted sum of
squared loadings.

---

## Scatter Overlays

### Density Contours (2D KDE)

A two-dimensional kernel density estimate (KDE) is computed over the scatter
data and rendered as contour lines.

**Kernel**: Gaussian kernel with bandwidth automatically set to 1.5× the grid
spacing on a 50×50 grid.

$$\hat{f}(x, y) = \frac{1}{n}\sum_{i=1}^{n}\frac{1}{2\pi h^2}\exp\!\left(-\frac{(x-x_i)^2 + (y-y_i)^2}{2h^2}\right)$$

**Contour levels**: 5 quantile levels computed from the non-zero density values.
Contours are extracted using the marching squares algorithm [Lorensen & Cline 1987].

**Color**: viridis-like palette from dark (low density) to warm (high density).

### Rug Marks

Tick marks along each axis showing the marginal distribution of data points.
Each point contributes a small line segment (6 px) perpendicular to the axis at
its coordinate value. This gives a 1D marginal view without occluding the 2D
scatter.

### LOESS Smooth

LOcally Estimated Scatterplot Smoothing [Cleveland 1979]. Fits a smooth curve
through the scatter by performing local linear regressions with tricube kernel
weighting.

**Local linear fit**: at each evaluation point $x_0$, fit a line by weighted
least squares to the $k$ nearest neighbors, where $k = \text{round}(0.75 \times n)$:

$$\hat{y}(x_0) = \hat{\beta}_0 + \hat{\beta}_1 x_0$$

where $(\hat{\beta}_0, \hat{\beta}_1)$ minimize:

$$\sum_{i=1}^{k} w_i\,(y_i - \beta_0 - \beta_1(x_i - x_0))^2$$

**Tricube kernel**:

$$W(u) = \begin{cases}(1 - |u|^3)^3 & |u| < 1 \\ 0 & |u| \ge 1\end{cases}$$

where $u = (x_i - x_0)/\Delta$ and $\Delta$ is the distance to the farthest
neighbor in the window.

**Robustness iterations** (3 total): after the initial fit, compute residuals.
Points with large residuals (MAD-based threshold) are down-weighted using a
bisquare function, and the fit is recomputed. This reduces the influence of
outliers.

**Output**: 80 evaluation points from $x_\min$ to $x_\max$.

### Biplot Arrows

When viewing PCA components, biplot arrows show how each original variable
contributes to the displayed 2D projection. Each arrow extends from the origin
to the scaled loading coordinates for that variable:

$$\text{arrow}_v = (\ell_{v,\text{PC}_x} \cdot s,\; \ell_{v,\text{PC}_y} \cdot s)$$

where $\ell_{v,c}$ is the loading of variable $v$ on component $c$, and $s$ is
a scaling factor set to 35% of the maximum data range divided by the maximum
loading length. Arrows shorter than 5% of the maximum are hidden.

---

## Dendrogram

When hierarchical clustering is used, an interactive dendrogram is displayed in
the Clustering panel. The dendrogram shows the full merge tree, with merge
height on the vertical axis and leaf order on the horizontal axis.

**Structure**: each merge node connects two children (leaves or previously
merged clusters) at the merge distance. Branches below the cut height (dashed
orange line) are colored in accent blue; those above are dimmed.

**Interactive cut**: dragging the dashed cut line vertically changes the number
of clusters $k$, which can then be re-applied.

---

## References

1. Asimov, D. (1985). The grand tour: a tool for viewing multidimensional data. *SIAM Journal on Scientific and Statistical Computing*, 6(1), 128–143.

2. Borg, I. & Groenen, P. J. F. (2005). *Modern Multidimensional Scaling: Theory and Applications*. 2nd ed. Springer.

3. Cleveland, W. S. (1979). Robust locally weighted regression and smoothing scatterplots. *Journal of the American Statistical Association*, 74(368), 829–836.

4. Cook, D., Buja, A., Cabrera, J., & Hurley, C. (1995). Grand tour and projection pursuit. *Journal of Computational and Graphical Statistics*, 4(3), 155–172.

5. Cook, D., Swayne, D. F., & Buja, A. (2007). *Interactive and Dynamic Graphics for Data Analysis*. Springer.

6. Hyvärinen, A. (1999). Fast and robust fixed-point algorithms for independent component analysis. *IEEE Transactions on Neural Networks*, 10(3), 626–634.

7. Jolliffe, I. T. (2002). *Principal Component Analysis*. 2nd ed. Springer.

8. Kruskal, J. B. (1964). Multidimensional scaling by optimizing goodness of fit to a nonmetric hypothesis. *Psychometrika*, 29(1), 1–27.

9. Lorensen, W. E. & Cline, H. E. (1987). Marching cubes: a high resolution 3D surface construction algorithm. *ACM SIGGRAPH Computer Graphics*, 21(4), 163–169.

10. van der Maaten, L. & Hinton, G. (2008). Visualizing data using t-SNE. *Journal of Machine Learning Research*, 9, 2579–2605.

11. McInnes, L., Healy, J., & Melville, J. (2020). UMAP: uniform manifold approximation and projection for dimension reduction. *Open Journal of Statistics*, 10(3), 683–711.
