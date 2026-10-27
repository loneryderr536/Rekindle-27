// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LogoShine } from "@/components/landing/LogoShine";

test("the wrapper carries the id and the art keeps its alt text", () => {
  const { container } = render(
    <LogoShine id="o26-hlogo" src="/landing/logo.png" width={360} height={410} alt="ONE·26 Rekindle" />,
  );
  expect(container.querySelector("#o26-hlogo")?.className).toContain("o26-logo-shine");
  expect(screen.getByAltText("ONE·26 Rekindle")).toBeTruthy();
});

test("the gloss layer is decorative and holds one sweeping shine", () => {
  const { container } = render(<LogoShine src="/landing/logo.png" width={360} height={410} alt="Logo" />);
  const sheen = container.querySelector(".o26-logo-sheen")!;
  expect(sheen.getAttribute("aria-hidden")).toBe("true");
  expect(sheen.querySelectorAll(".lg-shine").length).toBe(1);
});
