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

    // Подгрузка данных из JSON-файлов
    Promise.all([
      fetch('addresses.json').then(res => res.json()),
      fetch('authors.json').then(res => res.json())
    ])
      .then(([addresses, authors]) => {
        const authorsMap = authors.reduce((acc, author) => {
          acc[author.id] = author;
          return acc;
        }, {});

        addresses.forEach(address => {
          const author = authorsMap[address.authorId] || { name: 'Неизвестен', link: '#' };
          const placemark = new ymaps.Placemark(address.coordinates, {
            balloonContentHeader: `<div class="balloon-header">${address.title}</div>`,
            balloonContentBody: `
                          <div class="balloon-content">
                              <img src=".${address.image}" class="balloon-image">
                              <p class="balloon-author">Автор</p>
                              <a class="balloon-link" href="${author.link}" target="_blank">${author.name}</a>
                          </div>`,
            hintContent: address.title
          });

          myMap.geoObjects.add(placemark);
        });
      })
      .catch(error => {
        console.error('Error loading data:', error);
      });
  }
});