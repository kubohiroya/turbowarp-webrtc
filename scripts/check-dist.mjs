import {execFile} from 'node:child_process';
import process from 'node:process';
import {URL} from 'node:url';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const hasHead = await execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], {cwd: repositoryRoot})
  .then(() => true)
  .catch(() => false);

const {stdout} = await execFileAsync(
  'git',
  hasHead
    ? ['diff', '--name-status', '--', 'dist']
    : ['status', '--short', '--untracked-files=no', '--', 'dist'],
  {cwd: repositoryRoot}
);

if (stdout.length > 0) {
  process.stderr.write('Generated dist files are not up to date:\n');
  process.stderr.write(stdout);
  process.exitCode = 1;
}
