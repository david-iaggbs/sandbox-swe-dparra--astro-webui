# Lesson 02 — Astro SSR Fundamentals

> **Level:** Beginner
> **Goal:** Understand how Astro renders pages on the server and how the Node.js standalone adapter works.

## 2.1 Server-Side Rendering Mode

Astro supports multiple output modes. This project uses `server` mode, meaning every page is rendered on the server at request time:

```javascript
// app/astro.config.mjs
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    port: 4321,
    host: '0.0.0.0',
  },
});
```

| Setting | Value | Purpose |
|---------|-------|---------|
| `output` | `'server'` | All pages render on the server (no static HTML at build time) |
| `adapter` | `node({ mode: 'standalone' })` | Produces a self-contained Node.js server |
| `server.port` | `4321` | HTTP port for both dev and production |
| `server.host` | `'0.0.0.0'` | Bind to all interfaces (required for Docker) |

> **Further reading:** [Astro Server-Side Rendering](https://docs.astro.build/en/guides/server-side-rendering/)

## 2.2 The Standalone Adapter

The `@astrojs/node` adapter in `standalone` mode produces a complete HTTP server at `dist/server/entry.mjs`. This is different from `middleware` mode, which produces a handler for use inside an existing Express/Fastify server.

After `npm run build`, the output is:

```
dist/
├── client/           # Static assets (CSS, JS, images)
└── server/
    └── entry.mjs     # Self-contained Node.js HTTP server
```

You start the production server with:

```bash
node dist/server/entry.mjs
```

No additional runtime framework is needed — the adapter bundles everything into `entry.mjs`.

## 2.3 Astro Components vs API Routes

Astro has two types of server-side files:

### `.astro` files — Pages with HTML

The frontmatter (between `---` fences) runs on the server. The template below it renders HTML:

```astro
---
// app/src/pages/index.astro — server-side code
import Layout from '../layouts/Layout.astro';
import { loadDescription } from '../lib/config';

const description = await loadDescription();  // Runs on every request
---

<Layout title="Greeting Service">
  <section class="description-panel">
    <p>{description}</p>
  </section>
</Layout>
```

The `await loadDescription()` call fetches from SSM Parameter Store on every request. The result is rendered into HTML and sent to the browser.

### `.ts` files — API Endpoints

TypeScript files in `src/pages/api/` export HTTP method handlers that return `Response` objects:

```typescript
// app/src/pages/api/health.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  return new Response(JSON.stringify({ status: 'UP' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

| Aspect | `.astro` Files | `.ts` API Routes |
|--------|---------------|-----------------|
| Output | HTML | JSON (or any `Response`) |
| Runs on | Server (frontmatter) + Browser (script) | Server only |
| Use case | User-facing pages | API endpoints, BFF proxy |

## 2.4 Layouts

Layouts are reusable wrappers for pages. They use the `<slot />` element to inject child content:

```astro
---
// app/src/layouts/Layout.astro
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>{title}</title>
  </head>
  <body>
    <header>
      <div class="brand">Greeting Service</div>
      <nav>
        <a href="/">Home</a>
        <a href="/api/health">Health</a>
      </nav>
    </header>
    <slot />   <!-- Page content injected here -->
    <footer>Astro WebUI</footer>
  </body>
</html>
```

A page uses the layout by wrapping its content:

```astro
<Layout title="Greeting Service">
  <main>...</main>
</Layout>
```

> **Further reading:** [Astro Layouts](https://docs.astro.build/en/basics/layouts/)

## 2.5 Client-Side Interactivity

Astro ships zero JavaScript to the browser by default. To add interactivity, you use a `<script>` tag inside an `.astro` file:

```astro
<!-- app/src/pages/index.astro -->
<script>
  // This runs in the browser, NOT on the server
  el('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/greetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, suffix }),
    });
    // ...
  });
</script>
```

The `<script>` tag is bundled and delivered to the browser. It communicates with the server through the API routes (`/api/greetings`), which proxy to the Spring Cloud backend.

## Summary

| Concept | Implementation |
|---------|---------------|
| Rendering mode | `output: 'server'` — all pages rendered at request time |
| Adapter | `@astrojs/node` standalone — self-contained HTTP server |
| Pages | `.astro` files with server frontmatter and HTML template |
| API routes | `.ts` files exporting `GET`, `POST`, `DELETE` handlers |
| Layouts | Reusable wrappers with `<slot />` for content injection |
| Client JS | `<script>` tags in `.astro` files — bundled and sent to browser |

---

**Previous:** [Lesson 01 — Project Structure](01-project-structure.md) | **Next:** [Lesson 03 — API Routes & BFF Pattern](03-api-routes-bff-pattern.md)
