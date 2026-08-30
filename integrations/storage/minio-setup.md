# MinIO setup (local dev & self-hosted)

## Local dev — already configured

`docker-compose.yml` at the repo root already runs MinIO plus a one-shot `minio-init` sidecar that
creates the bucket and applies an anonymous-download policy on first `docker compose up`:

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minio
    MINIO_ROOT_PASSWORD: minio12345
  ports: ["9000:9000", "9001:9001"]

minio-init:
  image: minio/mc:latest
  depends_on: [minio]
  entrypoint: >
    /bin/sh -c "
    sleep 3;
    mc alias set local http://minio:9000 minio minio12345;
    mc mb -p local/gameworld-assets || true;
    mc anonymous set download local/gameworld-assets;
    exit 0;"
```

The root `.env.example` already matches this exactly:

```bash
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east1
S3_BUCKET=gameworld-assets
S3_ACCESS_KEY=minio          # see note below — services/api actually reads S3_ACCESS_KEY_ID
S3_SECRET_KEY=minio12345     # see note below — services/api actually reads S3_SECRET_ACCESS_KEY
CDN_BASE_URL=http://localhost:9000/gameworld-assets
```

> **Env var name mismatch:** `services/api/src/config.ts` reads `S3_ACCESS_KEY_ID`,
> `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, and `S3_PUBLIC_URL_BASE` — not
> `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`CDN_BASE_URL`. When populating your own `.env` for local dev,
> use the names below (functionally identical values to the block above) so `services/api`
> actually picks them up:
>
> ```bash
> S3_ENDPOINT=http://localhost:9000
> S3_REGION=us-east1
> S3_BUCKET=gameworld-assets
> S3_ACCESS_KEY_ID=minio
> S3_SECRET_ACCESS_KEY=minio12345
> S3_FORCE_PATH_STYLE=true
> S3_PUBLIC_URL_BASE=http://localhost:9000/gameworld-assets
> ```
>
> `infrastructure/environments/dev.env.example` in this monorepo already uses the corrected names.

Apply CORS once the stack is up (MinIO's default has no CORS rules, which blocks the presigned PUT
from a browser origin):

```bash
docker compose exec minio-init sh -c \
  "mc alias set local http://minio:9000 minio minio12345 && mc cors set local/gameworld-assets /dev/stdin" \
  < integrations/storage/cors.json
```

(Or run the equivalent `mc` commands from a host machine with the [MinIO Client](https://min.io/docs/minio/linux/reference/minio-mc.html) installed and pointed at `localhost:9000`.)

## Self-hosted MinIO (staging/on-prem)

1. Deploy MinIO in distributed mode (4+ nodes) for production durability — a single-node MinIO
   (as in `docker-compose.yml`) is a dev convenience, not a production topology.
2. Create a dedicated access key for `services/api`/workers rather than reusing the root
   credentials:
   ```bash
   mc admin user add local gameworld-api '<a-strong-generated-secret>'
   mc admin policy attach local readwrite --user gameworld-api
   ```
3. Create the bucket and apply CORS as above, using the dedicated user's credentials in
   `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` instead of the MinIO root user.
4. `S3_FORCE_PATH_STYLE=true` always, for any self-hosted MinIO endpoint.
5. Put MinIO behind TLS (either MinIO's own TLS config or a reverse proxy) before using it for
   anything beyond local dev — presigned URLs otherwise carry the upload/download signature over
   plaintext HTTP.
