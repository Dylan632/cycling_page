import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const CURRENT_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);
const DIVERGED_SHA = 'c'.repeat(40);

const runNode = (args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

// Serves just the two GitHub endpoints the gate reads, so the decision can be
// exercised without the API or a real branch.
const createGitHubStub = ({ headSha, status }) =>
  createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const send = (payload) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(payload));
    };
    if (path === '/repos/owner/repo/branches/master') {
      send({ name: 'master', commit: { sha: headSha } });
      return;
    }
    if (path.startsWith('/repos/owner/repo/compare/')) {
      send({ status });
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });

const withStub = async (stubOptions, run) => {
  const server = createGitHubStub(stubOptions);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
};

const runGate = async ({ apiOrigin, extraArgs = [], env = {} }) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'supersede-'));
  const outputPath = join(outputDirectory, 'github-output');
  try {
    const result = await runNode(
      [
        'scripts/check-master-superseded.mjs',
        '--repository',
        'owner/repo',
        '--sha',
        CURRENT_SHA,
        '--branch',
        'master',
        ...extraArgs,
      ],
      {
        env: {
          GITHUB_TOKEN: 'test-token',
          GITHUB_API_URL: apiOrigin,
          GITHUB_OUTPUT: outputPath,
          ...env,
        },
      }
    );
    let output = '';
    try {
      output = await readFile(outputPath, 'utf8');
    } catch {
      output = '';
    }
    return { ...result, output };
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
};

test('an unchanged master leaves the deployment current', async () => {
  const result = await withStub({ headSha: CURRENT_SHA }, (apiOrigin) =>
    runGate({ apiOrigin })
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.output, /^superseded=false$/m);
  assert.match(result.stdout, /is still current/);
});

test('a fast-forwarded master supersedes the deployment cleanly', async () => {
  const result = await withStub(
    { headSha: NEWER_SHA, status: 'ahead' },
    (apiOrigin) => runGate({ apiOrigin })
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.output, /^superseded=true$/m);
  assert.match(result.output, new RegExp(`^head_sha=${NEWER_SHA}$`, 'm'));
  assert.match(result.stdout, /newer commit already supersedes/);
});

test('a diverged master never counts as superseded', async () => {
  const result = await withStub(
    { headSha: DIVERGED_SHA, status: 'diverged' },
    (apiOrigin) => runGate({ apiOrigin })
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.output, /^superseded=false$/m);
  assert.match(result.stdout, /diverged/);
});

test('requiring a current SHA exits 3 only when a newer commit wins', async () => {
  const superseded = await withStub(
    { headSha: NEWER_SHA, status: 'ahead' },
    (apiOrigin) => runGate({ apiOrigin, extraArgs: ['--require-current'] })
  );
  assert.equal(superseded.code, 3, superseded.stderr);

  const current = await withStub({ headSha: CURRENT_SHA }, (apiOrigin) =>
    runGate({ apiOrigin, extraArgs: ['--require-current'] })
  );
  assert.equal(current.code, 0, current.stderr);

  const diverged = await withStub(
    { headSha: DIVERGED_SHA, status: 'diverged' },
    (apiOrigin) => runGate({ apiOrigin, extraArgs: ['--require-current'] })
  );
  assert.equal(diverged.code, 0, diverged.stderr);
});

test('the gate fails closed when GitHub cannot be read', async () => {
  const result = await runGate({
    apiOrigin: 'http://127.0.0.1:1',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /supersession check failed closed/);
  assert.equal(result.output, '');
});

test('the gate rejects a SHA that is not a full commit id', async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'scripts/check-master-superseded.mjs',
        '--repository',
        'owner/repo',
        '--sha',
        'abc123',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, GITHUB_TOKEN: 'test-token' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /40 hexadecimal characters/);
});
