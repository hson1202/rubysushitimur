const tableHu = `
<table>
  <thead>
    <tr>
      <th>Távolság</th>
      <th>Minimum rendelési érték</th>
      <th>Várható szállítási idő</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>0–2 km</td><td>6 000 Ft</td><td>kb. 30 perc</td></tr>
    <tr><td>2,1–3 km</td><td>8 000 Ft</td><td>kb. 30 perc</td></tr>
    <tr><td>3,1–5 km</td><td>10 000 Ft</td><td>kb. 45 perc</td></tr>
    <tr><td>5,1–7 km</td><td>15 000 Ft</td><td>kb. 45–60 perc</td></tr>
    <tr><td>7,1–10 km</td><td>25 000 Ft</td><td>kb. 45–60 perc</td></tr>
    <tr><td>10 km felett</td><td>35 000 Ft-tól</td><td>kb. 60–90 perc</td></tr>
  </tbody>
</table>
`.trim()

const tableVi = `
<table>
  <thead>
    <tr>
      <th>Khoảng cách</th>
      <th>Giá trị đơn tối thiểu</th>
      <th>Thời gian giao dự kiến</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>0–2 km</td><td>6 000 Ft</td><td>khoảng 30 phút</td></tr>
    <tr><td>2,1–3 km</td><td>8 000 Ft</td><td>khoảng 30 phút</td></tr>
    <tr><td>3,1–5 km</td><td>10 000 Ft</td><td>khoảng 45 phút</td></tr>
    <tr><td>5,1–7 km</td><td>15 000 Ft</td><td>khoảng 45–60 phút</td></tr>
    <tr><td>7,1–10 km</td><td>25 000 Ft</td><td>khoảng 45–60 phút</td></tr>
    <tr><td>Trên 10 km</td><td>từ 35 000 Ft</td><td>khoảng 60–90 phút</td></tr>
  </tbody>
</table>
`.trim()

const tableEn = `
<table>
  <thead>
    <tr>
      <th>Distance</th>
      <th>Minimum order value</th>
      <th>Estimated delivery time</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>0–2 km</td><td>6 000 Ft</td><td>approx. 30 min</td></tr>
    <tr><td>2.1–3 km</td><td>8 000 Ft</td><td>approx. 30 min</td></tr>
    <tr><td>3.1–5 km</td><td>10 000 Ft</td><td>approx. 45 min</td></tr>
    <tr><td>5.1–7 km</td><td>15 000 Ft</td><td>approx. 45–60 min</td></tr>
    <tr><td>7.1–10 km</td><td>25 000 Ft</td><td>approx. 45–60 min</td></tr>
    <tr><td>Over 10 km</td><td>from 35 000 Ft</td><td>approx. 60–90 min</td></tr>
  </tbody>
</table>
`.trim()

export const DELIVERY_INFO_SLUG = "delivery-info"

export const getDefaultDeliveryInfoTranslations = () => ({
  hu: {
    title: "HÁZHOZ SZÁLLÍTÁSI INFORMÁCIÓK",
    content: `
      ${tableHu}
      <h2>RENDELÉS ÉS KAPCSOLAT</h2>
      <p>📞 Telefon: +36 30 233 6396<br>📧 E-mail: rendeles.rubysushi2@gmail.com</p>
      <p>A feltüntetett szállítási idők tájékoztató jellegűek. Nagyobb forgalom, időjárási vagy közlekedési körülmények esetén a kiszállítási idő változhat.</p>
      <p>Köszönjük rendelését!<br><strong>Ruby Sushi</strong></p>
    `.trim()
  },
  vi: {
    title: "Thông tin giao hàng",
    content: `
      ${tableVi}
      <h2>ĐẶT HÀNG VÀ LIÊN HỆ</h2>
      <p>📞 Điện thoại: +36 30 233 6396<br>📧 E-mail: rendeles.rubysushi2@gmail.com</p>
      <p>Thời gian giao hàng mang tính tham khảo. Khi đông khách, thời tiết xấu hoặc giao thông tắc nghẽn, thời gian có thể thay đổi.</p>
      <p>Cảm ơn quý khách đã đặt hàng!<br><strong>Ruby Sushi</strong></p>
    `.trim()
  },
  en: {
    title: "Delivery Information",
    content: `
      ${tableEn}
      <h2>ORDERS AND CONTACT</h2>
      <p>📞 Phone: +36 30 233 6396<br>📧 E-mail: rendeles.rubysushi2@gmail.com</p>
      <p>Delivery times are indicative. High demand, weather or traffic conditions may affect the actual delivery time.</p>
      <p>Thank you for your order!<br><strong>Ruby Sushi</strong></p>
    `.trim()
  }
})
