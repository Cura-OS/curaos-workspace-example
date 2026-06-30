# @curaos/canvas — Agent Context

## Quick facts
- Two modes: builder (drag-drop) + node-graph (directed graph)
- Drag-drop: @dnd-kit/core; node-graph: custom SVG renderer
- Undo/redo: Immer patch history; 50-step min
- Web-only (React); no React Native target

## Key files
- `src/builder/BuilderCanvas.tsx` — builder canvas component
- `src/graph/NodeGraphCanvas.tsx` — node-graph canvas component
- `src/hooks/useBuildDoc.ts` — Zustand + Immer builder state
- `src/hooks/useNodeGraph.ts` — Zustand + Immer graph state
- `src/types/builder.ts` — BuilderNode, BuilderEdge, PaletteItem
- `src/types/graph.ts` — NodeGraphNode, NodeGraphEdge
- `src/actions.ts` — addNode, removeNode, connectEdge, undo, redo

## Agent rules
- No business logic in canvas; it receives data and dispatches actions only.
- Node/edge data shapes must be versioned; document schema changes in changelog.
- Both canvas modes must be tree-shakeable (consumer imports only the mode they use).
- Run `bunx turbo run build lint test storybook:build` before marking done.
