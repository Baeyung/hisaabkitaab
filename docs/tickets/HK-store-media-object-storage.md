# HK-STORE-MEDIA-01 — Move store logo/watermark to object storage

**Status:** Open · **Priority:** Medium · **Area:** Backend / Storage · **Blocks:** clean multi-store, bill/statement rendering at scale

## Context

Store settings (General) lets the owner upload a **logo** and a **watermark**. As a
stopgap, the frontend reads the picked file with `FileReader.readAsDataURL` and stores the
resulting **base64 data URI** directly in `Store.logoUri` / `Store.watermarkUri` (text
columns). No upload endpoint, no file storage — the image travels inside the normal
Store JSON.

This unblocks the feature end-to-end today, but it is not how we want to store media.

## Why this is a stopgap (the ceilings)

- **Row + payload bloat.** Every `GET /api/stores` and every save ships the full base64
  image (~1.33× the original bytes) in JSON. Fine for one small logo; bad as stores,
  images, and image sizes grow.
- **No CDN / caching.** Images can't be served with cache headers or from an edge; they
  re-download with the record every time.
- **Client-side size cap is a band-aid.** The frontend rejects files over ~300 KB to keep
  rows sane. Real branding assets (high-res watermark) will want to be larger.
- **DB is the wrong home for blobs.** Backups, replication, and query working-set all pay
  for image bytes sitting in the `stores` table.

## Target design

1. Add an upload endpoint (e.g. `POST /api/stores/{id}/media?kind=logo|watermark`,
   multipart) that streams the file to an object store (S3 / GCS / MinIO bucket).
2. Persist only the **object key or public URL** in `logoUri` / `watermarkUri` (back to a
   short varchar — revert the `columnDefinition = "text"` widening added for base64).
3. Serve via CDN / signed URLs; set cache headers.
4. Validate type + size server-side; generate a downscaled render for bill/statement use.
5. Migration: one-time job to lift existing base64 data URIs out of the DB into the bucket
   and rewrite the columns to URLs.

## Done when

- Uploading a logo/watermark stores bytes in the bucket, DB holds only a URL/key.
- `GET /api/stores` no longer returns inlined image bytes.
- Bills/statements render the logo/watermark from the bucket URL.

## Notes for the current base64 implementation

- Entity: `Store.logoUri` / `Store.watermarkUri` are `@Column(columnDefinition = "text")`.
- **Existing databases** (schema created before this change, `ddl-auto: update` does not
  alter existing column types) need a one-time widen:

  ```sql
  ALTER TABLE stores ALTER COLUMN logo_uri TYPE text;
  ALTER TABLE stores ALTER COLUMN watermark_uri TYPE text;
  ```

- Frontend cap lives in `features/settings/general.ts` (`MAX_IMAGE_BYTES`).
