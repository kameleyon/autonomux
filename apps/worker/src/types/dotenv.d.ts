/**
 * Local typings for `dotenv` v8.x.
 *
 * dotenv 8 ships `types/index.d.ts` but, because its package.json has an
 * `exports` map without a matching `types` condition, TypeScript's
 * `moduleResolution: nodenext` cannot resolve the bundled .d.ts.
 * We only use `.config()` at boot, so declare just that shape.
 *
 * Remove this shim when we bump dotenv past the version that adds
 * `"types"` to its `exports` map.
 */

declare module "dotenv" {
  export interface DotenvParseOutput {
    [name: string]: string;
  }

  export interface DotenvConfigOptions {
    path?: string;
    encoding?: string;
    debug?: boolean;
    override?: boolean;
  }

  export interface DotenvConfigOutput {
    parsed?: DotenvParseOutput;
    error?: Error;
  }

  export function config(options?: DotenvConfigOptions): DotenvConfigOutput;
  export function parse(
    src: string | Buffer,
    options?: { debug?: boolean },
  ): DotenvParseOutput;
}
