export const vehicles = {
  rivo: {
    id: "rivo", label: "RIVO", model: "Автомобил на партньор",
    detail: "До 4 места · партньорски автомобил", eta: 3, image: "/assets/audi.webp"
  }
};

export const DEMO_DRIVER_VEHICLE = { label: "RIVO", model: "BMW 530d Touring", image: "/assets/bmw.webp" };

export const recentPlaces = [
  ["София, Център", "пл. „Независимост“"],
  ["Летище София, Терминал 2", "бул. „Христофор Колумб“"],
  ["Перник, Център", "пл. „Кракра Пернишки“"]
];

export const trips = [
  { id: "#RIVO-1042", service: "RIVO", route: "Перник → София", driver: "Иван", price: 34, status: "В курс" },
  { id: "#RIVO-1043", service: "RIVO", route: "Перник Център", driver: "Мария", price: 8, status: "Активен" }
];
