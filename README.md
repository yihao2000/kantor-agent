# Kantor Agent

Mod untuk Claude Code yang menampilkan kantor isometrik di panel samping. Tiap sesi Claude dan tiap sub agent jadi karyawan:

- **Lagi kerja:** jalan ke meja, duduk, dan ngetik. Bubble di atas kepala menunjukkan tool yang sedang dipakai.
- **Selesai:** lompat sebentar, lalu jalan-jalan ke pantry, jendela, sofa, atau rak buku.
- **Sub agent baru** masuk dari pintu depan dan ambil meja kosong.
- **Semua sesi di komputer yang sama** muncul di satu kantor. Karakter utama tiap sesi dinamai sesuai folder kerjanya.

Panel terbuka otomatis saat sesi dimulai. Kalau ketutup, ketik `/kantor`.

## Kantor 3D

Ketik `/kantor-3d` di sesi Claude Code mana pun. Kantor 3D terbuka di browser: bisa diputar dan di-zoom, karyawan jalan ke meja dan ngetik saat sesinya kerja, sub agent masuk lewat pintu depan, dan sesi yang ditutup pulang.

Klik karyawan di ruangan atau di daftar Sesi untuk membuka kartu Karyawan:

- **Ganti nama:** isi nama baru (maks. 24 huruf), lalu Simpan nama. Pakai nama asli mengembalikan nama dari sesinya.
- **Pulangkan:** karyawan jalan keluar lewat pintu. Chat atau sesinya nggak dihapus. Dia baru masuk lagi kalau sesi itu dipakai kerja lagi, dengan nama yang sudah kamu kasih.

Kalau relay dipakai, nama dan daftar yang dipulangkan disimpan di relay, jadi sama di semua perangkat. Tanpa relay, disimpan di browser itu saja.

Baju karyawan ikut jenis kerjaannya. Tugas kreatif (desain, konten, caption, skrip, video, Canva, artikel) bikin bajunya merah. Selain itu, begitu dia pakai tool apa pun (Bash, Edit, cari di web, dan lain-lain) atau tugasnya teknis (kode, bug, plugin, server), dia tinggal pakai kolor. Jenisnya ditebak dari teks tugas dan tool yang dipakai. Yang belum pakai tool apa-apa tetap pakai baju biasa.

### Aplikasi di iPhone dan Mac

Kantor 3D juga ada online di https://yihao2000.github.io/kantor-agent/ (folder `docs/`, dibuat ulang oleh `node scripts/build-page.mjs`). Buka di Safari, lalu:

- **iPhone:** Share, Add to Home Screen.
- **Mac:** File, Add to Dock.

Pertama kali dibuka, tempel alamat relay-mu (yang ada `?key=`). Alamatnya cuma disimpan di perangkat itu, nggak pernah ada di halaman online. Geser untuk putar, cubit dua jari untuk zoom.

### Jadi wallpaper live di Mac

Ketik `/kantor-wallpaper` di Claude Code. Plugin menyiapkan folder `~/.claude/kantor-agent/wallpaper/`: kantornya saja, layar penuh, kamera berputar pelan, dan digambar 30 fps supaya hemat baterai. Pasang [Plash](https://sindresorhus.com/plash) (gratis), tambahkan website lokal, lalu pilih folder itu (di jendela pilih folder, tekan Cmd+Shift+G dan tempel alamatnya, karena `.claude` folder tersembunyi). Di halaman biasa, tombol ⛶ atau tombol W juga mengganti ke mode wallpaper.

Halaman dan datanya ada di `~/.claude/kantor-agent/`. Setiap sesi Claude Code menulis `roster.js` di sana, dan halamannya membaca ulang file itu tiap 1,5 detik. Butuh internet untuk memuat library 3D-nya.

## Kantor 0.9

- **Nama karyawan = judul chat.** Hook plugin menerima judul percakapan dari Claude (`session_title`) dan menyimpannya di `~/.claude/kantor-agent/titles/`. Kalau judulnya belum ada, plugin bikin judul pendek sendiri dari permintaan pertama.
- **Creative studio ala Dapu:** pod meja Mac di atas karpet warna-warni, dinding tegel biru dengan logo dapu, pegboard, mood board ilustrasi, meja craft, UV printer, meja jahit, rak hampers, pojok foto produk berlatar biru, café, dan lounge.
- **Baju santai:** hoodie, tee, jaket, topi, beanie, headphone, sneakers. Merah tetap untuk kerjaan kreatif, kolor untuk yang pakai tools.
- **Klik orangnya:** dia jawab lewat balon omongan sesuai yang lagi dia kerjain.
- **Panel ringkas:** Kerja, Santai, Beres, lalu satu baris per karyawan: lagi ngerjain apa, mulai jam berapa dan sudah berapa lama, atau selesai jam berapa.

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

## Pasang di akun Claude (termasuk mode kerja di aplikasi Claude)

Plugin ini punya dua cara lapor: mod untuk Claude Code, dan hook biasa (`cloud/report.py`) untuk mode kerja di aplikasi Claude yang memuat hook plugin. Di mana mod jalan, hook biasa otomatis diam supaya laporannya nggak dobel.

Supaya sesi di aplikasi Claude tahu alamat relay-mu tanpa disetel tiap kali, buat salinan pribadi: taruh file `relay.txt` berisi alamat relay di folder utama plugin, zip foldernya, lalu unggah lewat **Customize > Plugins > Add > Upload plugin**. Jangan unggah salinan yang berisi `relay.txt` ke repo publik.

Chat biasa tetap nggak bisa: di sana hook plugin diabaikan.

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
