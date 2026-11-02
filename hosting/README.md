# Host the web version on your own server

Use the existing built **www/** interface on a Linux VPS or another Docker host. The included adapter provides the same SQLite state, photo uploads and complete backup/import endpoints as the Mac service. **No Node.js, npm, Swift compiler or frontend rebuild is needed on the server.** Python runs inside the container; you do not have to install it on the host.

This is one shared, trusted workspace with a shared password. Everyone allowed in can manage all data, export backups and switch the shared “Working as” selection. That selection is a local record, not an individual login. This does not add the original cloud site's account permissions, invitations, live editing/presence or Discord bot. Concurrent saves use revision checks, but there is no live collaboration UI. Use separate deployments for separate groups.

## 1. Prepare the server

You need:

- A server with **Docker Engine and the Docker Compose plugin** installed. The supplied images support typical Linux amd64 and arm64 hosts.
- A domain/subdomain, for example `gear.example.com`, whose DNS A record points to that server. Only add an AAAA record if IPv6 is configured correctly.
- Inbound TCP ports **80 and 443** available for Caddy and HTTPS certificates. Do not expose the internal app port 8080. Use a dedicated hostname at the site root, not a URL subfolder.

Get the complete repository, including the built interface:

```sh
git clone https://github.com/ludinghauserp-sudo/gwg-tv-memberspace-local.git
cd gwg-tv-memberspace-local/hosting
cp .env.example .env
```

Alternatively, download/extract the local web ZIP and open its `hosting` directory. Git is only needed for cloning/updating, not for running the downloaded version.

## 2. Set the domain and password

Generate a password hash. This command prompts for the password; the plaintext password is not placed in your shell history:

```sh
docker run --rm -it --entrypoint caddy caddy:2-alpine hash-password
```

Edit **hosting/.env**:

```dotenv
GWG_DOMAIN=gear.example.com
GWG_EMAIL=you@example.com
GWG_USERNAME=crew
GWG_PASSWORD_HASH='$2a$...paste-the-complete-generated-hash-here...'
```

Use your real domain and certificate contact email. Keep the password hash inside **single quotes** so Docker Compose preserves its dollar signs. Do not use the abbreviated example hash. Keep `.env` private; it is ignored by Git. Share the username and original password with your trusted operators.

Caddy protects **the entire site**, including database, backup and photo endpoints, with HTTP Basic Authentication over HTTPS. Its configuration uses the hashed password rather than plaintext. See [Caddy authentication documentation](https://caddyserver.com/docs/caddyfile/directives/basic_auth) and [Docker environment-file syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax).

## 3. Start it

From the **hosting/** directory:

```sh
docker compose up -d --build
```

Open **https://your-domain/members**, enter the username/password, and use the member tools. Caddy obtains and renews HTTPS certificates when DNS and ports are correctly configured. The existing `www/` files are copied into the image directly; no npm installation takes place.

This setup is for Docker Compose on your own server, not GitHub Pages or a static-only web host. Uploading `www/` alone cannot provide database saves or photos. Do not remove the password protection or publish the Python service directly: the local edition intentionally gives every operator full management access.

## Storage, transfers and backups

- `workspace_data` is the persistent Docker volume containing **workspace.sqlite3**, uploaded photos and pre-import safety snapshots.
- `caddy_data` holds HTTPS certificates; `caddy_config` holds Caddy runtime configuration.
- Data survives container rebuilds, restarts and `docker compose down`. **Do not use `docker compose down -v`** unless you intend to delete those volumes.
- To move your Mac workspace onto the server, export a **complete backup** on the Mac homepage, then import it on the hosted homepage. The same format works in the opposite direction.
- Download complete backups regularly and keep them outside the server. The service accepts uploads up to 96 MB, workspace JSON under 64 MB and individual photos up to 5 MB. For larger photo libraries, also arrange filesystem/volume snapshots with your hosting provider.
- SQLite files should only be copied with the service stopped or a SQLite-aware backup tool. Include the photo directory with the database.

The app's existing “saved on this Mac/local” wording refers to the local edition. In this deployment, the actual workspace data is on **your server**, shared between its visitors. New QR labels use the hosted origin and can open on phones after the shared login; older localhost QR labels need to be reprinted. Camera scanning requires HTTPS and browser camera permission.

## Update, stop and view logs

From **hosting/** in a Git clone:

```sh
# Download the newest source and prebuilt interface, then replace the containers.
git pull --ff-only
docker compose up -d --build
```

Other useful commands:

```sh
docker compose logs --tail=100
docker compose restart
docker compose down
```

Back up before updating. To change the shared password, generate a new hash, edit `.env`, then run `docker compose up -d` to recreate Caddy with the new setting. No changes to the Mac app are necessary.

## Included hosting files

| File | Purpose |
| --- | --- |
| `compose.yaml` | Python service, HTTPS proxy and persistent volumes |
| `Dockerfile` | Small server image using Python's standard library |
| `server.py` | Static interface, SQLite state, photos and backup/import |
| `Caddyfile` | Whole-site shared login, HTTPS and internal reverse proxy |
| `.env.example` | Domain, email, username and password-hash template |
| `../.dockerignore` | Excludes local data, secrets and development files from the build context |

**Verification:** the hosting option has not been built, started, deployed or tested, as requested. The existing local Mac/web downloads remain separate from this optional hosting adapter.
