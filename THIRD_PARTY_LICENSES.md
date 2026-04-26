# Third-party licenses

`ireko` itself ships no third-party source code. However, the generated viewer
loads [Mermaid](https://mermaid.js.org/) from a CDN at runtime to render the
diagram SVGs. Mermaid is released under the MIT license; its copyright and
license text is reproduced below.

When you publish a site built by `ireko`, you are distributing a page that
links to Mermaid. If you choose to vendor Mermaid (replacing the CDN
`<script>` tag with a local file), you should also include Mermaid's license
text alongside the copy.

---

## Mermaid

> **License:** MIT
> **Homepage:** <https://mermaid.js.org/>
> **Repository:** <https://github.com/mermaid-js/mermaid>

```
The MIT License (MIT)

Copyright (c) 2014 - 2022 Knut Sveidqvist

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## Development-only dependencies

The following packages are used only during `ireko` development or its
build pipeline, and are **not** distributed as part of the `ireko` npm
package or its generated output:

- [TypeScript](https://www.typescriptlang.org/) — Apache-2.0
- [tsup](https://github.com/egoist/tsup) — MIT
- [esbuild](https://esbuild.github.io/) — MIT
- [Vitest](https://vitest.dev/) — MIT
- [`@types/node`](https://www.npmjs.com/package/@types/node) — MIT

Run `pnpm licenses list` in a development checkout for the full list.
