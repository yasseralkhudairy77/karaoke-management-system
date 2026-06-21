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
    tv_device: {
      configured: true,
      tv_device_id: "TV-001",
      status: "unchecked",
      last_command: "",
    },
  },
  {
    room_id: "ROOM-002",
    room_name: "Ruangan 2 - Melati",
    status: "occupied",
    start_time: minutesAgo(12),
    rate_per_hour: 85000,
    tv_device: {
      configured: true,
      tv_device_id: "TV-002",
      status: "active",
      last_command: "power_on",
    },
  },
  {
    room_id: "ROOM-003",
    room_name: "Ruangan 3 - Kenanga",
    status: "available",
    start_time: null,
    rate_per_hour: 75000,
    tv_device: {
      configured: false,
      status: "not_configured",
    },
  },
  {
    room_id: "ROOM-004",
    room_name: "Ruangan 4 - Anggrek",
    status: "occupied",
    start_time: minutesAgo(34),
    rate_per_hour: 95000,
    tv_device: {
      configured: true,
      tv_device_id: "TV-FAIL",
      status: "failed",
      last_command: "test",
    },
  },
  {
    room_id: "ROOM-005",
    room_name: "Ruangan 5 - Mawar",
    status: "occupied",
    start_time: minutesAgo(57),
    rate_per_hour: 110000,
    tv_device: {
      configured: true,
      tv_device_id: "TV-TIMEOUT",
      status: "timeout",
      last_command: "power_off",
    },
  },
  {
    room_id: "ROOM-006",
    room_name: "Ruangan 6 - Cempaka",
    status: "available",
    start_time: null,
    rate_per_hour: 95000,
    tv_device: {
      configured: true,
      tv_device_id: "TV-006",
      status: "unchecked",
      last_command: "",
    },
  },
];
