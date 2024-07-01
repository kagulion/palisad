document.addEventListener("DOMContentLoaded", function () {
  // Создание тега script для загрузки API Яндекс Карт
  var script = document.createElement('script');
  script.src = `http://141.8.195.6:3000/api/map?lang=ru_RU`;
  script.type = 'text/javascript';
  script.onload = function () {
    ymaps.ready(init);
  };
  document.head.appendChild(script);

  // Инициализация карты
  function init() {
    var myMap = new ymaps.Map("map", {
      center: [59.220501, 39.891523],
      zoom: 13
    });

    // Подгрузка данных из JSON-файла
    fetch('addresses.json')
      .then(response => response.json())
      .then(addresses => {
        addresses.forEach(address => {
          var placemark = new ymaps.Placemark(address.coordinates, {
            balloonContentHeader: `<div class="balloon-header">${address.title}</div>`,
            balloonContentBody: `
                      <div class="balloon-content">
                          <img src="${address.image}" class="balloon-image">
                          <p class="balloon-author">Автор</p>
                          <a class="balloon-link" href="${address.link}" target="_blank">
                          ${address.author}</a></div>`,
            hintContent: address.title
          });

          myMap.geoObjects.add(placemark);
        });
      });
  }
});
