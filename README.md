# tgobi

A modern TypeScript port of [ggobi](https://ggobi.org/) — interactive
visualisation of high-dimensional data, in your browser.

Status: **M4+ (tour engine + projection pursuit)** complete — the
projection moves. 1D and 2D tours of any subset of numeric variables are
animated in a Web Worker, with a variable-circle widget, saved views, and
projection-pursuit goals for Holes, Central Mass, PCA variance, and
Kurtosis, plus LDA when a categorical class variable is available.

## Develop

```bash
npm install
npm run dev          # start Vite at http://localhost:5173
npm test             # unit tests
npm run test:e2e     # Playwright smoke
npm run typecheck
npm run build        # standalone app + embeddable package build
```

## Command line

After installing the package, launch the standalone browser app with:

```bash
tgobi
```

Useful options:

```bash
tgobi --port 8787
tgobi --host 0.0.0.0 --no-open
```

From this repository, build first and then run the local CLI:

```bash
npm run build
node bin/tgobi.js
```

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

You can also pass a `DataFrame`-compatible object as `data`:

```tsx
<Tgobi data={myDataFrame} />
```

## Publish To npm

1. Decide the package name. This repo is configured as `tgobi`, but you should verify that name is available on npm; if not, change `package.json` to a scoped name such as `@fcela/tgobi`.
2. Add or confirm the license metadata before publishing.
3. Run the release checks:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run pack:check
```

4. Log in and publish:

```bash
npm login
npm publish --access public
```

For a scoped private package, use your organization scope and omit
`--access public` if your npm plan supports private packages.

## Try it

After `npm run dev`, click a sample dataset (flea / olive / places /
large). Use
**+ Plot** in the toolbar to add a scatter, scatmat, parcoords, dotplot,
or barchart. Drag-brush in any panel to highlight rows in every linked
panel; choose brush colour/shape, and check **Persistent** to paint
subgroups; set
**Color** to **by variable** to colour by species or any column; use
**Selection → Exclude** to ghost outliers. In the right panel, pick
variables and **Start** the tour to watch the projection rotate through
high-D space. Switch **Mode** to **Projection pursuit** to move toward a
selected PP goal; for **LDA**, choose the categorical class variable in
the **Class** control. Pause when you spot something interesting and
**Save** the view to jump back later.
