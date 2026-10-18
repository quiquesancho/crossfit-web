import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { App } from "./App";

describe("PWA bootstrap", () => {
  it("renders the application heading", () => {
    expect(renderToString(<App />)).toContain("CrossFit");
  });
});
