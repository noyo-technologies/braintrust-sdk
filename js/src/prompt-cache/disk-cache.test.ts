import * as fs from "fs/promises";
import * as path from "path";
import { DiskCache } from "./disk-cache";
import { tmpdir } from "os";
import { beforeEach, describe, it, afterEach, expect } from "vitest";
import { configureNode } from "../node";
import iso from "../isomorph";

describe("DiskCache", () => {
  configureNode();

  let cacheDir: string;
  let cache: DiskCache<any>;

  beforeEach(async () => {
    cacheDir = path.join(tmpdir(), `disk-cache-test-${Date.now()}`);
    cache = new DiskCache({ cacheDir, max: 3 });
  });

  afterEach(async () => {
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore errors if directory doesn't exist.
    }
  });

  it("should handle odd project names", async () => {
    const names = [
      ".",
      "..",
      "/a/b/c",
      "my\0file.txt",
      "file*.txT",
      "what?.txt",
      " asdf ",
      "invalid/name",
      "my<file>.txt",
    ];

    cache = new DiskCache({ cacheDir });
    for (const name of names) {
      await cache.set(name, { foo: "bar" });
      const result = await cache.get(name);
      expect(result).toEqual({ foo: "bar" });
    }
  });

  it("should store and retrieve values", async () => {
    const testData = { foo: "bar" };
    await cache.set("test-key", testData);
    const result = await cache.get("test-key");
    expect(result).toEqual(testData);
  });

  it("should return undefined for missing keys", async () => {
    const result = await cache.get("missing-key");
    expect(result).toBeUndefined();
  });

  it("should evict oldest entries when cache is full", async () => {
    // Fill cache beyond max size (3).
    for (let i = 0; i < 3; i++) {
      await cache.set(`key${i}`, { value: i });
      // Wait to ensure different mtimes.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Add one more to trigger eviction.
    await cache.set("key3", { value: 3 });

    // The oldest entry should be evicted.
    const result = await cache.get("key0");
    expect(result).toBeUndefined();

    // Newer entries should still exist.
    const newer = await cache.get("key2");
    expect(newer).toEqual({ value: 2 });
  });

  it("should never throw when write fails", async () => {
    // Make cache directory read-only.
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.chmod(cacheDir, 0o444);

    // Should throw when write fails.
    await cache.set("test", { foo: "bar" });
    const result = await cache.get("test");
    expect(result).toBeUndefined();
  });

  it("should throw on corrupted data", async () => {
    await cache.set("test-key", { foo: "bar" });

    // Corrupt the file.
    const filePath = cache.getEntryPath("test-key");
    await fs.writeFile(filePath, "invalid data");

    // Should throw on corrupted data.
    const result = await cache.get("test-key");
    expect(result).toBeUndefined();
  });
});
