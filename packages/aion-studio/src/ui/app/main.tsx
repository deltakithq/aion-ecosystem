import { createRoot } from "react-dom/client";
import { StudioConsole } from "./app";
import "./styles.css";

const root = document.getElementById("aion-ui");

if (root !== null) {
  createRoot(root).render(<StudioConsole />);
}
