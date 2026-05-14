import { createRoot } from "react-dom/client";
import { App } from "./App";

// No StrictMode — react-force-graph-3d's internal layout state doesn't
// survive React 18's dev-mode double-mount; the second mount races with
// the first one's pending RAF and crashes with "state.layout is undefined".
createRoot(document.getElementById("root")!).render(<App />);
