import {readFile, writeFile} from 'node:fs/promises';
import process from 'node:process';
import {URL} from 'node:url';

interface BlockArgument {
  type: string;
  defaultValue?: boolean | number | string;
  menu?: string;
}

interface BlockDefinition {
  opcode: string;
  blockType: string;
  text: string;
  description: string;
  arguments: Record<string, BlockArgument>;
  isEdgeActivated?: boolean;
}

interface BlockDefinitions {
  extensionName: string;
  blocks: BlockDefinition[];
  menus: Record<string, unknown>;
}

const START = '<!-- BEGIN GENERATED BLOCKS -->';
const END = '<!-- END GENERATED BLOCKS -->';
const checkOnly = process.argv.includes('--check');
const errors: string[] = [];

const definitions = JSON.parse(
  await readFile(new URL('../src/block-definitions.json', import.meta.url), 'utf8')
) as BlockDefinitions;
const generated = definitions.blocks.map(renderBlock).join('\n\n');
const replacement = `${START}\n\n${generated}\n\n${END}`;

for (const fileName of ['README.md', 'README.ja.md']) {
  const readmeUrl = new URL(`../${fileName}`, import.meta.url);
  const readme = await readFile(readmeUrl, 'utf8');

  if (!readme.includes(START) || !readme.includes(END)) {
    throw new Error(`${fileName} does not contain the generated block markers.`);
  }

  const next = readme.replace(
    new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`),
    replacement
  );
  if (checkOnly) {
    if (next !== readme) errors.push(`${fileName} generated block reference is not up to date.`);
  } else {
    await writeFile(readmeUrl, next);
  }
}

if (errors.length > 0) {
  throw new Error(errors.join('\n'));
}

function renderBlock(block: BlockDefinition): string {
  const rows = [
    ['Type', titleCase(block.blockType)],
    ['Opcode', `\`${block.opcode}\``]
  ];
  for (const [name, argument] of Object.entries(block.arguments ?? {})) {
    rows.push([
      `\`${name}\``,
      `${titleCase(argument.type)}, default: \`${formatDefault(argument.defaultValue)}\``
    ]);
  }
  return [
    `### \`${block.text}\``,
    '',
    block.description,
    '',
    '| Property | Value |',
    '|---|---|',
    ...rows.map(([name, value]) => `| ${name} | ${value} |`)
  ].join('\n');
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatDefault(value: BlockArgument['defaultValue']): string {
  return String(value).replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('`', '\\`');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
