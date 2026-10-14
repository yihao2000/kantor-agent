# Kantor Agent

Mod untuk Claude Code yang menampilkan kantor isometrik di panel samping. Tiap sesi Claude dan tiap sub agent jadi karyawan:

- **Lagi kerja:** jalan ke meja, duduk, dan ngetik. Bubble di atas kepala menunjukkan tool yang sedang dipakai.
- **Selesai:** lompat sebentar, lalu jalan-jalan ke pantry, jendela, sofa, atau rak buku.
- **Sub agent baru** masuk dari pintu depan dan ambil meja kosong.
- **Semua sesi di komputer yang sama** muncul di satu kantor. Karakter utama tiap sesi dinamai sesuai folder kerjanya.

Panel terbuka otomatis saat sesi dimulai. Kalau ketutup, ketik `/kantor`.

## Kantor 3D

Ketik `/kantor-3d` di sesi Claude Code mana pun. Kantor 3D terbuka di browser: bisa diputar dan di-zoom, karyawan jalan ke meja dan ngetik saat sesinya kerja, sub agent masuk lewat pintu depan, dan sesi yang ditutup pulang.

Halaman dan datanya ada di `~/.claude/kantor-agent/`. Setiap sesi Claude Code menulis `roster.js` di sana, dan halamannya membaca ulang file itu tiap 1,5 detik. Butuh internet untuk memuat library 3D-nya.

## Install

Di prompt sesi terminal:

```
/plugin install kantor-agent --marketplace yihao2000/kantor-agent
```

Jawab `y` untuk menambah marketplace, lalu pilih scope (scope user disarankan, supaya aktif di semua sesi).

Dari shell:

```
claude plugin install kantor-agent --marketplace yihao2000/kantor-agent
```

Di aplikasi desktop, tempat `/plugin` tidak jalan: klik + di samping kotak prompt, lalu Plugins, Add marketplace dengan `yihao2000/kantor-agent`, lalu Add plugin.

## Sesi cloud dan komputer lain

Sesi cloud (Claude Code di web, aplikasi desktop dengan environment cloud, routine) nggak memasang plugin. Mereka lapor lewat hook kecil ke server relay milikmu sendiri, dan kantor 3D membaca dari situ.

1. **Bikin relay di Val Town.** Buat val baru, tempel isi `cloud/val-town.ts`, tambahkan trigger HTTP, lalu di Env vars val itu isi `KANTOR_KEY` dengan kunci rahasiamu. Kuncinya nggak pernah ada di kode, jadi val Public pun aman. Alamat relay-mu: `https://<nama-val>.val.run/?key=<kunci>`.
2. **Di Mac:** ketik `/kantor-relay <alamat relay>` di sesi Claude Code mana pun. Kantor 3D langsung ikut membaca relay.
3. **Di environment cloud** (Choose environment, lalu edit environment-nya):
   - Network access: **Custom**, centang default domains, tambahkan `*.val.run`.
   - Setup script: `curl -fsSL https://raw.githubusercontent.com/yihao2000/kantor-agent/main/cloud/setup.sh | bash -s '<alamat relay>'`
   - (Atau isi alamat relay di environment variable `KANTOR_RELAY` kalau environment-nya punya kolom itu.)

Sesi cloud baru di environment itu otomatis masuk kantor. Chat biasa di aplikasi Claude belum bisa, karena di sana nggak ada tempat untuk memasang hook.

## Batasan

- Tanpa relay, kantor gabungan hanya mencakup sesi di komputer yang sama.
- Sesi cloud yang lama diam (VM-nya dijeda) tetap kelihatan santai sampai 30 menit, lalu pulang sendiri.
- Di terminal, panel tampil sebagai daftar teks. Gambar kantor tampil di aplikasi desktop.
- Progress tugas tidak ditampilkan dalam persen, karena agent tidak melaporkannya. Yang tampil adalah status, tool yang dipakai, dan lama kerja.

## Struktur

- `hooks/register.tsx`: hook yang membaca giliran kerja, sub agent, dan tool call, plus panelnya.
- `hooks/office.ts`: posisi karyawan, jalur jalan, dan gambar SVG kantornya.
- `app/kantor-3d.html`: kantor 3D. Setelah mengubahnya, jalankan `node scripts/build-page.mjs` supaya `hooks/page.ts` ikut diperbarui.
- `tests/`: jalankan dengan `claude plugin test .`
