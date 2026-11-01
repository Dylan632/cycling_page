#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SUPERSEDED_EXIT_CODE = 3;

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    if (key === '--require-current') {
      args['require-current'] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
};

const fetchJson = async (url, token) => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'cycling-page-production-gate/1',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned HTTP ${response.status}`);
  }
  return response.json();
};

/**
 * Report whether a newer commit on the branch already owns this deployment.
 *
 * A code push and the publication pipeline both deploy the same Vercel project,
 * so a push that triggers a publication is still building when that pipeline
 * publishes a newer commit. Only a strict fast-forward counts as superseded:
 * a diverged or unreadable branch keeps `superseded` false so the caller still
 * fails closed instead of guessing.
 */
export const checkMasterSuperseded = async ({
  repository,
  sha,
  branch = 'master',
  token,
  apiOrigin = 'https://api.github.com',
}) => {
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('repository must be in owner/name form');
  }
  if (!SHA_PATTERN.test(sha ?? '')) {
    throw new Error(
      'source SHA must contain exactly 40 hexadecimal characters'
    );
  }

  const encodedRepository = repository
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const apiBase = new URL(apiOrigin);
  const branchInfo = await fetchJson(
    new URL(
      `/repos/${encodedRepository}/branches/${encodeURIComponent(branch)}`,
      apiBase
    ),
    token
  );
  const headSha = branchInfo?.commit?.sha;
  if (!SHA_PATTERN.test(headSha ?? '')) {
    throw new Error(`GitHub returned no head commit for ${branch}`);
  }
  if (headSha.toLowerCase() === sha.toLowerCase()) {
    return { superseded: false, headSha, status: 'identical' };
  }

  const comparison = await fetchJson(
    new URL(`/repos/${encodedRepository}/compare/${sha}...${headSha}`, apiBase),
    token
  );
  const status = comparison?.status ?? 'unknown';
  return { superseded: status === 'ahead', headSha, status };
};

const writeGithubOutput = (name, value) => {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  appendFileSync(outputPath, `${name}=${value}\n`, 'utf8');
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const sha = args.sha ?? process.env.SOURCE_SHA;
  const result = await checkMasterSuperseded({
    repository: args.repository ?? process.env.GITHUB_REPOSITORY,
    sha,
    branch: args.branch ?? 'master',
    token: process.env.GITHUB_TOKEN,
    apiOrigin: process.env.GITHUB_API_URL ?? 'https://api.github.com',
  });

  writeGithubOutput('superseded', result.superseded ? 'true' : 'false');
  writeGithubOutput('head_sha', result.headSha);

  if (result.superseded) {
    process.stdout.write(
      `master advanced to ${result.headSha}; newer commit already supersedes ${sha}\n`
    );
    if (args['require-current']) process.exitCode = SUPERSEDED_EXIT_CODE;
    return;
  }
  process.stdout.write(
    `master head is ${result.headSha} (${result.status}); ${sha} is still current\n`
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `supersession check failed closed: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
    process.exitCode = 1;
  });
}
