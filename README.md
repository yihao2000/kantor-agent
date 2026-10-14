# Kantor Agent

Mod untuk Claude Code yang menampilkan kantor isometrik di panel samping. Tiap sesi Claude dan tiap sub agent jadi karyawan:

- **Lagi kerja:** jalan ke meja, duduk, dan ngetik. Bubble di atas kepala menunjukkan tool yang sedang dipakai.
- **Selesai:** lompat sebentar, lalu jalan-jalan ke pantry, jendela, sofa, atau rak buku.
- **Sub agent baru** masuk dari pintu depan dan ambil meja kosong.
- **Semua sesi di komputer yang sama** muncul di satu kantor. Karakter utama tiap sesi dinamai sesuai folder kerjanya.

Panel terbuka otomatis saat sesi dimulai. Kalau ketutup, ketik `/kantor`.

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

## Batasan

- Kantor gabungan hanya mencakup sesi di komputer yang sama. Sesi di komputer lain atau di cloud punya kantornya sendiri.
- Di terminal, panel tampil sebagai daftar teks. Gambar kantor tampil di aplikasi desktop.
- Progress tugas tidak ditampilkan dalam persen, karena agent tidak melaporkannya. Yang tampil adalah status, tool yang dipakai, dan lama kerja.

## Struktur

- `hooks/register.tsx`: hook yang membaca giliran kerja, sub agent, dan tool call, plus panelnya.
- `hooks/office.ts`: posisi karyawan, jalur jalan, dan gambar SVG kantornya.
- `tests/`: jalankan dengan `claude plugin test .`
