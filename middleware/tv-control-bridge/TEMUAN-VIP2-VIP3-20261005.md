# Temuan VIP-2 & VIP-3 — 2026-10-05

## Pertanyaan yang dijawab

"TV-nya nyala, tapi tidak tersambung dengan jaringan."

## Jawaban singkat

Benar: kedua TV itu (VIP-2 dan VIP-3) TIDAK ada di jaringan. Alamat yang tercatat untuk
mereka sekarang dipegang perangkat lain — kemungkinan besar ponsel/laptop tamu. Bridge
tidak salah baca; yang salah adalah alamatnya sudah "dibajak".

## Bukti (dibaca 2026-10-05, sekitar pukul 15.30–15.50 WIB)

### 1. Alamat yang tercatat di config vs yang benar-benar ada di jaringan

| Ruangan | IP tercatat | MAC tercatat | MAC yang benar-benar ada di IP itu | Hasil ping |
| --- | --- | --- | --- | --- |
| VIP-2 (room-02) | 192.168.1.6 | 74:81:9a:ff:6a:a5 | **ca:b2:54:e4:68:44** (bukan TV) | 2 dari 2 gagal |
| VIP-3 (room-03) | 192.168.1.16 | 9c:53:85:00:b3:ab | **38:b1:db:f3:16:6b** (bukan TV) | 2 dari 2 gagal |
| VIP-8 (room-08) | 192.168.1.14 | 74:81:9a:ff:75:56 | (tidak ada MAC) | 2 dari 2 gagal |
| VIP-4 (room-04) | 192.168.1.104 | 74:81:9a:ff:72:be | 74:81:9a:ff:72:be ✔ | jawab, port ADB terbuka |

Catatan: bit pertama heksadesimal `ca` (1100 1010) dan `38` (0011 1000) sama-sama punya bit
"locally administered" menyala. Itu pola MAC acak khas ponsel/laptop modern — bukan
perangkat TV. TV Polytron/TCL di venue ini bermerek `74:81:9a` atau `9c:53:85`.

### 2. Hasil pemindaian seluruh LAN (hanya 2 TV yang benar-benar online)

    host           port yang terbuka                                  MAC               perangkat
    192.168.1.15   [6466,6467,7000,8008,8009,8443,9000]              44-0f-b4-bb-1e-9e  Android TV "TV Ruang Keluarga"
    192.168.1.104  [5555,6466,6467,7000,8008,8009,8443,9000]        74-81-9a-ff-72-be  Android TV "VIP 4"
    (lainnya: ponsel/laptop, tidak menjawab port TV sama sekali)

Artinya: dari 9 ruangan yang memakai TV, hanya VIP-4 dan satu TV tak terdaftar (Ruang
Keluarga) yang benar-benar ada di jaringan saat ini. VIP-1, 2, 3, 5, 6, 7, 8, dan Executive
tidak menjawab.

### 3. Perbandingan dengan catatan lama

- 2026-09-25 (inventaris-lan-20260925.csv): `.8` dipegang MAC VIP-5 dan `.10` dipegang MAC
  VIP-6 — waktu itu TV-nya memang ada di alamat tersebut.
- 2026-10-05 (hari ini): `.6`, `.16`, dan `.14` dipegang MAC perangkat lain, dan `.8`/`.10`
  tidak ada sama sekali.

Jadi perpindahan ini terjadi bertahap: setiap kali kabel sebuah TV tidak aktif (TV dimatikan
dari saklar, colokan/port bermasalah), router membagikan alamat itu ke perangkat lain karena
alamat TV berada DI DALAM kolam DHCP.

### 4. Akar masalah (dari analisa 2026-09-22, masih berlaku)

Blok alamat TV (`.6`–`.16`) ada di dalam kolam DHCP router. Selama itu belum ditutup,
kejadian ini akan berulang: TV mati sebentar -> alamat diambil tamu -> TV menyala lagi ->
tidak bisa mengambil alamat lamanya -> tampil "tidak tersambung" padahal TV sehat.

## Yang belum bisa diperbaiki dari PC kasir

- **Memperbaiki router**: halaman konfigurasi ZTE ONT memang bisa DIBACA tanpa login, tetapi
  setiap perintah data yang sebenarnya (`get_lan_status`, `get_ipv4_lan_info`,
  `set_dhcp_lan_info`) dijawab `{"session_valid":0}`. Jadi perlu login admin di browser.
  Kredensial belum tersimpan di sistem ini. Kalau Bapak beri akses (saya bisa menyimpan
  sendiri lewat kotak sandi, Bapak tidak perlu mengetik di sini), saya bisa langsung
  membaca kolam DHCP dan menulis reservasinya.
- **Memeriksa secara fisik**: apakah TV VIP-1, 2, 3, 5, 6, 7, 8, Executive benar-benar
  menyala dan kabel LAN-nya aktif. Ping tidak bisa membedakan "TV mati" dari "kabel lepas".

## Urutan perbaikan yang disarankan

1. **Kunci alamat (paling penting, cukup sekali)** — di router: keluarkan `.100`–`.120` dari
   kolam DHCP, lalu tambahkan reservasi MAC -> IP untuk tiap TV (MAC-nya harus MAC kabel,
   `74:81:9a`/`9c:53:85`).
2. **Pindahkan TV ke blok baru** mengikuti rencana yang sudah ada (ip-plan-static.csv):
   VIP-1 .101, VIP-2 .102, VIP-3 .103, VIP-4 .104, VIP-5 .105, VIP-6 .106, VIP-7 .107,
   VIP-8 .108, Executive .113.
3. **Aktifkan network debugging (ADB)** di tiap TV dan tekan Allow sekali per TV.
4. **Samakan config/rooms.json** dengan alamat baru, lalu restart bridge.
5. Perangkat lain yang sekarang memegang `.6`/`.16`/`.14` tidak perlu dikejar: begitu TV
   memakai alamat baru yang direservasi, tabrakan ini hilang sendiri.


## Koreksi & catatan penting (dikonfirmasi pemilik sistem)

- PC kasir memang menyambung ke jaringan lewat **Wi-Fi**, bukan kabel. Antarmuka Ethernet-nya
  "Media disconnected" sesuai rencana - **BUKAN gejala kerusakan jaringan**. (Sempat saya
  laporkan sebagai indikasi awal; itu keliru dan sudah dicoret.)
- Karena pemindaian dan paket Wake-on-LAN dikirim dari Wi-Fi pada LAN yang sama, keduanya tetap
  sampai ke seluruh LAN kabel. Kesimpulan "MAC TV tidak ada di seluruh 192.168.1.0/24" tetap sah.

## Satu celah yang belum tertutup

Pemindaian menyisir **192.168.1.0/24** saja. Bila sebuah TV memegang setelan statis di subnet
lain (mis. sisa alamat box uji 10.43.x, atau salah netmask), TV itu tetap hidup di jaringan
tetapi tidak akan menjawab ping ini dan MAC-nya tidak akan terlihat.

Cara memastikannya hanya dari layar TV, bukan dari PC:
    Setelan -> Jaringan -> (Ethernet) -> lihat "IP address" yang benar-benar dipakai.

- Kalau alamatnya 192.168.1.6 / 192.168.1.16 -> TV bertabrakan dengan perangkat lain yang
  sekarang memakai alamat itu (dua perangkat satu alamat, keduanya saling memutus).
- Kalau alamatnya bukan 192.168.1.x -> itu sebabnya TV tak terlihat; betulkan ke blok .101-.113.
- Kalau alamatnya kosong / "tidak tersambung" / tanpa IP -> kabel atau port switch-nya.

## Hasil uji Wake-on-LAN (2026-10-05, dari PC kasir lewat Wi-Fi)

Paket WoL dikirim ke MAC kabel kedua TV, lalu ARP dipantau 60 detik:

    VIP-2 (74:81:9a:ff:6a:a5) -> MAC tetap tidak muncul (yang terlihat ca:b2:54:e4:68:44)
    VIP-3 (9c:53:85:00:b3:ab) -> MAC tetap tidak muncul (yang terlihat 38:b1:db:f3:16:6b)

Catatan perilaku: WoL baru berguna bila TV sebelumnya dimatikan dengan benar (tombol mati /
mode standby). Kalau TV terputus dari listrik (saklar/colokan), NIC-nya mati total dan WoL
tidak akan membangunkannya.

## Pemindaian penuh 192.168.1.1-254 (setelah sweep)

Perangkat yang menjawab, hanya 6:

    192.168.1.1     28-6d-da-7d-e9-00   router/gateway
    192.168.1.4     62-66-e8-9b-47-38   bukan TV (MAC acak: ponsel/laptop)
    192.168.1.6     ca-b2-54-e4-68-44   bukan TV (MAC acak) - alamat "VIP-2" dibajak
    192.168.1.15    44-0f-b4-bb-1e-9e   Android TV "TV Ruang Keluarga" (tidak terdaftar)
    192.168.1.16    38-b1-db-f3-16-6b   bukan TV (MAC acak) - alamat "VIP-3" dibajak
    192.168.1.104   74-81-9a-ff-72-be   Android TV "VIP 4" (satu-satunya TV terdaftar yang online)

MAC TV VIP-2 dan VIP-3 tidak ada di alamat mana pun. Jejak sambungan bridge juga menunjukkan
keduanya BELUM PERNAH berhasil tersambung hari ini (VIP-4 pukul 15:39, VIP-8 pernah pukul 15:07).

## Lembar serah-terima untuk yang memegang router

    Reservasi DHCP (MAC -> IP), netmask 255.255.255.0, gateway 192.168.1.1

    74:81:9a:ff:75:56  -> 192.168.1.108   VIP-8
    74:81:9a:ff:6a:a5  -> 192.168.1.102   VIP-2
    9c:53:85:00:b3:ab  -> 192.168.1.103   VIP-3
    9c:53:85:00:b4:dc  -> 192.168.1.101   VIP-1
    74:81:9a:ff:72:f8  -> 192.168.1.105   VIP-5
    74:81:9a:ff:6a:ad  -> 192.168.1.106   VIP-6
    74:81:9a:ff:75:26  -> 192.168.1.107   VIP-7
    74:81:9a:ff:72:be  -> 192.168.1.104   VIP-4   (sudah jalan di alamat ini)
    74:81:9a:ff:64:3a  -> 192.168.1.113   Executive Room

    DAN: keluarkan 192.168.1.100 - 192.168.1.120 dari kolam DHCP (pool start/end),
    supaya alamat TV tidak pernah dibagikan ke perangkat lain.

    Halaman kerja: http://192.168.1.1/html/dhcp_lan_inter.html  (Reservasi)
                   http://192.168.1.1/html/lan_ipv4_inter.html  (Kolam DHCP)

Alasan satu baris: alamat TV sekarang ada di dalam kolam DHCP, jadi setiap kali TV
kehilangan link sebentar, alamatnya diambil perangkat lain dan TV tidak bisa dikendalikan.