import type { ReactNode } from "react";

export interface LessonStep {
  title: string;
  body: ReactNode;
  action?: string;
}

export interface LessonDef {
  id: string;
  title: string;
  description: string;
  dataset: string;
  steps: LessonStep[];
}

export const LESSONS: LessonDef[] = [
  {
    id: "flea-brushing-tour",
    title: "Brushing & Tours with Flea Beetles",
    description: "Learn the core workflow: load data, brush groups, run a grand tour, then use projection pursuit to find separating views.",
    dataset: `${import.meta.env.BASE_URL}samples/flea.csv`,
    steps: [
      {
        title: "Welcome",
        body: "This lesson walks you through the classic GGobi workflow using the flea beetle dataset — 74 beetles from 3 species, measured on 6 morphological variables.\n\nYou'll learn how to brush (paint) groups, run a grand tour, and use projection pursuit to automatically find views where the species separate.",
      },
      {
        title: "Create a scatterplot",
        body: "Click the +Plot button in the toolbar and choose Scatter. Place two variables on the axes — try tars1 vs aede2. You'll see 74 points, but species are not yet visible.\n\nNext step: we'll color by species.",
        action: "add-scatter",
      },
      {
        title: "Color by species",
        body: 'In the Color toolbar (top), change the color mode from "fixed" to "by variable" and select "species". The three species — Concinna, Heikertingeri, Heptapotamica — now appear in different colors.\n\nThis is "painting by reference" — we\'re not brushing yet, just using a known categorical variable to color points.',
        action: "color-by-species",
      },
      {
        title: "Brush a group",
        body: 'Switch the brush tool to "persistent" mode (click the "P" button in the Brush toolbar). Then drag a rectangle over one cluster of points. They turn a new color — you\'ve "painted" them.\n\nBrushing is the fundamental interactive operation. In persistent mode, each new rectangle paints a new group. In transient mode, only the current selection is highlighted.',
        action: "set-persistent-brush",
      },
      {
        title: "Start a grand tour",
        body: "Click the Tour tab in the right panel. Make sure all 6 numeric variables are checked, then press ▶ Start.\n\nThe scatterplot begins animating through random 2D projections of the 6D data. Watch how the three species sometimes separate and sometimes merge — no single static view captures all the structure.",
        action: "start-grand-tour",
      },
      {
        title: "Switch to projection pursuit",
        body: 'While the tour is running, change the Mode from "Grand" to "Projection pursuit", and set the Goal to "LDA" with class source "species".\n\nThe tour now steers toward projections that maximize between-species separation. Watch the PP score climb as it converges on the best separating view. The score sparkline shows the optimization trajectory.',
        action: "switch-pp-lda",
      },
      {
        title: "Save the best view",
        body: "When the PP score plateaus, pause the tour. Click ★ Save to bookmark this projection. You can return to it anytime from the Saved Views list.\n\nCongratulations! You've mastered the core workflow: load → color → brush → tour → pursue → save. This is the foundation of all interactive high-dimensional data analysis.",
      },
    ],
  },
  {
    id: "olive-lda-classify",
    title: "LDA & Classification with Olive Oils",
    description: "Use projection pursuit LDA and classifiers to separate Italian olive oil regions by fatty acid composition.",
    dataset: `${import.meta.env.BASE_URL}samples/olive.csv`,
    steps: [
      {
        title: "Welcome",
        body: "The olive dataset contains 572 Italian olive oils from 3 regions and 9 areas, measured on 8 fatty acid percentages.\n\nThis lesson shows how LDA-guided tours and classification models can separate the regions using their fatty acid profiles.",
      },
      {
        title: "Color by region",
        body: 'In the Color toolbar, switch to "by variable" and select "Region". The three Italian regions (Southern Italy, Sardinia, Northern Italy) appear in different colors.\n\nNotice: the regions overlap heavily in any single variable pair. We need multivariate methods to separate them.',
        action: "color-by-region",
      },
      {
        title: "Run LDA projection pursuit",
        body: 'Go to the Tour tab, check all 8 fatty acid variables, and start a tour. Then switch mode to "Projection pursuit" with goal "LDA" and class source "Region".\n\nThe tour will steer toward the projection that best separates the three regions. The LDA index directly maximizes between-group to within-group variance — it finds Fisher\'s discriminant directions.',
        action: "start-lda-tour-olive",
      },
      {
        title: "Classify with KNN",
        body: 'Switch to the Classify tab. Select all 8 fatty acid variables, set class source to "Region", method to "KNN" with k=5, and click Run.\n\nThe classifier predicts each oil\'s region from its fatty acids. Misclassified points get an X marker — typically oils near regional boundaries. Check the confusion matrix and accuracy in the diagnostics below.',
        action: "run-knn-olive",
      },
      {
        title: "Try Random Forest",
        body: 'Change the classification method to "Random Forest" and run again. Compare the accuracy and confusion matrix with KNN.\n\nRandom Forest often achieves higher accuracy because it captures non-linear boundaries. The feature importance chart shows which fatty acids are most discriminative — oleic and linoleic acids are the key separators for Italian olive oils.',
      },
      {
        title: "Decision boundary overlay",
        body: 'After running a classifier, click "Show boundaries" to overlay the decision regions on the scatterplot. The colored background shows which region the model would predict at each point.\n\nBoundary plots reveal the classifier\'s logic: smooth boundaries for KNN, more complex shapes for Random Forest. They also show where the model is uncertain — boundaries where regions meet.',
      },
    ],
  },
  {
    id: "missing-imputation",
    title: "Missing Data & Imputation Uncertainty",
    description: "Explore missing data patterns and see how different imputation methods change the picture.",
    dataset: `${import.meta.env.BASE_URL}samples/missing.csv`,
    steps: [
      {
        title: "Welcome",
        body: "This tiny dataset (12 rows, 5 columns) has deliberate missing values (NA) in variables x, y, and z, with a categorical group variable.\n\nMissing data is ubiquitous in real datasets. How you handle it can change your conclusions. This lesson shows you how to visualize missingness patterns and understand imputation uncertainty.",
      },
      {
        title: "Add a missing pattern plot",
        body: 'Click +Plot → "Missing pattern". This shows a matrix where each row is a case and each column is a variable. Blue = observed, white = missing.\n\nYou can immediately see which variables have the most missingness and whether missingness is concentrated in specific cases (rows) or spread across variables.',
        action: "add-missing-pattern",
      },
      {
        title: "Add parallel coordinates",
        body: 'Click +Plot → "Parallel coordinates" and select all numeric variables (x, y, z). Cases with missing values appear as broken lines — they stop at the axis where data is missing.\n\nThis visualizes the "shadow" of missingness: you can see whether cases with missing x tend to have high or low y, which hints at whether data is Missing At Random (MAR) or Missing Not At Random (MNAR).',
        action: "add-parcoords-missing",
      },
      {
        title: "Impute with fixed value",
        body: 'In the Variable panel (left), click the gear icon next to a variable with NAs. Choose "Impute missing" → method "Fixed value" with value 0.\n\nAll NAs are replaced with 0. Look at the parallel coordinates — the imputed points cluster at 0, creating an artificial spike. This is the simplest imputation but it distorts distributions.',
      },
      {
        title: "Impute with conditional random",
        body: 'Now try imputation method "Conditional random" with a conditioning variable (e.g., group). This draws random values from the observed distribution within each group.\n\nThe imputed values are more plausible — they respect group structure. But they\'re still single draws. Change the imputation set index to see alternative draws — each one is different. This is imputation uncertainty: your conclusions depend on which values were drawn.',
      },
      {
        title: "The key lesson",
        body: "Single imputation hides uncertainty. Every imputed value is a guess, and different guesses lead to different analyses. The gold standard is multiple imputation — generate several complete datasets, analyze each, and pool results.\n\nIn tgobi, cycling through imputation sets lets you see this uncertainty visually. If your conclusions change across sets, they're sensitive to imputation — you should report that sensitivity.",
      },
    ],
  },
  {
    id: "synthetic-scag-cluster",
    title: "Scagnostics & Clustering on Synthetic Data",
    description: "Use scagnostics to screen for interesting pairs, then cluster to find groups automatically.",
    dataset: `${import.meta.env.BASE_URL}samples/synthetic-large.csv`,
    steps: [
      {
        title: "Welcome",
        body: "This synthetic dataset has 6000 points across 8 numeric variables (x1-x8), a true class, and a batch variable. It's large enough to make manual inspection of all 28 variable pairs impractical.\n\nScagnostics automates the screening: it scores each pair so you can focus on the interesting ones. Then clustering finds groups without labels.",
      },
      {
        title: "Run scagnostics",
        body: 'Go to the Scag tab. Select all 8 numeric variables (x1-x8) and click Run. After a moment, you\'ll see a table of all 28 pairs scored on 9 measures.\n\nSort by "clumpy" descending — the pairs with the highest clumpy scores are the ones most likely to show clusters. This is far faster than manually inspecting 28 scatterplots.',
        action: "run-scag-synthetic",
      },
      {
        title: "Filter and highlight",
        body: 'Set the filter to "clumpy ≥ 0.5" to highlight only the cluster-looking pairs. In the scatterplot matrix, highlighted cells get a tinted background proportional to the score.\n\nClick on a highlighted cell in the scatterplot matrix to jump to that pair. You\'ll see the cluster structure that scagnostics detected — without having to look at every pair.',
      },
      {
        title: "Cluster with k-means",
        body: 'Switch to the Cluster tab. Select all 8 numeric variables, method "k-means", k=4, and click Run. Then click "Paint clusters" to color the points by cluster assignment.\n\nThe scatterplot now shows the k-means clusters. Compare them to the true "class" variable — do the clusters match the known groups? Cluster 0 might correspond to "alpha", etc.',
        action: "run-kmeans-synthetic",
      },
      {
        title: "Check silhouette quality",
        body: "After clustering, the diagnostics panel shows the mean silhouette score and per-cluster means. A score above 0.5 is good, above 0.25 is OK, below 0.25 is bad.\n\nIf some clusters have low silhouette scores, try a different k or method. k-means assumes spherical clusters — if the true groups are elongated or overlapping, it may struggle.",
      },
      {
        title: "Try DBSCAN",
        body: 'Change the clustering method to "DBSCAN". Set eps=0.5 and minPts=5. DBSCAN finds clusters of arbitrary shape and labels sparse points as noise (cluster -1).\n\nDBSCAN doesn\'t require you to specify k — it discovers the number of clusters from density. The k-distance plot in diagnostics helps you choose eps: look for the "elbow" where distances jump sharply.',
      },
      {
        title: "Summary",
        body: "Scagnostics + clustering is a powerful combination:\n\n1. Scagnostics screens for interesting structure (clumpy, skinny, outlying pairs)\n2. Clustering quantifies that structure (assigns group labels)\n3. Silhouette diagnostics validate the clustering quality\n4. Painting clusters back onto plots lets you see them in context\n\nThis workflow scales to high-dimensional data where manual inspection is impossible.",
      },
    ],
  },
];
