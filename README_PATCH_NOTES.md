# GPL-3 Patch Notes

Patch ini menambahkan fondasi lisensi open-source GPL-3.0-only untuk repository.

## Files

- `LICENSE` — teks resmi GNU GPL v3.
- `README.md` — README edukatif + disclaimer independen.
- `GPL3_SOURCE_HEADER.txt` — header lisensi untuk source file baru/utama.
- `scripts/apply-gpl3-license-field.ps1` — patcher PowerShell untuk menambahkan `license` ke `package.json`.
- `scripts/apply-gpl3-license-field.cjs` — patcher Node.js alternatif.
- beberapa file source utama dari baseline stabil Phase 20A diberi header GPL.

## Cara pakai aman

1. Copy `LICENSE` ke root repo.
2. Copy/merge `README.md` ke root repo.
3. Copy folder `scripts/` ke root repo.
4. Jalankan salah satu:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-gpl3-license-field.ps1
```

atau:

```bash
node scripts/apply-gpl3-license-field.cjs
```

5. Jika source file Mas sudah lebih baru dari patch ini, jangan replace file logic hanya untuk header. Cukup copy isi `GPL3_SOURCE_HEADER.txt` ke file utama secara manual.

## Catatan

Saya sengaja tidak membuat full replacement `package.json` karena file asli tidak tersedia di upload, agar dependencies dan scripts Mas tidak tertimpa.
