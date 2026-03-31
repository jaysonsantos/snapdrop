# Local Development
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

The image serves the static client from `/` with Caddy and proxies `/server` to the local Node process managed by `s6-overlay`.

## Notes

The current container intentionally serves plain HTTP only. No `FQDN` variable or local certificate generation is required.

The client expects the websocket endpoint at `/server`.

When serving the Node server behind a proxy, the `X-Forwarded-For` header must be preserved. Otherwise, clients behind the same proxy may all appear to come from the same address and will be mutually visible.

By default, the internal Node server listens on port `3000`, and Caddy exposes the application on port `2024`.

[< Back](/README.md)
