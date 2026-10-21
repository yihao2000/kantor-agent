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
- **Baju funky:** kemeja garis dan baret, overall dan bucket hat, polkadot dan pita, hoodie tie-dye dan beanie kuping kucing, topi baling-baling, celemek cat, kemeja bunga dan kacamata hitam, sweater pelangi, topi kodok. Merah tetap untuk kerjaan kreatif, kolor untuk yang pakai tools.
- **Putar otomatis:** tombol ⟳ (atau R). Habis kamu geser kameranya, dia muter lagi sendiri setelah 3 detik.
- **Kamera bebas:** geser untuk pindah ke area mana pun; klik kanan atau Shift + geser untuk muter; scroll atau cubit untuk zoom; di HP putar dua jari untuk muter. Tombol ⌖ atau klik dua kali untuk balik ke tengah.
- **Patung Andrew:** founder Dapu versi voxel di atas kotak kado raksasa dekat pintu masuk: rambut belah samping, kacamata kotak, celemek hitam, megang hampers, melambai, loncat-loncat kecil dengan hati dan kilauan. Klik patungnya, dia kasih semangat ke tim. Karyawan kadang kasih hormat atau selfie di depannya.
- **Animasi kegiatan:** fotografer jongkok pakai kamera dan flash ("cekrek!"), atur lighting, selfie di logo, telepon klien, tidur di bean bag ("Zzz…"), selonjoran di sofa, gambar dan rakit di meja craft, jahit, cetak di UV printer, mikir di mood board, dan yang kerja di Mac sesekali ngulet.
- **Klik orangnya:** dia jawab lewat balon omongan sesuai yang lagi dia kerjain.
- **Panel ringkas:** Kerja, Santai, Beres, lalu satu baris per karyawan: lagi ngerjain apa, mulai jam berapa dan sudah berapa lama, atau selesai jam berapa.

## Kantor 0.10

- **Gudang Dapu:** rak stok, meja packing, palet paket keluar, dan pintu bongkar muat. Tim packing (3 orang) selalu kerja: ambil barang, packing, taruh di palet. Jam 22.00 sampai 06.00 tinggal satu yang shift malam. Kurir motor datang tiap beberapa menit (07.00 sampai 21.00) ambil paket.
- **Siang dan malam ikut jam Jakarta:** langit di jendela berubah, lampu tumblr menyala malam hari, karyawan nguap lewat tengah malam dan ketiduran di meja jam 1 sampai 5 pagi.
- **Error jadi drama:** tool yang gagal ditandai ⚠, karyawannya panik, layarnya merah, monitornya berasap.
- **Level kantor:** tiap tugas beres = 1 XP. Tiap level membuka barang baru: lampu tumblr, akuarium, neon sign, gerobak es krim, bola disko, kucing kantor, lemari piala, robot vakum, patung emas.
- **Karyawan Terbaik:** jam 17.00 patung Andrew mengumumkan karyawan paling rajin hari itu; dia dapat piala di atas kepala sampai besok.
- **Papan penjualan (ala-ala):** di dinding gudang. Tiap tugas beres dihitung satu closing: bel bunyi, semua tepuk tangan.
- **Tombol baru:** 🔇 suara (musik lofi + suara kantor, atau suara kantor saja), 🚶 jalan-jalan jadi Bos Andrew (WASD/panah, Spasi kasih kopi, di HP ketuk lantai), ⏪ replay hari ini dalam 60 detik, 📷 foto polaroid.
- Level, statistik harian, dan rekaman replay disimpan di perangkat masing-masing, dan rekaman hanya jalan selama halaman kantornya terbuka.

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
