document.addEventListener("DOMContentLoaded", () => {
  if (typeof ymaps === 'undefined') {
    console.error('Yandex Maps API is not loaded');
    return;
  }

  ymaps.ready(init);

  // Инициализация карты
  function init() {
    const myMap = new ymaps.Map("map", {
      center: [59.220501, 39.891523],
      zoom: 13
    });

    // Подгрузка данных из JSON-файла
    fetch('addresses.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(addresses => {
        addresses.forEach(address => {
          const placemark = new ymaps.Placemark(address.coordinates, {
            balloonContentHeader: `<div class="balloon-header">${address.title}</div>`,
            balloonContentBody: `
                          <div class="balloon-content">
                              <img src=".${address.image}" class="balloon-image">
                              <p class="balloon-author">Автор</p>
                              <a class="balloon-link" href="${address.link}" target="_blank">${address.author}</a>
                          </div>`,
            hintContent: address.title
          });

          myMap.geoObjects.add(placemark);
        });
      })
      .catch(error => {
        console.error('Error loading addresses:', error);
      });
  }
});