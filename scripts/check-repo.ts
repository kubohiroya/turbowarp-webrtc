import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {promisify} from 'node:util';

interface PackageMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
  packageManager?: string;
  engines?: {node?: string};
  repository?: {url?: string};
  bugs?: {url?: string};
  files?: string[];
  publishConfig?: {access?: string; registry?: string};
  bin?: string | Record<string, string>;
  main?: string;
  types?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface RepoPolicy {
  schemaVersion: number;
  profile: string;
  productName: string;
  packageName: string;
  extensionId: string;
  bundle: string;
  manifest: string;
  canonicalReadme: string;
  localizedReadmes: {
    ja: string;
  };
  licensePolicy: string;
  packageManager: string;
  requiredFiles: string[];
  runtimeBehaviorGuard: {
    extensionId: string;
    opcodes: string[];
  };
  relatedIssues: string[];
}

interface PackResult {
  version: string;
  files: {path: string}[];
}

const execFileAsync = promisify(execFile);
const errors: string[] = [];

const packageMetadata = JSON.parse(await readFile('package.json', 'utf8')) as PackageMetadata;
const policy = JSON.parse(await readFile('repo-policy.json', 'utf8')) as RepoPolicy;
const readme = await readFile(policy.canonicalReadme, 'utf8');
const readmeJa = await readFile(policy.localizedReadmes.ja, 'utf8');
const license = await readFile('LICENSE', 'utf8');
const config = await readFile('src/config.ts', 'utf8');
const manifest = JSON.parse(await readFile(policy.manifest, 'utf8'));
const bundle = await readFile(policy.bundle, 'utf8');

checkPolicy();
checkPackageMetadata();
checkReadmes();
checkLicense();
checkGeneratedArtifacts();
checkRuntimeGuard();
checkLegacyNames();
await checkPackContents();

if (errors.length > 0) {
  throw new Error(`Repository policy check failed:\n- ${errors.join('\n- ')}`);
}

process.stdout.write('Repository policy is aligned.\n');

function checkPolicy() {
  if (policy.schemaVersion !== 1) errors.push('repo-policy.json schemaVersion must be 1');
  if (policy.profile !== 'extension') errors.push('repo-policy.json profile must be extension');
  if (policy.productName !== 'TurboWarp WebRTC') {
    errors.push('repo-policy.json productName must be TurboWarp WebRTC');
  }
  if (policy.licensePolicy !== 'mpl-2.0') {
    errors.push('repo-policy.json licensePolicy must be mpl-2.0');
  }
  if (policy.packageManager !== 'pnpm') {
    errors.push('repo-policy.json packageManager must be pnpm');
  }
}

function checkPackageMetadata() {
  const requiredStrings = ['description', 'author', 'license', 'homepage', 'packageManager'] as const;
  for (const key of requiredStrings) {
    const value = packageMetadata[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`package.json ${key} must be a non-empty string`);
    }
  }
  if (packageMetadata.name !== policy.packageName) {
    errors.push('package.json name must match repo-policy.json packageName');
  }
  if (packageMetadata.license !== 'MPL-2.0') errors.push('package.json license must be MPL-2.0');
  if (packageMetadata.publishConfig?.access !== 'public') {
    errors.push('package.json publishConfig.access must be public');
  }
  if (packageMetadata.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    errors.push('package.json publishConfig.registry must be npmjs');
  }
  if (!/^pnpm@\d+\.\d+\.\d+$/u.test(packageMetadata.packageManager ?? '')) {
    errors.push('package.json packageManager must pin an exact pnpm version');
  }
  if (packageMetadata.engines?.node !== '>=22.18.0') {
    errors.push('package.json engines.node must be >=22.18.0');
  }
  if (packageMetadata.repository?.url !== 'git+https://github.com/kubohiroya/turbowarp-webrtc.git') {
    errors.push('package.json repository.url must point to the current repository');
  }
  if (packageMetadata.bugs?.url !== 'https://github.com/kubohiroya/turbowarp-webrtc/issues') {
    errors.push('package.json bugs.url must point to the current issue tracker');
  }
  for (const file of ['dist/', 'README.md', 'README.ja.md', 'LICENSE']) {
    if (!packageMetadata.files?.includes(file)) {
      errors.push(`package.json files must include ${file}`);
    }
  }
}

function checkReadmes() {
  if (!readme.startsWith(`# ${policy.productName}\n`)) {
    errors.push('README.md H1 must match repo-policy.json productName');
  }
  if (!readmeJa.startsWith(`# ${policy.productName}\n`)) {
    errors.push('README.ja.md H1 must mirror README.md');
  }
  if (!readme.includes('[日本語](README.ja.md)')) {
    errors.push('README.md must link to README.ja.md');
  }
  if (!readmeJa.includes('[English](README.md)')) {
    errors.push('README.ja.md must link to README.md');
  }
  for (const heading of [
    '## What it does',
    '## Requirements and safety',
    '## Installation',
    '## Quick start',
    '## Block reference',
    '## Runtime behavior',
    '## Compatibility and network limitations',
    '## Development',
    '## Release',
    '## License'
  ]) {
    if (!readme.includes(heading)) errors.push(`README.md must include ${heading}`);
  }
  if (!readme.includes(`${packageMetadata.name}@${packageMetadata.version}`)) {
    errors.push('README.md must include a version-pinned package example');
  }
  if (!readme.includes('MPL-2.0')) errors.push('README.md License section must include MPL-2.0');
  if (!readmeJa.includes('MPL-2.0')) errors.push('README.ja.md License section must include MPL-2.0');
}

function checkLicense() {
  if (!license.startsWith('Mozilla Public License Version 2.0\n==================================')) {
    errors.push('LICENSE must contain the Mozilla Public License Version 2.0 full text');
  }
  if (!license.includes('Exhibit A - Source Code Form License Notice')) {
    errors.push('LICENSE must include the MPL-2.0 Exhibit A text');
  }
  if (!config.includes("license: 'MPL-2.0'")) {
    errors.push('src/config.ts must expose MPL-2.0 bundle metadata');
  }
  if (!bundle.startsWith('// Name: WebRTC Manual Pairing')) {
    errors.push('dist bundle must include the expected TurboWarp metadata header');
  }
  if (!bundle.includes('// License: MPL-2.0')) {
    errors.push('dist bundle must include MPL-2.0 metadata');
  }
}

function checkGeneratedArtifacts() {
  if (!readme.includes(policy.bundle)) errors.push(`README.md must document ${policy.bundle}`);
  if ((readme.match(/<!-- BEGIN GENERATED BLOCKS -->/gu) ?? []).length !== 1) {
    errors.push('README.md must contain exactly one generated block start marker');
  }
  if ((readme.match(/<!-- END GENERATED BLOCKS -->/gu) ?? []).length !== 1) {
    errors.push('README.md must contain exactly one generated block end marker');
  }
  if ((readmeJa.match(/<!-- BEGIN GENERATED BLOCKS -->/gu) ?? []).length !== 1) {
    errors.push('README.ja.md must contain exactly one generated block start marker');
  }
  if ((readmeJa.match(/<!-- END GENERATED BLOCKS -->/gu) ?? []).length !== 1) {
    errors.push('README.ja.md must contain exactly one generated block end marker');
  }
}

function checkRuntimeGuard() {
  if (extractConfigValue('id') !== policy.runtimeBehaviorGuard.extensionId) {
    errors.push('src/config.ts extension ID must remain unchanged');
  }
  if (manifest.id !== policy.runtimeBehaviorGuard.extensionId) {
    errors.push('dist extension manifest ID must remain unchanged');
  }
  const actualOpcodes = manifest.blocks.map((block: {opcode: string}) => block.opcode).sort();
  const expectedOpcodes = [...policy.runtimeBehaviorGuard.opcodes].sort();
  if (JSON.stringify(actualOpcodes) !== JSON.stringify(expectedOpcodes)) {
    errors.push('dist extension manifest opcodes must remain unchanged');
  }
}

function checkLegacyNames() {
  const legacy = new RegExp(['tm', 'pose'].join(''), 'iu');
  const legacyScanTargets: [fileName: string, text: string][] = [
    ['README.md', readme],
    ['README.ja.md', readmeJa],
    ['package.json', JSON.stringify(packageMetadata)],
    ['repo-policy.json', JSON.stringify(policy)],
    [policy.bundle ?? '', bundle],
    [policy.manifest ?? '', JSON.stringify(manifest)]
  ];

  for (const [fileName, text] of legacyScanTargets) {
    if (legacy.test(text)) errors.push(`${fileName} must not contain legacy pose-era naming`);
  }
}

async function checkPackContents() {
  const {stdout} = await execFileAsync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json']);
  const [pack] = JSON.parse(stdout) as PackResult[];
  if (!pack) {
    errors.push('npm pack must report a package');
    return;
  }
  const files = new Set(pack.files.map((file) => file.path));
  const expected = new Set(policy.requiredFiles);
  for (const file of expected) {
    if (!files.has(file)) errors.push(`npm pack must include ${file}`);
  }
  for (const file of files) {
    if (!expected.has(file)) errors.push(`npm pack must not include ${file}`);
  }
}

function extractConfigValue(key: string): string {
  const match = config.match(new RegExp(`${key}: '([^']+)'`, 'u'));
  if (!match?.[1]) throw new Error(`src/config.ts must define ${key}`);
  return match[1];
}
