/*
  Data contoh ruangan untuk scaffold statis.
  File ini dibuat kecil dan mudah diprediksi selama UI masih dibentuk.

  TODO: Ganti module ini dengan data dari Google Apps Script API.
  Response API tetap perlu memakai field yang sama agar js/app.js bisa
  merender ruangan tanpa perubahan besar.
*/

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

export const rooms = [
  {
    room_id: "ROOM-001",
    room_name: "Ruangan 1 - Sakura",
    status: "available",
    start_time: null,
    rate_per_hour: 75000,
  },
  {
    room_id: "ROOM-002",
    room_name: "Ruangan 2 - Melati",
    status: "occupied",
    start_time: minutesAgo(12),
    rate_per_hour: 85000,
  },
  {
    room_id: "ROOM-003",
    room_name: "Ruangan 3 - Kenanga",
    status: "available",
    start_time: null,
    rate_per_hour: 75000,
  },
  {
    room_id: "ROOM-004",
    room_name: "Ruangan 4 - Anggrek",
    status: "occupied",
    start_time: minutesAgo(34),
    rate_per_hour: 95000,
  },
  {
    room_id: "ROOM-005",
    room_name: "Ruangan 5 - Mawar",
    status: "occupied",
    start_time: minutesAgo(57),
    rate_per_hour: 110000,
  },
  {
    room_id: "ROOM-006",
    room_name: "Ruangan 6 - Cempaka",
    status: "available",
    start_time: null,
    rate_per_hour: 95000,
  },
];
