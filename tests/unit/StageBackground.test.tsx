// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { StageBackground } from "@/components/StageBackground";

test("the stage is decorative and holds three drifting glows and one sheen", () => {
  const { container } = render(<StageBackground />);
  const stage = screen.getByTestId("stage-background");
  expect(stage.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelectorAll(".o26-glow").length).toBe(3);
  expect(container.querySelectorAll(".o26-sheen").length).toBe(1);
});
