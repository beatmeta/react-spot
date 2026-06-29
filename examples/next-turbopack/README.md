# react-spot Next.js Turbopack Demo

```bash
pnpm install
REACT_SPOT_EDITOR=cursor pnpm --filter react-spot-next-turbopack-demo dev -- --turbo
```

Open <http://localhost:3000> and Alt-click elements in the page.
Use Alt-right-click to open the ancestry menu and choose a parent component source.

The floating status panel shows which component/source metadata was found before the request is sent to `/__open-in-editor`.

This demo is wired as a pnpm workspace. The dashboard refresh button is imported from `examples/packages/ui`, so it exercises source resolution across a monorepo package boundary.
