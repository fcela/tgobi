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

$$f_\text{lda}(\mathbf{B}) = \frac{\text{tr}(\mathbf{B}^T \mathbf{S}_B \mathbf{B})}{\text{tr}(\mathbf{B}^T \mathbf{S}_W \mathbf{B})}$$

where $\mathbf{S}_B$ is the between-class scatter matrix and $\mathbf{S}_W$ is
the within-class scatter matrix. Requires painted groups (2+ colors).

**PCA index**: maximizes total projected variance.

$$f_\text{pca}(\mathbf{B}) = \text{tr}(\mathbf{B}^T \mathbf{S}\,\mathbf{B})$$

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

### Guided (steerable) tour with keyframes

The guided tour [Lekschas & Abdennur 2026] lets the user define a sequence of
keyframe projections, then smoothly interpolates between them using Catmull-Rom
spline blending of geodesic segments, with Gram-Schmidt re-orthonormalization
after each evaluation.

**Keyframes**: a sequence of orthonormal frames
$\mathbf{F}_0, \mathbf{F}_1, \ldots, \mathbf{F}_{m-1}$, each a $p \times k$
basis matrix. Keyframes can come from saved views, PP-optimized targets, or
the current projection.

**Geodesic distance**: measured via principal angles from the SVD of
$\mathbf{F}_a^\top \mathbf{F}_z$, corresponding to Grassmannian manifold
distance:

$$d(\mathbf{F}_a, \mathbf{F}_z) = \sqrt{\sum_{j=1}^{k} \theta_j^2}$$

where $\theta_j = \arccos(\sigma_j)$ and $\sigma_j$ are the singular values of
$\mathbf{F}_a^\top \mathbf{F}_z$.

**Catmull-Rom interpolation**: for each segment $[\mathbf{F}_i, \mathbf{F}_{i+1}]$,
the spline blends the geodesic path with Hermite tangent vectors $\mathbf{m}_i$
computed from neighboring segments:

$$\mathbf{B}(t) = h_{00}(t)\,\mathbf{F}_i + h_{10}(t)\,\mathbf{m}_i + h_{01}(t)\,\mathbf{F}_{i+1} + h_{11}(t)\,\mathbf{m}_{i+1}$$

where $h_{00}, h_{10}, h_{01}, h_{11}$ are the standard Hermite basis functions.
After evaluation, $\mathbf{B}(t)$ is re-orthonormalized via Gram-Schmidt.

**Arc-length parameterization**: cumulative arc-length table enables $O(\log n)$
binary search, ensuring perceptually uniform playback speed. The scrubber
slider maps position $u \in [0, 1]$ to arc-length $s = u \cdot L_\text{total}$,
then to the corresponding segment and local parameter.

**Ping-pong playback**: the animation traverses the spline forward to $u = 1$,
then reverses to $u = 0$, creating a continuous loop through all keyframes.

### Langevin Tour

The Langevin tour [Harrison 2023] replaces deterministic path planning with a
stochastic diffusion process on the Stiefel manifold of orthonormal frames.

**Dynamics**: at each step, the basis $\mathbf{B}$ evolves according to the
overdamped Langevin equation:

$$\mathbf{B}_{t+1} = \text{retract}\!\left(\mathbf{B}_t + \eta\,\nabla f(\mathbf{B}_t) + \sqrt{2\eta\,T}\;\boldsymbol{\xi}_t\right)$$

where $f$ is the PP index (energy), $\eta$ is the step size, $T$ is the
temperature (diffusion strength), and $\boldsymbol{\xi}_t \sim \mathcal{N}(0, \mathbf{I})$
is Gaussian noise projected onto the tangent space of the Stiefel manifold.
The retraction step (QR-based re-orthonormalization) keeps $\mathbf{B}$ valid.

**Step size** controls the displacement per frame. **Diffusion** (temperature)
controls randomness: $T = 0$ gives deterministic PP ascent; higher $T$ adds
exploration noise. This produces a smoother, more organic tour path than
step-and-optimize PP, while still spending more time near interesting
projections.

**Warning**: the Langevin tour converges toward local optima of the PP index,
not the global optimum. It is a stochastic search, and different runs may
visit different projections.

### Correlation tour (2x1D)

A separate tour **shape** (alongside 1D and 2D) that visualizes the
relationship between two disjoint variable sets by running *two independent
1D tours simultaneously* — one for each axis of a scatterplot. With variable
sets $\mathcal{X} = \{x_1, \ldots, x_{p_X}\}$ and
$\mathcal{Y} = \{y_1, \ldots, y_{p_Y}\}$, the projection at any frame is

$$\hat{x}_i = \sum_{j=1}^{p_X} X_{ij}\,b^X_j, \qquad
\hat{y}_i = \sum_{j=1}^{p_Y} Y_{ij}\,b^Y_j$$

where $\mathbf{b}^X \in \mathbb{S}^{p_X - 1}$ and
$\mathbf{b}^Y \in \mathbb{S}^{p_Y - 1}$ are unit 1D bases that each follow
their own grand-tour (or projection-pursuit) path. The data matrix is
column-partitioned: the first $p_X$ active columns drive $\hat{x}$, the
remaining $p_Y$ drive $\hat{y}$.

The combined basis returned to the renderer is the $(p_X + p_Y) \times 2$
block-diagonal matrix

$$\mathbf{B} = \begin{bmatrix} \mathbf{b}^X & \mathbf{0} \\ \mathbf{0} & \mathbf{b}^Y \end{bmatrix},$$

i.e. $X$-set variables contribute only to the rendered X coordinate and
$Y$-set variables contribute only to the rendered Y coordinate. This lets
the standard scatter renderer consume corr-tour frames identically to a
regular 2D tour.

**When to use**: structure that comes from the *between-set* relationship
of two variable groups — for example, "does some linear combination of the
sepal measurements predict (correlate with) some linear combination of the
petal measurements?" Tilted scatter shapes during the tour indicate a
correlation between the two 1D projections; a sphered cloud indicates
independence in the linear sense.

**Variable picker**: the Classify tour panel partitions the checked
variables into X-set and Y-set automatically (split in the middle). The
correlation tour itself is grand- or PP-driven on each axis independently;
the keyframe/scrubber and Langevin modes are not yet wired through the
correlation path.

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

### DR Quality Metrics

After computing any dimensionality reduction, tgobi reports quality
metrics from Venna & Kaski [2006] to quantify how faithfully the
low-dimensional embedding preserves the structure of the original
high-dimensional data.

**Trustworthiness** measures whether points that appear nearby in the
embedding were actually nearby in the original space. For each point $i$,
identify its $k$ nearest neighbors in the embedding ($U_i$). Any
neighbor $j \in U_i$ that is *not* among the $k$ nearest neighbors in
the original space ($V_i$) contributes a penalty proportional to how far
down the original ranking it falls:

$$T(k) = 1 - \frac{2}{nk(2n - 3k - 1)} \sum_{i=1}^{n} \sum_{j \in U_i \setminus V_i} \bigl(r(i,j) - k\bigr)$$

where $r(i,j)$ is the rank of $j$ in the original-space neighbor
ordering of $i$. A value near 1 means the embedding does not create
false neighborhoods; a low value means points that look close in 2D are
actually far apart in the original data (intrusions).

**Continuity** is the complementary measure: whether points that were
nearby in the original space remain nearby in the embedding. For each
point $i$, neighbors $j \in V_i$ that are missing from $U_i$ contribute
a penalty proportional to their rank in the embedding ordering:

$$C(k) = 1 - \frac{2}{nk(2n - 3k - 1)} \sum_{i=1}^{n} \sum_{j \in V_i \setminus U_i} \bigl(\hat{r}(i,j) - k\bigr)$$

where $\hat{r}(i,j)$ is the rank of $j$ in the embedding-space neighbor
ordering. A value near 1 means the embedding does not tear apart true
neighborhoods (extrusions).

Both metrics use $k = 10$ by default (clamped to $n - 2$).

**Interpretation**:
- $T, C > 0.9$: excellent preservation
- $T, C > 0.8$: good
- $T, C > 0.5$: moderate distortion
- $T, C < 0.5$: substantial distortion

**Shepard diagram**: a scatterplot of original pairwise distances
(x-axis) vs. embedding pairwise distances (y-axis). If the embedding
perfectly preserved all distances, all points would lie on the diagonal
$y = x$. Spread above the diagonal indicates distances that have been
stretched; below indicates compression. For nonlinear methods like
t-SNE and UMAP, the Shepard diagram typically shows a step-function
shape: local distances are approximately preserved (points near the
diagonal for small distances), while global distances are compressed
(points fall below the diagonal for large distances).

The Shepard diagram samples up to 500 pairs from the upper triangle of
the distance matrix to keep rendering tractable.

**Warning**: These are global summary measures. A high
trustworthiness/continuity does not guarantee every region is
faithfully represented. Always combine with visual inspection.

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

### Silhouette Coefficient

The silhouette [Rousseeuw 1987] measures how well each point fits within its
assigned cluster versus the nearest alternative cluster.

For point $i$ in cluster $C_a$, define:

- $a(i)$: mean distance from $i$ to all other points in $C_a$ (intra-cluster
  cohesion)
- $b(i)$: smallest mean distance from $i$ to points in any other cluster
  (nearest-cluster separation)

The silhouette score for point $i$:

$$s(i) = \frac{b(i) - a(i)}{\max(a(i),\, b(i))}$$

Scores range from $-1$ (wrong cluster) to $+1$ (well-clustered). A score near
$0$ means the point sits on the boundary between two clusters.

**Mean silhouette** is computed for all clustering methods with $k \ge 2$.
Per-cluster mean silhouettes are also reported, helping identify which clusters
are well-separated and which overlap.

**Complexity**: $O(n^2)$ pairwise distances. Computed synchronously.

### k-Distance Plot

For DBSCAN and OPTICS, the $k$-distance plot [Ester et al. 1996] helps select
the $\varepsilon$ parameter.

For each point $i$, the $k$-distance is the distance to its $k$-th nearest
neighbor (where $k = \text{minPts}$). Sorting these distances in descending
order produces a curve. A natural choice for $\varepsilon$ is the "elbow" —
the point where the curve transitions from a gradual slope to a sharp increase,
indicating the transition from dense regions to sparse outliers.

**Implementation**: for each point, all pairwise distances are computed and
sorted. The $k$-th smallest distance is extracted. The resulting `Float64Array`
is sorted in descending order for display.

**Complexity**: $O(n^2)$ pairwise distances, same as silhouette.

### OPTICS Reachability Plot

The OPTICS reachability plot shows the reachability distance of each point in
the ordering produced by the OPTICS algorithm. Valleys in the plot correspond
to clusters; deep valleys indicate dense, well-separated clusters; shallow
valleys indicate loose groupings.

The xi-based extraction method identifies cluster boundaries where reachability
drops by a factor of $\xi$: a cluster starts where reachability drops steeply
and ends where it rises steeply again. Points not assigned to any cluster are
labeled as noise.

---

## Classification

Classifiers use either **brushed groups** (painted on the scatterplot via
persistent brush) or a **categorical variable** as class labels. The workflow
is: choose a class source, select predictor variables, pick a method, train,
then visualize decision boundaries.

### KNN --- K-Nearest Neighbors

Non-parametric: assigns a point to the majority class among its $k$ nearest
training neighbors (Euclidean distance, equal weighting).

$$\hat{y}(\mathbf{x}) = \text{mode}\{y_i : i \in k\text{NN}(\mathbf{x})\}$$

Ties broken by the class with the nearest neighbor.

**Per-class probability**: the implementation retrieves the actual $k$ nearest
neighbors of each query point and returns the per-class fraction:

$$P(y = c \mid \mathbf{x}) = \frac{|\{i \in k\text{NN}(\mathbf{x}) : y_i = c\}|}{k}$$

These calibrated probabilities feed the uncertainty filter in the decision
boundary visualization (see below).

### Gaussian Naive Bayes

Assumes each class-conditional feature distribution is Gaussian, with features
independent given the class. Implemented directly (not via `ml-naivebayes`)
so per-class posteriors come from a log-space softmax, which doesn't underflow
on many features.

**Training**: estimate class priors, per-class means, and per-class variances.
A small variance floor ($\sigma_{\min} = 10^{-9}$) prevents division by zero
on degenerate (constant) features.

$$P(y = c) = \frac{n_c}{n}, \qquad P(x_j \mid y = c) \sim \mathcal{N}(\mu_{cj},\, \sigma_{cj}^2)$$

**Prediction** (via Bayes' theorem, with naive independence assumption):

$$\hat{y}(\mathbf{x}) = \arg\max_c \left[\log P(y{=}c) + \sum_{j=1}^{p}\log P(x_j \mid y{=}c)\right]$$

**Per-class probability**: posteriors are recovered by softmax on the
log-posteriors (max-subtraction for numerical stability):

$$P(y = c \mid \mathbf{x}) = \frac{\exp(\ell_c - \ell_{\max})}{\sum_{k} \exp(\ell_k - \ell_{\max})}, \quad \ell_c = \log P(y{=}c) + \sum_j \log P(x_j \mid y{=}c)$$

### Multinomial Logistic Regression

Linear classifier that models class probabilities using the softmax function.
Finds linear decision boundaries between classes.

**Model**: for $K$ classes, the probability of class $c$ given input
$\mathbf{x}$ is:

$$P(y = c \mid \mathbf{x}) = \frac{\exp(\mathbf{w}_c^T \mathbf{x} + b_c)}{\sum_{k=1}^{K}\exp(\mathbf{w}_k^T \mathbf{x} + b_k)}$$

**Training**: minimize cross-entropy loss with L2 regularization using batch
gradient descent. Features are standardized internally (zero mean, unit
variance) before fitting.

**Regularization** ($\lambda$): L2 penalty on weights
$\frac{\lambda}{2}\sum_{c,k} w_{ck}^2$. Higher values prevent overfitting by
shrinking coefficients toward zero. Default $\lambda = 0.01$.

**Feature importance**: derived from the inverse-standardized coefficient
magnitudes $\|\tilde{\mathbf{w}}_j\|_2$ where
$\tilde{w}_{cj} = w_{cj} / \sigma_j$, normalized to $[0, 1]$. This accounts
for the original variable scales.

### Random Forest

Ensemble of decision trees, each trained on a bootstrap sample with random
feature subsets (via `ml-random-forest`).

**Training**:
- **nEstimators**: number of trees in the ensemble (default 10).
- **maxDepth**: maximum tree depth (default 5).
- Each tree: bootstrap sample (sampling with replacement), random $\sqrt{p}$
feature subset at each split.
- Split criterion: Gini impurity.
- Zero-variance columns receive jitter ($10^{-10}$) before training to prevent
numerical crashes in internal rescaling.

**Prediction**: majority vote across all trees.

**Per-class probability**: tgobi calls `ml-random-forest`'s
`predictProbability(toPredict, label)` once per class label and assembles the
full distribution. Because that library rounds each per-class value to six
decimals, the row is re-normalized to sum to 1 (falling back to a one-hot at
the predicted class if all rounded values are zero).

**Feature importance**: extracted via the `featureImportance()` method of the
trained model, which computes mean decrease in Gini impurity across all trees.
The importance vector is normalized so the maximum is 1.

### Decision Boundary Visualization

Modeled on R's [classifly](https://cran.r-project.org/package=classifly)
package. The idea is to sample the predictor space on a regular grid, evaluate
the trained model at each grid point, and *keep only those grid points whose
predicted class differs from at least one axis-neighbor's*. Those neighbor-
disagreement points densely outline the decision surface and can be
projected like any data points into a scatterplot or tour.

#### Grid construction

Two grid modes are supported, selected by the **Boundary** picker.

**2D slice** (`gridMode = "2d"`). The grid varies only along the first two
selected predictor variables; remaining predictors are held at their
training-set medians. Total point count is always exactly `resolution²`
(e.g. $5 \times 5 = 25$), regardless of how many predictors are selected.

**Full space** (`gridMode = "fullspace"`). The grid varies along every
selected predictor:

$$x_j^\text{grid} = \text{linspace}(\min x_j,\, \max x_j,\, r), \quad j = 1, \ldots, p$$

Total point count is $r^p$ where $r$ is the **effective** per-axis
resolution. If the requested resolution would exceed
`MAX_GRID_POINTS = 200 000`, the implementation lowers $r$ to the largest
value $\le$ requested such that $r^p \le 200\,000$. The Classify panel
displays both the effective count and a "(capped from N)" note when this
happens.

Use 2D slice when you want a clean, fast boundary in one plane. Use Full
space when you want boundary points to project meaningfully in any 2D tour
projection of the predictor variables --- the rings stay coherent as you
rotate.

#### Boundary thinning (neighbor disagreement)

Each grid point is classified, producing a predicted class $\hat{y}$ and a
per-class probability vector. Then for each grid point, the implementation
checks its $\pm 1$ neighbors along every grid axis. Points are kept iff at
least one axis-neighbor has a different predicted class:

$$\text{keep}(\mathbf{x}) = \begin{cases} 1 & \exists\, \mathbf{x}' \text{ axis-neighbor of }\mathbf{x}\text{ s.t. } \hat{y}(\mathbf{x}') \neq \hat{y}(\mathbf{x}) \\ 0 & \text{otherwise} \end{cases}$$

This works for *any* classifier, including hard classifiers (KNN with $k=1$)
whose probability is degenerate; it does not rely on $P = 0.5$ contour
extraction. The retained points densely outline the decision surface in
$p$-space.

#### Uncertainty filter

Each retained grid point also stores its **indecision** value:

$$\text{indecision}(\mathbf{x}) = 1 - \max_k \, P(\hat{y} = k \mid \mathbf{x})$$

The Classify panel's *Uncertainty* slider sets a threshold; only grid points
with $\text{indecision}(\mathbf{x}) \ge \text{threshold}$ are drawn. The
panel shows a live "$N$ of $M$ shown" count beside the slider, so even when
the visual change is subtle (the boundary points found by neighbor
disagreement often have similar probabilities) you can see the filter
working. The filter is applied at render time --- moving the slider does not
re-run the classifier.

#### Rendering

The boundary is an **overlay layer** consumed directly by plot renderers from
the classification slice --- the DataFrame is never modified. The
classification slice holds:

- `boundaryGrid`: per-point predictor coordinates ($n \times p$ row-major)
- `boundaryPaint`: per-point predicted-class paint index
- `boundaryProbabilities`: per-point $1 - \max_k P_k$
- `boundaryVars`: snapshot of the predictor names that define the grid axes

When **boundariesVisible** is true, scatter and scatterplot-matrix
renderers pull this overlay and draw each point as an outline ring
colored by its predicted class. The DataFrame is never modified ---
boundary rings do not appear in the missing-pattern plot,
parallel coordinates, boxplots, or CSV export.

**Misclassified** original rows are reported via a separate
`classification.misclassified` mask. Renderers draw those rows as an X
cross (shape 5) regardless of the row's brushed shape, so analysis output
doesn't trample any user-set shapes. Clicking Hide clears the mask without
touching the user's brushed state.

#### Boundary in tours

To stay aligned with the data during a tour, boundary points are projected
through the *same* basis $B \in \mathbb{R}^{p \times k}$ the tour worker
uses, with one detail: the worker projects *standardized* data
(`toStandardisedMatrix`), so the renderer standardizes each boundary
coordinate the same way before multiplying:

$$\mathbf{x}^\text{proj}_i = \tilde{\mathbf{x}}_i \, B, \qquad
\tilde{x}_{ij} = \frac{x_{ij} - \mu_j}{\sigma_j}$$

where $\mu_j, \sigma_j$ are computed across the same set of rows the tour
worker used (non-shadowed, non-missing). For active tour variables that are
*not* predictors, the natural fill value is the column mean, which
standardizes to zero --- so those variables contribute nothing to the
projection. At least one active tour variable must be a predictor;
otherwise the boundary is hidden for that tour.

Boundary rendering is also skipped if any active variable has explicit
column scaling (e.g. `range`, `robust`) attached --- mirroring the full
`scaleColumn` path in that case is a known TODO; the default no-scaling
case works.

#### Show / Hide

`applyClassificationBoundaries` flips `boundariesVisible` to true. No
DataFrame mutation, no setData churn, no missing-mask juggling: the
operation is $O(1)$ in df size. `clearClassification` flips it back to
false and preserves the boundary grid so the next *Show* re-displays
without re-running the classifier.

### Confusion Matrix

After training, a confusion matrix is computed. When train/test split is
enabled, the matrix is computed on the test set; otherwise, it uses the
training set:

$$C_{ij} = |\{x : y_\text{true}(x) = c_i \wedge \hat{y}(x) = c_j\}|$$

From the confusion matrix, per-class metrics are derived:

| Metric | Formula |
|--------|---------|
| Precision | $\frac{C_{ii}}{\sum_j C_{ji}}$ |
| Recall | $\frac{C_{ii}}{\sum_j C_{ij}}$ |
| F1 | $2 \cdot \frac{\text{precision} \cdot \text{recall}}{\text{precision} + \text{recall}}$ |
| Support | $\sum_j C_{ij}$ (row total) |

Overall accuracy: $\text{acc} = \frac{\sum_i C_{ii}}{\sum_{ij} C_{ij}}$.

**Warning**: when train/test split is *off*, these metrics are computed on
the training set, so they overestimate real-world performance --- a classifier
that memorizes its training data will show 100% accuracy but may generalize
poorly. Enable train/test split (below) or read the 5-fold cross-validation
estimate in the diagnostics panel for an honest score.

### Train/Test Split

When enabled, the labeled data is partitioned into a training set (for fitting
the model) and a test set (for evaluating accuracy). The split is
**stratified**: each class contributes the same proportion to both sets,
preserving class balance.

The train ratio (default 0.8) controls the fraction used for training. With
train/test split active, the confusion matrix, accuracy, and per-class metrics
are computed on the **test set** only, giving a more honest estimate of
generalization performance.

### 5-Fold Cross-Validation

Regardless of whether train/test split is enabled, a stratified 5-fold
cross-validation is computed automatically on all labeled data. The data is
split into 5 folds, preserving class proportions. For each fold, the model is
trained on 4/5 of the data and evaluated on the remaining 1/5. The mean
accuracy across folds and the per-fold accuracies (with standard deviation)
are reported in the diagnostics panel.

CV accuracy is more reliable than a single train/test split for small datasets,
because every observation contributes to both training and evaluation across
the 5 iterations.

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

## Scagnostics

Scagnostics (scatterplot diagnostics) [Wilkinson et al. 2005, Tukey & Tukey 1985] compute numerical measures characterizing the distribution of point clouds in a scatterplot. For $p$ variables, all $\binom{p}{2}$ pairwise scatterplots are scored on 9 measures, enabling automatic detection of unusual or interesting variable pairs.

### Graph Structures

For each variable pair $(x, y)$, the following geometric structures are computed:

1. **Delaunay triangulation** via the `delaunator` package, giving the complete set of triangles connecting non-missing points.
2. **Minimum spanning tree (MST)** from the Delaunay edges using Kruskal's algorithm with union-find.
3. **Convex hull** via Andrew's monotone chain algorithm.
4. **Alpha shape area**: total area of Delaunay triangles where all edge lengths are at most the 90th percentile of Delaunay edge lengths.

Tiny deterministic jitter (magnitude $10^{-10} \times \max(\text{range}_x, \text{range}_y)$, based on a multiplicative hash) is added to break ties for Delaunay/hull stability on collinear data.

### Nine Measures

**Outlying**: proportion of MST edge length contributed by outlier edges (length $>$ $Q_{75} + 1.5 \cdot \text{IQR}$):

$$\text{outlying} = \frac{\sum_{e \in \text{outlier edges}} \ell_e}{\sum_{e \in \text{MST}} \ell_e}$$

**Skew**: skewness of the MST edge length distribution, rescaled to $[0, 1]$:

$$\text{skew} = 1 - \frac{1}{1 + \max(0, \gamma)}$$

where $\gamma$ is the sample skewness of MST edge lengths.

**Clumpy** [Wilkinson et al. 2005]: cluster measure. For each MST edge $e$ with weight $w$, remove $e$ and follow only MST edges shorter than $w$ from each endpoint (DFS), counting reachable nodes (runts) and tracking the longest edge (maxLen). The value for that edge is:

$$\text{value}_e = \text{runts} \times \left(1 - \frac{\text{maxLen}}{w}\right)$$

where runts and maxLen come from the smaller subtree. Overall:

$$\text{clumpy} = \frac{2 \cdot \max_e(\text{value}_e)}{n}$$

High clumpy indicates well-separated clusters: the connecting edge is long while within-cluster edges are short.

**Sparse**: based on the ratio of mean MST edge length to expected length under uniformity:

$$\text{sparse} = 1 - \frac{1}{1 + \bar{\ell}_\text{MST} \cdot \sqrt{n / A_\text{hull}}}$$

**Striated**: fraction of adjacent MST edge pairs forming near-parallel paths (angle $>$ 150° between neighboring edges at adjacent MST nodes).

**Convex**: ratio of alpha shape area to total Delaunay area:

$$\text{convex} = \frac{A_\alpha}{A_\text{Delaunay}}$$

**Skinny**: based on the isoperimetric ratio of the convex hull:

$$\text{skinny} = 1 - \frac{4\pi A_\text{hull}}{P_\text{hull}^2}$$

where $P_\text{hull}$ is the hull perimeter. A circle scores 0; a line scores 1.

**Stringy**: fraction of MST nodes with degree $\geq 3$ relative to the maximum possible:

$$\text{stringy} = 1 - \frac{|\{v : \deg(v) \geq 3\}|}{n - 2}$$

**Monotonic**: absolute value of Spearman rank correlation between $x$ and $y$:

$$\text{monotonic} = |r_S(x, y)|$$

### Scagnostics Panel

The Scag tab in the right sidebar lets you:
- Select variables to compute scagnostics for
- Sort results by any measure (ascending/descending)
- Filter pairs by a threshold on any measure
- View a table of all $\binom{p}{2}$ pairs with bar-chart sparklines

Computation runs in a **web worker** to keep the UI responsive.

### Scatmat Integration

When scagnostics results exist, the scatterplot matrix can be **reordered** by
any scagnostic measure --- cells are rearranged so that the highest-scoring
pairs cluster together. Individual cells are also highlighted with a background
tint proportional to the selected filter measure score.

**Actions**:
- **Open top pair**: adds a scatterplot of the highest-ranked variable pair.
- **Seed tour**: opens a scatterplot and starts a 2D grand tour seeded with
  the top-ranked pair, jumping directly into an interesting projection.

---

## Andrews Curves

Andrews curves [Andrews 1972] represent each $p$-dimensional observation $\mathbf{x} = (x_1, x_2, \ldots, x_p)$ as a function of a single parameter $t$:

$$f_{\mathbf{x}}(t) = \frac{x_1}{\sqrt{2}} + x_2 \sin(t) + x_3 \cos(t) + x_4 \sin(2t) + x_5 \cos(2t) + \cdots$$

for $t \in [-\pi, \pi]$. Each observation maps to a curve; observations with similar multivariate structure produce similar curves that cluster together visually.

### Properties

- The mapping preserves means: $\bar{f}_{\mathbf{x}}(t) = f_{\bar{\mathbf{x}}}(t)$
- The $L^2$ distance between curves equals the Euclidean distance between observations (up to a constant):
$$\int_{-\pi}^{\pi} (f_{\mathbf{x}}(t) - f_{\mathbf{y}}(t))^2 \, dt = \pi \|\mathbf{x} - \mathbf{y}\|^2$$
- Outliers appear as isolated curves far from the main cluster
- Clusters appear as bands of similar curves

### Implementation

The function is evaluated at `resolution` evenly-spaced points across $[-\pi, \pi]$ (default 200). Each observation is drawn as a polyline connecting these values. Line color encodes the current color variable or brushed groups; alpha scales with sample size for large datasets. Brushing and identify tools work as in other plot types.

---

## Conditional Parallel Coordinates

When a **conditional variable** is selected in a parallel coordinates panel, the
plot is split into horizontal facets — one per level of the conditioning
categorical variable. Each facet shows only the observations belonging to that
level, drawn as a standard parallel coordinates panel with its own axis ranges.

### Why conditional parcoords?

Standard parallel coordinates overlay all observations on shared axes. When the
data contains subgroups, the resulting tangle of crossing lines can be
unreadable. Conditioning splits the view so each group's profile is visible
in isolation, while the vertical alignment preserves axis-to-axis comparisons
across groups.

### Construction

Given a categorical variable $g$ with levels $\ell_1, \ldots, \ell_m$:

1. Partition the $n$ observations into $m$ groups by $g$.
2. Allocate vertical space: each facet receives height
   $\lfloor (h - \text{gaps} - \text{labels}) / m \rfloor$.
3. Within each facet, draw parallel axes and polylines for the group's
   observations using Canvas2D (not WebGL, to keep facets lightweight).
4. Label each facet with the level name.

Linked brushing, painting, and identify work across facets as in the standard
parallel coordinates view.

---

## Concentric Coordinates

Concentric coordinates [Williams & Kovalerchuk 2025] arrange axes as concentric circles (rings) around a shared center instead of parallel vertical axes. Each variable is mapped to a ring radius, with values encoded as angular position along the ring.

### Construction

Given $p$ variables, ring $k$ (for $k = 1, \ldots, p$, innermost to outermost) has mid-radius $r_k$. Each observation $\mathbf{x} = (x_1, x_2, \ldots, x_p)$ is represented as a closed polygon connecting points:

$$P_k = \left(r_k \cos\theta_k,\; r_k \sin\theta_k\right)$$

where the angle $\theta_k$ encodes the normalized value:

$$\theta_k = 2\pi \cdot \frac{x_k - \min_k}{\max_k - \min_k} - \frac{\pi}{2}$$

The $-\pi/2$ offset places the minimum at the top (12 o'clock position).

### Lossless Property

Unlike parallel coordinates, which lose information when lines from different axes cross, concentric coordinates are a **lossless** representation in the General Line Coordinate (GLC) framework: each observation's polygon uniquely determines the original values because the ring-to-ring mapping preserves the encoding.

### Implementation

Each ring is drawn as a circle at its mid-radius. Variable labels appear above the outermost ring. Each observation is rendered as a closed polygon (for $p \geq 3$) or a line (for $p = 2$) connecting the angular positions on each ring. Color, alpha, brushing, and identify tools work identically to parallel coordinates.

---

## Mapper (Topological Data Analysis)

The Mapper construction [Singh et al. 2007] is a tool from topological data analysis (TDA) that summarizes the shape of high-dimensional data as a graph (network). Unlike dimensionality reduction, Mapper preserves multi-scale structure by combining overlapping local views of the data.

### Algorithm

Given $n$ observations in $p$ dimensions, Mapper proceeds in three stages:

**1. Filter (lens) function**: map each observation $\mathbf{x}_i$ to a real-valued filter value $f(\mathbf{x}_i) \in \mathbb{R}$. Available filters:

- **Variable**: use the value of a selected data variable directly.
- **PCA 1**: score on the first principal component — the direction of maximum variance in the selected variables:

$$f(\mathbf{x}_i) = \mathbf{e}_1^\top (\mathbf{x}_i - \bar{\mathbf{x}})$$

where $\mathbf{e}_1$ is the leading eigenvector of the covariance matrix and $\bar{\mathbf{x}}$ is the mean vector.

- **PCA 2**: score on the second principal component — the direction of second-most variance, orthogonal to $\mathbf{e}_1$:

$$f(\mathbf{x}_i) = \mathbf{e}_2^\top (\mathbf{x}_i - \bar{\mathbf{x}})$$

- **PCA residual**: reconstruction error from a 2-component PCA, measuring how poorly a point is described by the best 2D linear approximation:

$$f(\mathbf{x}_i) = \|\mathbf{x}_i - \hat{\mathbf{x}}_i\|, \quad \hat{\mathbf{x}}_i = \bar{\mathbf{x}} + \sum_{c=1}^{2} (\mathbf{e}_c^\top (\mathbf{x}_i - \bar{\mathbf{x}}))\,\mathbf{e}_c$$

Points with high residual values are outliers or lie on non-linear structures that PCA cannot capture. This lens is particularly useful for detecting anomalies [Chalapathy & Chawla 2019].

- **Eccentricity**: the $L_2$ distance from each point to its farthest point:

$$f(\mathbf{x}_i) = \max_{j} \|\mathbf{x}_i - \mathbf{x}_j\|_2$$

- **Density**: Gaussian kernel density estimate evaluated at each point:

$$f(\mathbf{x}_i) = \frac{1}{|\mathcal{R}|}\sum_{j \in \mathcal{R}} \exp\!\left(-\frac{\|\mathbf{x}_i - \mathbf{x}_j\|^2}{2h^2}\right)$$

where $\mathcal{R}$ is a reference set (subsampled to at most 2000 points) and $h = 1$.

**2. Overlapping intervals**: the range of filter values $[\min f, \max f]$ is divided into $n_\text{int}$ intervals of equal width, each overlapping its neighbors by a fraction $\delta \in [0, 0.9)$. For interval width $w$ and overlap $\delta$, the step between interval starts is $s = w(1 - \delta)$. Points may belong to multiple intervals.

**3. Partial clustering**: within each interval, points are clustered. Three
clustering methods are available:

- **k-means** (default): standard k-means++ with $k$ clusters per interval.
- **Hierarchical**: agglomerative clustering with configurable linkage
  (single, complete, or average), cut at $k$ clusters.
- **DBSCAN**: density-based clustering with configurable eps and minPts.
  Points not assigned to any cluster are labeled as noise.

Clusters from different intervals that share points are connected by edges,
forming the Mapper graph.

$$G = (V, E), \quad V = \{c_{i,j}\}, \quad E = \{(c_{i,j}, c_{i',j'}) : c_{i,j} \cap c_{i',j'} \ne \emptyset\}$$

where $c_{i,j}$ is cluster $j$ within interval $i$.

### Graph Layout

The Mapper graph is visualized using force-directed layout [Fruchterman & Reingold 1991]:

- **Repulsive force** between all node pairs: $F_r = C_r / d^2$ (with $C_r = 800$)
- **Attractive force** along edges: $F_a = C_a \cdot d$ (with $C_a = 0.01$)
- **Damping**: velocity multiplied by 0.9 each iteration
- **Iterations**: 50

Node radius is proportional to cluster size (4–16 px). Edge width scales with the number of shared rows between connected clusters.

### Interaction

- **Node selection**: clicking a node selects all data rows in that cluster, updating the selection mask across all linked views.
- **Node detail view**: selecting a node shows a detail panel with:
  - **Connection summary**: number of edges, total shared rows with neighbors, count of distinct neighbor nodes.
  - **Variable summary table**: per-variable mean, standard deviation, min, and max within the node. These are pre-computed during Mapper construction and stored in each node's `stats` record (keys: `varName` for mean, `_sd_varName` for SD, `_min_varName`, `_max_varName`).
- **Color by**: nodes can be colored by size (`_count`) or by the mean value of any selected variable within the cluster.

### Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Filter | variable | variable, pca1, pca2, residual, eccentricity, density | Lens function |
| Filter variable | (first) | any numeric | Variable for "variable" filter |
| Intervals | 10 | 2-50 | Number of overlapping intervals |
| Overlap | 0.5 | 0-0.9 | Fractional overlap between intervals |
| Clustering | k-means | k-means, hierarchical, DBSCAN | Method within each interval |
| Cluster k | 3 | 2-10 | Clusters per interval (k-means/hierarchical) |
| Linkage | complete | single, complete, average | Linkage for hierarchical clustering |
| Eps | 0.5 | 0.01-10 | Neighborhood radius for DBSCAN |
| MinPts | 5 | 2-50 | Minimum points for DBSCAN |

### Topological Interpretation

The Mapper graph reveals topological features of the data manifold [Carlsson 2009]:

- **Connected components**: disconnected subgraphs correspond to distinct data clusters
- **Loops (cycles)**: indicate circular or toroidal structure in the data
- **Branches (flares)**: indicate data extending in different directions from a central core
- **Node size variation**: large nodes in narrow regions suggest concentration points or critical transitions

### Parameter Sweep

The Mapper panel offers a **parameter sweep** mode that computes Mapper graphs
over a grid of (intervals × overlap) combinations. For each combination, the
sweep records:

- Number of nodes and edges
- Number of connected components
- Average node degree
- Graph modularity

The results are displayed as a heatmap, helping you identify parameter regions
where the graph structure is stable. The sweep runs in a web worker.

---

## Missing Data and Imputation

tgobi provides several strategies for handling missing values, accessible from
the variable panel's transform menu and the missing-data panel.

### Missing Pattern Plot

A dedicated plot type shows a heatmap of missingness across all variables and
rows: black cells indicate present values, colored cells indicate missing
values. This gives a quick overview of the missingness structure.

### Imputation Methods

Four methods are available:

**None** (default): missing values remain missing. Plots and algorithms skip
rows with missing values in the relevant variables.

**Fixed value**: replace all missing values in a variable with a user-specified
constant. Useful when the missingness mechanism is known (e.g. a sentinel
value).

$$x_i^\text{imp} = c \qquad \text{for all } i \text{ where } x_i \text{ is missing}$$

**Random observed**: replace each missing value with a randomly sampled
observed value from the same variable. Preserves the marginal distribution but
breaks correlations with other variables.

$$x_i^\text{imp} \sim \text{Uniform}\{x_j : x_j \text{ is observed}\}$$

**Conditional random**: replace each missing value with a randomly sampled
observed value from the same *level* of a conditioning categorical variable.
This preserves within-group distributions and is appropriate when the missingness
mechanism varies across groups.

$$x_i^\text{imp} \sim \text{Uniform}\{x_j : x_j \text{ is observed} \wedge g_j = g_i\}$$

where $g$ is the conditioning variable.

### Multiple Imputation Cycling

Rather than committing to a single imputation, tgobi can generate multiple
imputation sets and **cycle** through them. Each cycle draws a new random seed,
producing different imputed values. Observing how plots change across
imputations reveals the uncertainty introduced by the missing data: features
that are stable across imputations are trustworthy; features that vanish or
shift dramatically depend on the imputation choices.

**Warning**: imputed values are not observations. Any pattern that appears only
after imputation could be an artifact of the imputation method, not a real
feature of the data.

---

## Session Persistence

The session system serializes the current app state to a JSON file that can be
reloaded later. **Save Session** downloads the file; **Open Session** restores
it.

### What is saved

- Loaded DataFrame (data and column types)
- Variable specs (include/exclude, type overrides, scaling, groups)
- Selection state (paint groups, shapes, shadow mask)
- Brush configuration (mode, tool, paint color)
- Color encoding and palette
- Tour parameters (shape, mode, PP index, speed, frozen vars, class source)
- Clustering parameters (method, variables, k, linkage, eps, minPts, xi, kMax)
- Classification parameters (method, variables, class source, grid mode,
  resolution, hyperparameters, train/test split, indecision threshold)
- Projection parameters (method, variables, nComponents, t-SNE/UMAP settings)
- Scagnostics parameters (variables, sort/filter settings, scatmat reorder)
- Mapper parameters (filter, intervals, overlap, clustering method, color-by)
- Missing-data settings (imputation method, fixed value, seed, conditioning var)

### What is not saved

- **Open plot panels**: the layout of plot windows is not persisted.
- **Computed results**: embeddings, cluster assignments, boundary grids,
  scagnostic scores, and mapper graphs must be re-run after loading.
- **Tour runtime state**: saved views, keyframes, basis/projection, and
  play/pause state are reset.
- **Hover/pinned rows**: identify-tool state is not persisted.

This design keeps session files compact and portable, while requiring
recomputation of derived results (which may differ across versions).

---

## Guided Lessons

tgobi includes interactive tutorials that combine step-by-step instructions
with live dataset exploration. Each lesson loads a sample dataset automatically
and guides the user through key workflows.

### Available Lessons

1. **Brushing & Tours with Flea Beetles**: introduces linked brushing, color
   encoding, the grand tour, and projection pursuit using the flea dataset.

2. **LDA & Classification with Olive Oils**: covers painting groups, the LDA
   projection pursuit index, classification, and decision boundary
   visualization using the olive oil dataset.

3. **Missing Data & Imputation Uncertainty**: demonstrates the missing pattern
   plot, imputation methods (fixed, random, conditional), and cycling through
   multiple imputations to visualize uncertainty.

4. **Scagnostics & Clustering on Synthetic Data**: explores scagnostic measures,
   scatterplot matrix reordering by measure, and clustering algorithms on
   synthetic data.

### Lesson Overlay

During a lesson, a semi-transparent overlay appears at the top of the screen
showing the current step's title, body text, and action hints. The user can
navigate forward and backward through steps, or end the lesson at any time.
The underlying application remains fully interactive throughout.

---

## References

1. Asimov, D. (1985). The grand tour: a tool for viewing multidimensional data. *SIAM Journal on Scientific and Statistical Computing*, 6(1), 128–143.

2. Borg, I. & Groenen, P. J. F. (2005). *Modern Multidimensional Scaling: Theory and Applications*. 2nd ed. Springer.

3. Cleveland, W. S. (1979). Robust locally weighted regression and smoothing scatterplots. *Journal of the American Statistical Association*, 74(368), 829–836.

4. Cook, D., Buja, A., Cabrera, J., & Hurley, C. (1995). Grand tour and projection pursuit. *Journal of Computational and Graphical Statistics*, 4(3), 155–172.

5. Cook, D., Swayne, D. F., & Buja, A. (2007). *Interactive and Dynamic Graphics for Data Analysis*. Springer.

6. Ester, M., Kriegel, H.-P., Sander, J., & Xu, X. (1996). A density-based algorithm for discovering clusters in large spatial databases with noise. *Proceedings of KDD*, 226–231.

7. Harrison, G. (2023). langevitour: smooth touring high-dimensional data with Langevin dynamics. *The R Journal*, 15(2), 208–221.

8. Hyvärinen, A. (1999). Fast and robust fixed-point algorithms for independent component analysis. *IEEE Transactions on Neural Networks*, 10(3), 626–634.

9. Jolliffe, I. T. (2002). *Principal Component Analysis*. 2nd ed. Springer.

10. Kruskal, J. B. (1964). Multidimensional scaling by optimizing goodness of fit to a nonmetric hypothesis. *Psychometrika*, 29(1), 1–27.

11. Lekschas, B. & Abdennur, N. (2026). dtour: a steerable tour de vis through high-dimensional data. arXiv:2605.04306.

12. Lorensen, W. E. & Cline, H. E. (1987). Marching cubes: a high resolution 3D surface construction algorithm. *ACM SIGGRAPH Computer Graphics*, 21(4), 163–169.

13. van der Maaten, L. & Hinton, G. (2008). Visualizing data using t-SNE. *Journal of Machine Learning Research*, 9, 2579–2605.

14. McInnes, L., Healy, J., & Melville, J. (2020). UMAP: uniform manifold approximation and projection for dimension reduction. *Open Journal of Statistics*, 10(3), 683–711.

15. Rousseeuw, P. J. (1987). Silhouettes: a graphical aid to the interpretation and validation of cluster analysis. *Journal of Computational and Applied Mathematics*, 20, 53–65.

16. Wilkinson, L., Anand, A., & Grossman, R. (2005). Graph-theoretic scagnostics. *Proceedings of the IEEE Symposium on Information Visualization*, 157–164.

17. Tukey, J. W. & Tukey, P. A. (1985). Computer graphics and exploratory data analysis: an introduction. In *Proceedings of the Sixteenth Symposium on the Interface*, 740–755.

18. Andrews, D. F. (1972). Plots of high-dimensional data. *Biometrics*, 28(1), 125–136.

19. Williams, S. & Kovalerchuk, B. (2025). High-dimensional data classification in concentric coordinates. arXiv:2507.18450.

20. Singh, G., Mémoli, F., & Carlsson, G. (2007). Topological methods for the analysis of high dimensional data sets and 3D object recognition. *Eurographics Symposium on Point-Based Graphics*, 91–100.

21. Carlsson, G. (2009). Topology and data. *Bulletin of the American Mathematical Society*, 46(2), 255–308.

22. Fruchterman, T. M. J. & Reingold, E. M. (1991). Graph drawing by force-directed placement. *Software: Practice and Experience*, 21(11), 1129–1164.

23. Venna, J. & Kaski, S. (2006). Local multidimensional scaling. *Neural Networks*, 19(6-7), 889-899.

24. Chalapathy, R. & Chawla, S. (2019). Deep learning for anomaly detection: a survey. *arXiv preprint arXiv:1901.03407*.

25. Cook, D., Buja, A., Cabrera, J., & Hurley, C. (1993). Projection pursuit indices based on orthonormal function expansions. *Journal of Computational and Graphical Statistics*, 2(2), 137-158.

26. Becker, R. A. & Cleveland, W. S. (1996). The design and control of trellis display. *Journal of Computational and Graphical Statistics*, 5(2), 123-155.

27. Zhou, Y., Chalapathi, N., Rathore, A., Zhao, Y., & Wang, B. (2020). Mapper Interactive: a scalable, extendable, and interactive toolbox for the visual exploration of high-dimensional data. arXiv:2011.03209.

28. Nagy, G. S., Bruckner, S., & Viola, I. (2020). Casting multiple shadows: interactive visualization for comparing multiple embeddings. arXiv:2012.06077.
