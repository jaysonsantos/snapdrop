# Local Development
## Bun

Install dependencies from the repository root:

```sh
bun install
```

Run the app locally with automatic restart when server files change:

```sh
bun run dev
```

Then open `http://localhost:3000`.

In this mode, Bun serves the client assets from `/` directly and handles the websocket endpoint at `/server`.

If you only want a single foreground run without watch mode:

```sh
bun run start
```

## Container

Build the current container image from the repository root:

```sh
podman build -t snapdrop .
```

Run it locally on port `2024`:

```sh
podman run --rm -p 2024:2024 snapdrop
```

Then open `http://localhost:2024`.

The image serves the static client from `/` with Caddy and proxies `/server` to the local Bun process managed by `s6-overlay`.

## Notes

The current container intentionally serves plain HTTP only. No local certificate generation is required.

The client expects the websocket endpoint at `/server`.

When serving the Node server behind a proxy, the `X-Forwarded-For` header must be preserved. Otherwise, clients behind the same proxy may all appear to come from the same address and will be mutually visible.

By default, the internal Bun server listens on port `3000`, and Caddy exposes the application on port `2024`.

[< Back](/README.md)
