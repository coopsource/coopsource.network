import { transform } from 'esbuild';

/**
 * Transpile TypeScript source code to JavaScript using esbuild.
 *
 * Scripts are written in TypeScript by cooperative admins and transpiled
 * before being stored in the database. The compiled JS is then executed
 * in a Worker Thread sandbox.
 */
export async function transpileScript(source: string): Promise<string> {
  const result = await transform(source, {
    loader: 'ts',
    target: 'es2022',
    format: 'esm',
  });
  return result.code;
}
