import React from "react";
import { formatDistance, formatMoney } from "../../shared/fare.js";

export default function FareBreakdown({ fare }) {
  if (!fare) return null;
  return <div className="fareBreakdown">
    <div><span>Автомобилен маршрут</span><b>{formatDistance(fare.distanceMeters)} км{fare.durationSeconds ? ` · ~${Math.max(1, Math.round(fare.durationSeconds / 60))} мин` : ""}</b></div>
    <div><span>Начална такса</span><b>{formatMoney(fare.baseFareCents)}</b></div>
    <div><span>{formatDistance(fare.distanceMeters)} км × {formatMoney(fare.perKmCents)}/км</span><b>{formatMoney(fare.distanceChargeCents)}</b></div>
    {fare.discountCents > 0 && <><div><span>Преди отстъпката</span><b>{formatMoney(fare.originalPriceCents)}</b></div><div className="fareDiscount"><span>Дневна оферта · 10% до 2 €</span><b>−{formatMoney(fare.discountCents)}</b></div></>}
    <small>Примерна тарифа за теста. Сумата е предварителна оценка; престой и допълнителни такси не са включени.</small>
  </div>;
}
