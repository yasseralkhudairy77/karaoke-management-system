/**
 * Pemeriksa port yang murah dan jujur, dipakai untuk "lampu" status TV.
 *
 * Kenapa tidak memakai `adb`: satu perintah adb per ruangan sangat lambat (detik), dan itulah
 * alasan daftar ruangan di bridge selalu menyajikan status BASI untuk menghemat waktu. Satu
 * sambungan TCP ke port ADB hanya butuh puluhan milidetik, jadi seluruh armada bisa diperiksa
 * dalam satu putaran tanpa membuat halaman kasir menggantung.
 *
 * PENTING (Windows): di Linux, sambungan TCP ke port tertutup selesai sebagai nilai `false`.
 * Di Windows, sambungan yang gagal menjawab selesai sebagai ERROR (ECONNREFUSED / ETIMEDOUT),
 * jadi JANGAN menafsirkan error sebagai "port terbuka". Semua jalur harus resolve ke boolean.
 */

const net = require('node:net');

function probeTcpPort(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    if (!ip) {
      resolve(false);
      return;
    }

    const socket = new net.Socket();
    let settled = false;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), Math.max(100, Number(timeoutMs) || 700));

    socket.once('connect', () => finish(true));
    // 'error' dan 'timeout' DUA-DUANYA berarti tidak bisa menyambung.
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));

    try {
      socket.connect(port, ip);
    } catch (error) {
      finish(false);
    }
  });
}

module.exports = { probeTcpPort };