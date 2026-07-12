import { describe, it, expect } from "vitest";
import { UploadValidationError } from "../src/index";

describe("UploadValidationError", () => {
  it("carries the kind and a stable i18n messageKey", () => {
    const err = new UploadValidationError("FileTooLarge");
    expect(err.kind).toBe("FileTooLarge");
    expect(err.messageKey).toBe("imageGuard.error.fileTooLarge");
    expect(err.name).toBe("UploadValidationError");
  });

  it("is a real Error subclass (instanceof works)", () => {
    const err = new UploadValidationError("BadMime");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UploadValidationError);
  });

  it("preserves the original cause when given", () => {
    const cause = new Error("root");
    const err = new UploadValidationError("DecodeFailed", cause);
    expect(err.cause).toBe(cause);
  });
});
