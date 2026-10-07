import { describe, expect, it } from "vitest";
import { aboutCopy } from "@/features/public-site/about-content";

describe("aboutCopy", () => {
  it("keeps plain text unchanged", () => {
    expect(aboutCopy("A welcoming studio.")).toBe("A welcoming studio.");
  });

  it("extracts owner copy from object-backed website sections", () => {
    expect(aboutCopy({ title: "Our story", body: "A welcoming studio.", image_path: "about/photo.webp" })).toBe("A welcoming studio.");
  });

  it("reads nested and array-based text without rendering objects as text", () => {
    expect(aboutCopy({ story: { paragraphs: ["First paragraph.", "Second paragraph."] } })).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("returns empty text for unsupported values", () => {
    expect(aboutCopy({ enabled: false, image_path: "about/photo.webp" })).toBe("");
  });
});
