import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("extension manifest", () => {
  it("declares the Google Calendar side-panel capabilities", async () => {
    const manifest = JSON.parse(
      await readFile(path.resolve("public/manifest.json"), "utf8"),
    ) as {
      minimum_chrome_version?: unknown;
      permissions?: unknown;
    };

    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["sidePanel", "tabs"]),
    );
  });

  it("includes a stable public key for a consistent unpacked extension ID", async () => {
    const manifest = JSON.parse(
      await readFile(path.resolve("public/manifest.json"), "utf8"),
    ) as { key?: unknown };

    expect(manifest.key).toEqual(expect.any(String));
    expect(manifest.key).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

    const hash = createHash("sha256")
      .update(Buffer.from(manifest.key as string, "base64"))
      .digest();
    const extensionId = [...hash.subarray(0, 16)]
      .flatMap((byte) => [byte >> 4, byte & 0x0f])
      .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
      .join("");

    expect(extensionId).toBe("bfengchfabdjhbipmfdgbboffkccmlml");
  });
});
