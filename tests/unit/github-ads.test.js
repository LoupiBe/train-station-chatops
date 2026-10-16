/**
 * tests/unit/github-ads.test.js
 * Integration unit test suite for GitHub REST API handlers for advertisement banners:
 * - uploadAdToGitHub (new uploads & updates of existing files with SHA)
 * - disableAdOnGitHub (safe renaming commit + delete, handling pre-existing disabled file)
 * - listAdsFromGitHub (active vs disabled status, empty directory handling)
 * - functions/api/confirm.js integration for upload_ad and disable_ad
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  uploadAdToGitHub,
  disableAdOnGitHub,
  listAdsFromGitHub,
  parseGitHubApiError,
} from "../../functions/api/_lib/github.js";
import { onRequestPost } from "../../functions/api/confirm.js";

const originalFetch = global.fetch;

describe("GitHub REST API Helpers for Advertisements", () => {
  const mockEnv = {
    GITHUB_TOKEN: "mock-gh-token",
    GITHUB_OWNER: "train-station",
    GITHUB_REPO: "train-station-timetable",
    GITHUB_BRANCH: "main",
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("uploadAdToGitHub", () => {
    test("uploads new ad when file does not already exist (GET returns 404)", async () => {
      const calls = [];
      global.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || "GET", headers: options.headers, body: options.body });
        if (options.method === "GET" || !options.method) {
          // File check returns 404 (does not exist yet)
          return {
            ok: false,
            status: 404,
            json: async () => ({ message: "Not Found" }),
          };
        }
        if (options.method === "PUT") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              commit: { sha: "commit-sha-123" },
              content: { sha: "blob-sha-456" },
            }),
          };
        }
        throw new Error(`Unexpected request: ${options.method} ${url}`);
      };

      const result = await uploadAdToGitHub(mockEnv, {
        filename: "15-20261031-F-test.webp",
        contentBase64: "data:image/webp;base64,UklGRiQAAABXRUJQ",
        authorEmail: "test@station.be",
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.commitSha, "commit-sha-123");
      assert.strictEqual(result.fileSha, "blob-sha-456");
      assert.strictEqual(result.filename, "15-20261031-F-test.webp");

      // Verify PUT call did not have body.sha
      const putCall = calls.find((c) => c.method === "PUT");
      assert.ok(putCall);
      const parsedBody = JSON.parse(putCall.body);
      assert.strictEqual(parsedBody.sha, undefined, "New upload must not send sha");
      assert.strictEqual(parsedBody.content, "UklGRiQAAABXRUJQ");
      assert.ok(parsedBody.message.includes("test@station.be"));
    });

    test("updates existing ad with SHA when file already exists (GET returns 200)", async () => {
      const calls = [];
      global.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || "GET", headers: options.headers, body: options.body });
        if (options.method === "GET" || !options.method) {
          // File check returns 200 with existing SHA
          return {
            ok: true,
            status: 200,
            json: async () => ({ sha: "existing-blob-sha-999" }),
          };
        }
        if (options.method === "PUT") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              commit: { sha: "commit-sha-new" },
              content: { sha: "blob-sha-updated" },
            }),
          };
        }
      };

      const result = await uploadAdToGitHub(mockEnv, {
        filename: "15-test.webp",
        contentBase64: "UklGRiQAAABXRUJQ",
      });

      assert.strictEqual(result.success, true);
      const putCall = calls.find((c) => c.method === "PUT");
      assert.ok(putCall);
      const parsedBody = JSON.parse(putCall.body);
      assert.strictEqual(parsedBody.sha, "existing-blob-sha-999", "Updating existing file must provide existing sha");
    });

    test("throws CONFIG_ERROR when environment bindings are missing", async () => {
      await assert.rejects(
        uploadAdToGitHub({}, { filename: "15-test.webp", contentBase64: "b64" }),
        (err) => err.code === "CONFIG_ERROR"
      );
    });

    test("throws GITHUB_ERROR on GitHub API rejection", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await assert.rejects(
        uploadAdToGitHub(mockEnv, { filename: "15-test.webp", contentBase64: "b64" }),
        (err) => err.code === "GITHUB_ERROR" && err.status === 500
      );
    });
  });

  describe("disableAdOnGitHub", () => {
    test("safely creates disabled-[filename] and deletes original file", async () => {
      const calls = [];
      global.fetch = async (url, options = {}) => {
        const method = options.method || "GET";
        calls.push({ url, method, body: options.body });

        if (method === "GET") {
          if (url.includes("disabled-")) {
            // Disabled file check returns 404 (does not exist yet)
            return { ok: false, status: 404, json: async () => ({}) };
          }
          // Original file fetch returns existing file
          return {
            ok: true,
            status: 200,
            json: async () => ({
              sha: "original-file-sha",
              content: "WVdSdGFXNW5hVzVoYldGMGFXOXU=\n", // Base64 content
            }),
          };
        }
        if (method === "PUT") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              commit: { sha: "commit-sha-disabled" },
              content: { sha: "blob-sha-disabled" },
            }),
          };
        }
        if (method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ commit: { sha: "commit-sha-delete" } }),
          };
        }
      };

      const res = await disableAdOnGitHub(mockEnv, {
        filename: "4-logo_laStation.webp",
        authorEmail: "kiosk@station.be",
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.oldFilename, "4-logo_laStation.webp");
      assert.strictEqual(res.newFilename, "disabled-4-logo_laStation.webp");
      assert.strictEqual(res.commitSha, "commit-sha-disabled");

      const putCall = calls.find((c) => c.method === "PUT");
      assert.ok(putCall);
      assert.ok(putCall.url.includes("disabled-4-logo_laStation.webp"));
      const putBody = JSON.parse(putCall.body);
      assert.strictEqual(putBody.content, "WVdSdGFXNW5hVzVoYldGMGFXOXU=");

      const deleteCall = calls.find((c) => c.method === "DELETE");
      assert.ok(deleteCall);
      assert.ok(deleteCall.url.includes("4-logo_laStation.webp"));
      const deleteBody = JSON.parse(deleteCall.body);
      assert.strictEqual(deleteBody.sha, "original-file-sha");
    });

    test("handles re-disabling when disabled-[filename] already exists by supplying its SHA", async () => {
      global.fetch = async (url, options = {}) => {
        const method = options.method || "GET";
        if (method === "GET") {
          if (url.includes("disabled-")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ sha: "existing-disabled-sha" }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ sha: "orig-sha", content: "b64content" }),
          };
        }
        if (method === "PUT") {
          const body = JSON.parse(options.body);
          assert.strictEqual(body.sha, "existing-disabled-sha");
          return { ok: true, status: 200, json: async () => ({ commit: { sha: "put-sha" } }) };
        }
        if (method === "DELETE") {
          return { ok: true, status: 200, json: async () => ({}) };
        }
      };

      const res = await disableAdOnGitHub(mockEnv, { filename: "20-ad.jpg" });
      assert.strictEqual(res.success, true);
    });

    test("throws NOT_FOUND when target ad to disable does not exist on GitHub", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 404,
        json: async () => ({ message: "Not Found" }),
      });

      await assert.rejects(
        disableAdOnGitHub(mockEnv, { filename: "15-inexistant.webp" }),
        (err) => err.code === "NOT_FOUND" && err.status === 404
      );
    });
  });

  describe("listAdsFromGitHub", () => {
    test("lists ads and correctly flags active vs disabled files", async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [
          { name: "4-logo_laStation.webp", path: "public/ads/4-logo_laStation.webp", size: 12000, type: "file", download_url: "url1" },
          { name: "disabled-20-randotourix.jpg", path: "public/ads/disabled-20-randotourix.jpg", size: 25000, type: "file", download_url: "url2" },
          { name: "off-old.png", path: "public/ads/off-old.png", size: 10000, type: "file", download_url: "url3" },
          { name: "_archived.webp", path: "public/ads/sub", size: 5000, type: "file", download_url: "url4" },
          { name: "subfolder", path: "public/ads/subfolder", size: 0, type: "dir" },
        ],
      });

      const ads = await listAdsFromGitHub(mockEnv);
      assert.strictEqual(ads.length, 4, "must filter out directories");

      const activeAd = ads.find((a) => a.name === "4-logo_laStation.webp");
      assert.strictEqual(activeAd.active, true);
      assert.strictEqual(activeAd.disabled, false);

      const disabledAd = ads.find((a) => a.name === "disabled-20-randotourix.jpg");
      assert.strictEqual(disabledAd.active, false);
      assert.strictEqual(disabledAd.disabled, true);

      const offAd = ads.find((a) => a.name === "off-old.png");
      assert.strictEqual(offAd.disabled, true);
    });

    test("returns empty array on 404 directory", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 404,
      });

      const ads = await listAdsFromGitHub(mockEnv);
      assert.deepStrictEqual(ads, []);
    });
  });

  describe("functions/api/confirm.js Ad Endpoints Integration", () => {
    const validWebpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]).toString("base64");

    test("executes upload_ad without requiring timetable SHA", async () => {
      global.fetch = async (url, options = {}) => {
        if (!options.method || options.method === "GET") {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({
            commit: { sha: "commit-upload-123" },
            content: { sha: "file-sha-456" },
          }),
        };
      };

      const req = {
        json: async () => ({
          action: "upload_ad",
          payload: {
            filename: "15-20261031-F-menu.webp",
            content: validWebpHeader,
          },
        }),
        headers: {
          get: (name) => (name === "cf-access-authenticated-user-email" ? "manager@station.be" : null),
        },
      };

      const res = await onRequestPost({ request: req, env: mockEnv });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.filename, "15-20261031-F-menu.webp");
    });

    test("executes disable_ad without requiring timetable SHA", async () => {
      global.fetch = async (url, options = {}) => {
        const method = options.method || "GET";
        if (method === "GET") {
          if (url.includes("disabled-")) {
            return { ok: false, status: 404, json: async () => ({}) };
          }
          return { ok: true, status: 200, json: async () => ({ sha: "old-sha", content: "b64" }) };
        }
        return { ok: true, status: 200, json: async () => ({ commit: { sha: "disable-sha" } }) };
      };

      const req = {
        json: async () => ({
          action: "disable_ad",
          payload: {
            filename: "4-logo_laStation.webp",
          },
        }),
        headers: { get: () => null },
      };

      const res = await onRequestPost({ request: req, env: mockEnv });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.newFilename, "disabled-4-logo_laStation.webp");
    });

    test("rejects upload_ad with invalid filename (400 Bad Request)", async () => {
      const req = {
        json: async () => ({
          action: "upload_ad",
          payload: {
            filename: "INVALID-NAME.webp",
            content: validWebpHeader,
          },
        }),
      };

      const res = await onRequestPost({ request: req, env: mockEnv });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.code, "INVALID_ACTION_PAYLOAD");
    });
  });

  describe("disableAdOnGitHub Web API btoa Fallback", () => {
    test("falls back to download_url and btoa when Buffer is undefined", async () => {
      const originalBuffer = global.Buffer;
      try {
        // Temporarily simulate environment without Buffer (e.g. Cloudflare Workers)
        delete global.Buffer;

        global.fetch = async (url, options = {}) => {
          const method = options.method || "GET";
          if (method === "GET") {
            if (url.includes("download.github.com")) {
              return {
                ok: true,
                status: 200,
                arrayBuffer: async () => new Uint8Array([87, 69, 66, 80]).buffer, // "WEBP"
              };
            }
            if (url.includes("disabled-")) {
              return { ok: false, status: 404, json: async () => ({}) };
            }
            // Returns file without content but with download_url
            return {
              ok: true,
              status: 200,
              json: async () => ({
                sha: "blob-sha-large",
                download_url: "https://download.github.com/large-ad.webp",
              }),
            };
          }
          if (method === "PUT") {
            const body = JSON.parse(options.body);
            assert.strictEqual(body.content, btoa("WEBP"));
            return { ok: true, status: 200, json: async () => ({ commit: { sha: "disabled-commit-sha" } }) };
          }
          if (method === "DELETE") {
            return { ok: true, status: 200, json: async () => ({}) };
          }
        };

        const result = await disableAdOnGitHub(mockEnv, { filename: "15-large.webp" });
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.newFilename, "disabled-15-large.webp");
      } finally {
        global.Buffer = originalBuffer;
      }
    });
  });

  describe("GitHub API Error Handling & Status Codes (401, 403, 404)", () => {
    test("parseGitHubApiError identifies 401, 403 rate limit, 403 branch protection, and 404", async () => {
      // 401
      const res401 = { status: 401, text: async () => JSON.stringify({ message: "Bad credentials" }) };
      const err401 = await parseGitHubApiError(res401);
      assert.strictEqual(err401.status, 401);
      assert.strictEqual(err401.code, "GITHUB_AUTH_ERROR");
      assert.ok(err401.message.includes("GITHUB_TOKEN"));

      // 403 Rate Limit
      const res403Rate = { status: 403, text: async () => JSON.stringify({ message: "API rate limit exceeded for user" }) };
      const err403Rate = await parseGitHubApiError(res403Rate);
      assert.strictEqual(err403Rate.status, 403);
      assert.strictEqual(err403Rate.code, "GITHUB_RATE_LIMIT");
      assert.ok(err403Rate.message.includes("rate limit"));

      // 403 Protected Branch
      const res403Branch = { status: 403, text: async () => JSON.stringify({ message: "Protected branch rules not met" }) };
      const err403Branch = await parseGitHubApiError(res403Branch);
      assert.strictEqual(err403Branch.status, 403);
      assert.strictEqual(err403Branch.code, "GITHUB_BRANCH_PROTECTED");
      assert.ok(err403Branch.message.includes("protégée"));

      // 403 Generic Forbidden
      const res403Generic = { status: 403, text: async () => JSON.stringify({ message: "Resource not accessible by token" }) };
      const err403Generic = await parseGitHubApiError(res403Generic);
      assert.strictEqual(err403Generic.status, 403);
      assert.strictEqual(err403Generic.code, "GITHUB_FORBIDDEN");

      // 404 Not Found
      const res404 = { status: 404, text: async () => JSON.stringify({ message: "Not Found" }) };
      const err404 = await parseGitHubApiError(res404);
      assert.strictEqual(err404.status, 404);
      assert.strictEqual(err404.code, "NOT_FOUND");
    });

    test("uploadAdToGitHub propagates 401 GITHUB_AUTH_ERROR", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: "Bad credentials" }),
      });

      await assert.rejects(
        uploadAdToGitHub(mockEnv, { filename: "15-test.webp", contentBase64: "b64" }),
        (err) => err.code === "GITHUB_AUTH_ERROR" && err.status === 401
      );
    });

    test("uploadAdToGitHub propagates 403 GITHUB_RATE_LIMIT", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: "API rate limit exceeded" }),
      });

      await assert.rejects(
        uploadAdToGitHub(mockEnv, { filename: "15-test.webp", contentBase64: "b64" }),
        (err) => err.code === "GITHUB_RATE_LIMIT" && err.status === 403
      );
    });

    test("disableAdOnGitHub propagates 403 GITHUB_BRANCH_PROTECTED", async () => {
      global.fetch = async (url, options = {}) => {
        const method = options.method || "GET";
        if (method === "GET") {
          return { ok: true, status: 200, json: async () => ({ sha: "sha-1", content: "b64" }) };
        }
        if (method === "PUT") {
          return {
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ message: "Protected branch rules not met" }),
          };
        }
      };

      await assert.rejects(
        disableAdOnGitHub(mockEnv, { filename: "15-test.webp" }),
        (err) => err.code === "GITHUB_BRANCH_PROTECTED" && err.status === 403
      );
    });

    test("confirm.js propagates 401 GITHUB_AUTH_ERROR for upload_ad", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: "Bad credentials" }),
      });

      const validWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]).toString("base64");
      const req = {
        json: async () => ({
          action: "upload_ad",
          payload: { filename: "15-test.webp", content: validWebp },
        }),
      };

      const res = await onRequestPost({ request: req, env: mockEnv });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.code, "GITHUB_AUTH_ERROR");
      assert.ok(data.error.includes("GITHUB_TOKEN"));
    });

    test("confirm.js propagates 403 GITHUB_RATE_LIMIT for disable_ad", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: "API rate limit exceeded" }),
      });

      const req = {
        json: async () => ({
          action: "disable_ad",
          payload: { filename: "4-logo_laStation.webp" },
        }),
      };

      const res = await onRequestPost({ request: req, env: mockEnv });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.code, "GITHUB_RATE_LIMIT");
      assert.ok(data.error.includes("rate limit"));
    });
  });
});

