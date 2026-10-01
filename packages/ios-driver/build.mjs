import ts from 'typescript';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../../', import.meta.url));
const out = join(here, 'lib');
const roots = ['qa-driver', 'sim-host', 'ocr-backend'].map(n => join(repo, 'src', `${n}.ts`));
const options = {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
  skipLibCheck: true, declaration: true, noEmitOnError: true,
  esModuleInterop: true, rootDir: join(repo, 'src'), outDir: out,
  types: ['node'], typeRoots: [join(here, 'node_modules/@types')],
};
const program = ts.createProgram(roots, options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => here, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else {
  // 只清理本包生成目录；上游 src 保持唯一来源。
  await rm(out, { recursive: true, force: true });
  const result = program.emit();
  if (result.emitSkipped) throw new Error('driver emit skipped');
  await mkdir(join(here, 'assets'), { recursive: true });
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'assets/ocr.swift', 'assets/qa-wda-simulator']) {
    await cp(join(repo, name), join(here, name), { recursive: true });
  }
  console.log('Built standalone driver, declarations, assets and license notices.');
}
