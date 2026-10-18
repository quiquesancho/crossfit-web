import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import { CatalogScreen } from "./CatalogScreen";

describe("CatalogScreen", () => {
  it("renders the loading state before data is fetched", () => {
    expect(renderToString(<CatalogScreen />)).toContain("Cargando");
  });
});
