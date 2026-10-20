import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { App } from "./app/App";

describe("PWA bootstrap", () => {
  it("renders the application heading and weekly planning screen", () => {
    const markup = renderToString(<App />);

    expect(markup).toContain("CrossFit");
    expect(markup).toContain("Planificación");
    expect(markup).toContain("Cargando");
  });
});
