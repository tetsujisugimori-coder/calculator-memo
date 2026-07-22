import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "../app/globals.css";
import "./pages.css";
import { CalculatorApp } from "../components/CalculatorApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <CalculatorApp />
  </StrictMode>,
);
