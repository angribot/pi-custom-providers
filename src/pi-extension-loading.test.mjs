import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const extensionPath = fileURLToPath(new URL("../index.ts", import.meta.url));
const basePiArgs = [
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-themes",
  "--no-context-files",
];

test("[host integration] completes Pre-Scope Discovery during cache-only init", async () => {
  const home = mkdtempSync(join(tmpdir(), "custom-providers-pi-scope-"));
  let catalogRequests = 0;
  const server = createServer((request, response) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404).end();
      return;
    }
    catalogRequests++;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "test-model" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let child;
  try {
    const agentDir = join(home, ".pi", "agent");
    const cwd = join(home, "work");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}/v1`;
    writeFileSync(join(agentDir, "custom-providers.json"), JSON.stringify({
      loaderTest: { baseUrl, api: "openai-responses" },
    }));
    writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
      loaderTest: { type: "api_key", key: "test-loader-key" },
    }));

    const env = { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agentDir };
    delete env.PI_OFFLINE;
    child = spawn(
      "pi",
      [
        ...basePiArgs,
        "--extension",
        extensionPath,
        "--list-models",
        "loaderTest",
      ],
      { cwd, env },
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    const status = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Pi list-models timed out. stdout=${output} stderr=${errorOutput}`));
      }, 15_000);
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    assert.equal(status, 0, errorOutput || output);
    assert.match(output, /test-model/);
    assert.equal(catalogRequests, 1);
    const stored = JSON.parse(readFileSync(join(agentDir, "models-store.json"), "utf8"));
    assert.deepEqual(stored.loaderTest.models.map(({ id }) => id), ["test-model"]);
  } finally {
    child?.kill("SIGTERM");
    await new Promise((resolve) => server.close(resolve));
    rmSync(home, { recursive: true, force: true });
  }
});

test("[host integration] Pi serves a stored catalog through the dynamic provider", () => {
  const home = mkdtempSync(join(tmpdir(), "custom-providers-pi-loader-"));
  try {
    const agentDir = join(home, ".pi", "agent");
    mkdirSync(agentDir, { recursive: true });
    const baseUrl = "https://provider.invalid/v1";
    writeFileSync(join(agentDir, "custom-providers.json"), JSON.stringify({
      loaderTest: { baseUrl, api: "openai-responses" },
    }));
    writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
      loaderTest: { type: "api_key", key: "test-key" },
    }));
    // Seed Pi's provider-scoped store so the offline refresh serves it back.
    writeFileSync(join(agentDir, "models-store.json"), JSON.stringify({
      loaderTest: {
        checkedAt: Date.now(),
        models: [{
          id: "loader-model",
          name: "loader-model",
          api: "openai-responses",
          provider: "loaderTest",
          baseUrl,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 4_096,
        }],
      },
    }));

    const result = spawnSync(
      "pi",
      [
        ...basePiArgs,
        "--extension",
        extensionPath,
        "--list-models",
        "loaderTest",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          PI_CODING_AGENT_DIR: agentDir,
          PI_OFFLINE: "1",
        },
      },
    );

    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /loader-model/);

    const stored = JSON.parse(readFileSync(join(agentDir, "models-store.json"), "utf8"));
    assert.deepEqual(stored.loaderTest.models.map(({ id }) => id), ["loader-model"]);
    assert.equal(stored.loaderTest.models[0].provider, "loaderTest");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
