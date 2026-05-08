# UI Editing Guide

Panduan ini menjelaskan file mana yang perlu diedit kalau ingin memperbaiki layout, mempercantik tampilan, mengubah posisi panel, atau menyesuaikan perilaku UI Smart ADS.

## Struktur Utama UI

### `src/components/cockpit/AppShell.tsx`

Edit file ini kalau ingin mengubah struktur layar utama.

Yang diatur di sini:

- Top app bar
- Brand / judul aplikasi
- Tombol navigasi `Cockpit`, `Settings`, `Event Log`, `Matrix`
- Tombol simulasi seperti `Reset`, `Split Bus B`, `Derate KIT C2`
- System strip: `Source`, `Demand`, `Reserve`, `Relief`
- Pemilihan view aktif
- Komposisi halaman:
  - Cockpit
  - Settings
  - Event Log
  - Tripping Matrix

Contoh kebutuhan:

- Memindahkan tombol Settings ke kanan
- Mengubah urutan menu
- Menambah halaman baru
- Mengubah layout cockpit dari `SLD + right rail` menjadi bentuk lain

## Styling Global

### `src/styles.css`

Edit file ini untuk hampir semua urusan visual.

Yang diatur di sini:

- Warna utama aplikasi
- Background
- Spacing
- Border radius
- Shadow
- Grid layout
- Ukuran top bar
- Button style
- Card style
- Panel style
- SLD canvas wrapper
- Engineer drawer
- Reasoning rail
- Settings page
- Event Log page
- Matrix page
- Responsive layout mobile

Bagian penting:

- `:root` untuk token warna global
- `.top-app-bar` untuk header
- `.command-button` untuk tombol toolbar
- `.workspace` untuk layout cockpit utama
- `.sld-stage` dan `.sld-canvas` untuk area gambar SLD
- `.side-rail` untuk panel ADS Logic kanan
- `.engineer-panel` untuk drawer bawah
- `.config-workspace`, `.config-panel`, `.config-grid` untuk Settings
- `.audit-workspace`, `.audit-list` untuk Event Log
- `.matrix-workspace`, `.matrix-item`, `.matrix-body` untuk Tripping Matrix

Contoh kebutuhan:

- Membuat tampilan lebih premium
- Mengubah ukuran panel kanan
- Mengubah tinggi Engineer Drawer
- Mengubah warna armed/tripped
- Memperbaiki padding halaman Settings
- Membuat Matrix lebih compact

## Single Line Diagram

### `src/components/sld/SldCanvas.tsx`

Edit file ini kalau ingin mengubah cara SLD ditampilkan atau berinteraksi.

Yang diatur di sini:

- Load file SVG dari `public/assets/SLD_ADS_HMI.svg`
- Mapping object ADS ke elemen SVG
- Tooltip saat hover
- Click breaker / load
- Highlight armed
- Highlight tripped
- Trip chip `TRIPPED`
- Update text MW di SVG
- Warna state lewat class CSS runtime

Contoh kebutuhan:

- Mengubah behavior hover
- Mengubah object mana yang clickable
- Menambah chip status baru
- Mengubah logic highlight selected load
- Memperbaiki mismatch antara SLD object dan state ADS

### `public/assets/SLD_ADS_HMI.svg`

Edit file ini kalau ingin mengubah gambar SLD asli.

Yang penting dijaga:

- Elemen clickable harus punya `data-role="open-close"`
- Elemen harus punya `data-object="OBJECT_ID"`
- ID object harus cocok dengan store/model, misalnya:
  - `LOAD_A1`
  - `LOAD_B2`
  - `GEN_C1`
  - `LINE_AB`
  - `IBT_C`
- Text MW sebaiknya punya ID seperti:
  - `MW_LOAD_A1`
  - `MW_GEN_C1`
  - `MW_LINE_AB`

Contoh kebutuhan:

- Memindahkan posisi load di diagram
- Mengganti label breaker
- Menambah feeder baru secara visual
- Membuat SLD lebih rapi

## Panel ADS Logic Kanan

### `src/components/cockpit/ReasoningRail.tsx`

Edit file ini untuk mengubah isi panel kanan ADS Logic.

Yang diatur di sini:

- Mode tampilan:
  - Operator Guide
  - Manual Pre-arm
  - Contingency Preview
  - Trip History
- Scoreboard Need / Shed / Over / CB
- Selected Target
- Why Accepted
- Why Not Other
- Footer frequency/load/constraint

Contoh kebutuhan:

- Mengubah copywriting
- Menambah metrik baru
- Mengubah urutan blok reasoning
- Membuat selected target lebih jelas
- Menampilkan group/priority load di panel kanan

## Engineer Drawer

### `src/components/cockpit/EngineerPanel.tsx`

Edit file ini untuk panel collapsible bawah cockpit.

Yang diatur di sini:

- Last ADS Action
- Open / Tripped Loads
- Operating Hint
- Audit Trail singkat
- Protection Note

Contoh kebutuhan:

- Menambah ringkasan trip terakhir
- Menampilkan active contingency
- Mengubah drawer menjadi lebih tinggi
- Mengganti isi kartu engineer

## Settings Page

### `src/components/cockpit/SettingsView.tsx`

Edit file ini untuk halaman pengaturan.

Yang diatur di sini:

- Source MW
- Minimum reserve MW
- Load list
- Load MW
- Load group 1-4
- Load priority
- Shed eligible
- Contingency required MW
- Affected bus per contingency

Contoh kebutuhan:

- Mengubah form layout
- Menambah setting baru
- Memecah Settings menjadi tab
- Menambah validasi input
- Menyimpan config ke localStorage/backend

## Event Log Page

### `src/components/cockpit/EventLogView.tsx`

Edit file ini untuk halaman audit trail.

Yang diatur di sini:

- Daftar event terbaru
- Jumlah event
- Jumlah open load
- Jumlah open contingency
- Current opened objects

Contoh kebutuhan:

- Menambah timestamp
- Menambah filter event
- Menambah export log
- Mengubah format event agar lebih mirip SOE

## Tripping Matrix Page

### `src/components/cockpit/TrippingMatrixView.tsx`

Edit file ini untuk halaman matrix collapsible.

Yang diatur di sini:

- Daftar contingency
- Required MW
- Selected shed MW
- Group yang digunakan
- Selected trip load
- Group capacity
- Alternatives

Contoh kebutuhan:

- Mengubah matrix menjadi tabel penuh
- Menampilkan semua load sebagai kolom
- Menambah status blocked/eligible
- Menambah warna per group
- Menampilkan priority di matrix

## Logic dan Data ADS

### `src/lib/ads/model.ts`

Edit file ini kalau ingin menambah atau mengubah bentuk data.

Yang ada di sini:

- `Feeder`
- `LoadGroup`
- `ContingencyRule`
- `SheddingCandidate`
- `AdsDecision`

Contoh kebutuhan:

- Menambah field `criticality`
- Menambah field `owner`
- Menambah field `bay`
- Menambah status breaker baru

### `src/lib/ads/initialSystem.ts`

Edit file ini untuk nilai default load.

Yang ada di sini:

- Daftar load
- Bus load
- MW default
- Group default
- Priority default
- Eligibility default

Contoh kebutuhan:

- Menambah load baru
- Mengubah MW default
- Mengubah group default
- Mengubah priority default

### `src/lib/ads/engine.ts`

Edit file ini untuk nilai default contingency.

Yang ada di sini:

- Daftar contingency
- Required relief MW
- Affected buses
- Title
- Constraint name
- Explanation

Contoh kebutuhan:

- Menambah contingency baru
- Mengubah MW contingency
- Mengubah area terdampak
- Mengubah penjelasan engineering

### `src/lib/ads/solver.ts`

Edit file ini kalau ingin mengubah cara ADS memilih load.

Yang diatur di sini:

- Kandidat shedding
- Urutan group 1 sampai 4
- Scoring
- Overshed penalty
- Priority penalty
- Remote bus penalty
- Alasan accepted/rejected

Contoh kebutuhan:

- Mengubah bobot priority
- Membuat group wajib berurutan
- Membatasi jumlah CB
- Menambah reserve-aware shedding
- Mengubah cara alternatif diranking

### `src/lib/ads/store.ts`

Edit file ini untuk state runtime dan action.

Yang diatur di sini:

- Feeders runtime
- Object states
- Contingency rules runtime
- Source MW
- Minimum reserve MW
- Decision aktif
- Hover decision
- Event log
- Reset
- Update load
- Update contingency
- Toggle object
- Set hover object

Contoh kebutuhan:

- Menambah persistence localStorage
- Menambah undo/redo
- Menambah structured event log
- Menambah import/export config
- Mengubah behavior saat contingency ditutup

## Rekomendasi Urutan Editing

Untuk perubahan visual murni:

1. Edit `src/styles.css`
2. Kalau struktur HTML perlu berubah, edit komponen terkait
3. Jalankan build

Untuk perubahan layout halaman:

1. Edit `AppShell.tsx` jika menyangkut navigasi atau komposisi halaman
2. Edit komponen view terkait
3. Edit `styles.css`

Untuk perubahan SLD:

1. Edit `public/assets/SLD_ADS_HMI.svg` untuk posisi/gambar
2. Edit `SldCanvas.tsx` untuk mapping/interaksi
3. Edit `styles.css` untuk warna/highlight

Untuk perubahan logic ADS:

1. Edit `model.ts` jika perlu field baru
2. Edit `initialSystem.ts` atau `engine.ts` untuk data default
3. Edit `solver.ts` untuk algoritma
4. Edit `store.ts` untuk runtime action
5. Edit UI yang menampilkan hasilnya

## Catatan Penting

- Jangan ubah ID load/contingency sembarangan tanpa memperbarui SVG dan mapping.
- Kalau menambah load baru, perlu update minimal:
  - `initialSystem.ts`
  - `SLD_ADS_HMI.svg`
  - `SldCanvas.tsx` mapping jika ada elemen tambahan seperti arrow
- Kalau menambah contingency baru, perlu update minimal:
  - `engine.ts`
  - `SLD_ADS_HMI.svg`
  - `equipmentIds` di `store.ts` kalau object perlu punya state breaker
- Untuk polish visual, usahakan tetap memakai token warna di `:root`.
- Untuk menjaga feel premium, hindari menambah terlalu banyak warna baru atau card bertumpuk.
