# Office convert (Gotenberg)

Hosted LibreOffice conversion for PPT/Excel/Word → PDF.  
Used by Supabase Edge `parse-material` via `OFFICE_CONVERT_URL`.

## Local

```bash
cd tools/office-convert
docker compose up -d
# → http://127.0.0.1:3000
curl -s http://127.0.0.1:3000/health
```

> Supabase **cloud** Edge cannot reach your laptop `localhost`.  
> For end-to-end cloud testing, deploy this service to a public URL (Fly.io / Railway / 任意 VPS)，再设置：

```bash
npx supabase secrets set OFFICE_CONVERT_URL=https://YOUR_PUBLIC_CONVERT_HOST
npx supabase secrets set OFFICE_CONVERT_ENGINE=gotenberg
```

## Production

1. Deploy `docker compose` (or equivalent) with a TLS reverse proxy.
2. Set Edge secrets above.
3. Re-parse existing PPT/Excel materials so `preview_storage_object_key` is filled.
4. Frontend only reads the stored preview PDF — works for every user.
