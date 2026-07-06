import { describe, expect, it } from "vitest";

import { classifyTarget } from "./classifyTarget";

describe("classifyTarget", () => {
  it("returns empty string for blank input", () => {
    expect(classifyTarget("")).toBe("");
    expect(classifyTarget("   ")).toBe("");
  });

  it("canonicalizes raw arXiv ids", () => {
    expect(classifyTarget("arxiv:2401.00001")).toBe("arxiv:2401.00001");
    expect(classifyTarget("2401.00001")).toBe("arxiv:2401.00001");
    expect(classifyTarget("2401.00001v2")).toBe("arxiv:2401.00001v2");
  });

  it("extracts arXiv ids from abs/pdf URLs", () => {
    expect(classifyTarget("https://arxiv.org/abs/2401.00001")).toBe(
      "arxiv:2401.00001",
    );
    expect(classifyTarget("https://arxiv.org/pdf/2401.00001v2.pdf")).toBe(
      "arxiv:2401.00001v2",
    );
    expect(classifyTarget("http://www.arxiv.org/abs/hep-th/0301001")).toBe(
      "arxiv:hep-th/0301001",
    );
  });

  it("canonicalizes DOIs in raw and URL form", () => {
    expect(classifyTarget("10.1038/nature12345")).toBe(
      "doi:10.1038/nature12345",
    );
    expect(classifyTarget("doi:10.1038/nature12345")).toBe(
      "doi:10.1038/nature12345",
    );
    expect(classifyTarget("https://doi.org/10.1038/nature12345")).toBe(
      "doi:10.1038/nature12345",
    );
    expect(classifyTarget("https://dx.doi.org/10.1038/nature12345")).toBe(
      "doi:10.1038/nature12345",
    );
  });

  it("passes plain URLs through with the url: scheme", () => {
    expect(classifyTarget("https://example.com/paper")).toBe(
      "url:https://example.com/paper",
    );
  });

  it("falls back to url: for unrecognized input", () => {
    expect(classifyTarget("some random words")).toBe("url:some random words");
  });

  it("trims surrounding whitespace before classifying", () => {
    expect(classifyTarget("  arxiv:2401.00001  ")).toBe("arxiv:2401.00001");
  });
});
