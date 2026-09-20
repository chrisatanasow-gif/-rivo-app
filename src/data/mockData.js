export const vehicles = {
  city: {
    id: "city",
    label: "RIVO CITY",
    model: "Audi A1",
    detail: "Градски курс · до 4 места",
    eta: 3,
    defaultPrice: 26,
    image: "/assets/audi.webp"
  },
  premium: {
    id: "premium",
    label: "RIVO PREMIUM",
    model: "BMW 530d Touring",
    detail: "Комфорт · багаж · до 4 места",
    eta: 6,
    defaultPrice: 34,
    image: "/assets/bmw.webp"
  }
};

export const recentPlaces = [
  ["София, Център", "пл. „Независимост“"],
  ["Летище София, Терминал 2", "бул. „Христофор Колумб“"],
  ["Перник, Център", "пл. „Кракра Пернишки“"]
];

export const trips = [
  { id: "#RIVO-1042", service: "Premium", route: "Перник → София", driver: "Иван", price: 34, status: "В курс" },
  { id: "#RIVO-1043", service: "City", route: "Перник Център", driver: "Мария", price: 8, status: "Активен" }
];
