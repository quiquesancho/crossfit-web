import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProgressScreen } from "./ProgressScreen";

vi.mock("../personal-records/PersonalRecordsScreen", () => ({
  PersonalRecordsScreen: () => <p>Panel de marcas</p>,
}));

vi.mock("./VolumeScreen", () => ({
  VolumeScreen: () => <p>Panel de volumen</p>,
}));

describe("ProgressScreen", () => {
  afterEach(() => cleanup());

  it("switches between marks and volume", () => {
    render(<ProgressScreen />);

    expect(screen.getByText("Panel de marcas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcas" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Volumen" }));

    expect(screen.getByText("Panel de volumen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Volumen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
