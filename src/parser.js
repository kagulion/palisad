import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADDRESSES_FILE = path.join(__dirname, "addresses.json");
const AUTHORS_FILE = path.join(__dirname, "authors.json");
const PHOTOS_DIR = path.join(__dirname, "..", "images", "photos");

// Регулярные выражения для поиска
const ADDRESS_REGEX =
  /(?:ул\.|на|у|по адресу:?)\s+([А-ЯЁ][а-яёA-Za-z0-9\-\s]{2,40}),\s*(\d+[А-Яа-я]?)/gi;
const ADDRESS_STRICT_REGEX =
  /([А-ЯЁ][а-яёA-Za-z\-]+\s?[А-ЯЁ]?[а-яёA-Za-z\-]*),\s*(\d+[А-Яа-я]?)/g;
const VK_ID_REGEX = /\[(id|club)(\d+)\|([^\]]+)\]/g;
const ARTIST_LABEL_REGEX = /(?:Художник|Автор):\s*([А-ЯЁа-яё\s]+)/gi;

// Настройка Geocoder (Nominatim)
const GEOCODE_URL = "https://nominatim.openstreetmap.org/search";

let lastGeocodeTime = 0;

async function getCoordinates(address) {
  const now = Date.now();
  const timeSinceLast = now - lastGeocodeTime;
  if (timeSinceLast < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - timeSinceLast));
  }

  try {
    const cleanAddress = address
      .replace(/^(на|у|ул\.|по адресу:?|в)\s+/i, "")
      .trim();
    const query = `Вологда, ${cleanAddress}`;

    const fetchCoords = async (retryCount = 0) => {
      try {
        lastGeocodeTime = Date.now();
        const response = await axios.get(GEOCODE_URL, {
          params: {
            q: query,
            format: "json",
            limit: 1,
            addressdetails: 1,
          },
          timeout: 10000,
          headers: { "User-Agent": "PalisadMuralParser/1.4" },
        });
        return response;
      } catch (error) {
        if (error.response && error.response.status === 429 && retryCount < 2) {
          console.log(`! Rate limit (429). Ждем 5 сек и пробуем снова...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return fetchCoords(retryCount + 1);
        }
        throw error;
      }
    };

    const response = await fetchCoords();
    if (response.data && response.data.length > 0) {
      return [
        parseFloat(response.data[0].lat),
        parseFloat(response.data[0].lon),
      ];
    }
  } catch (error) {
    console.error(`! Ошибка геокодирования "${address}":`, error.message);
  }
  return null;
}

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return;
  try {
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
      timeout: 20000,
    });
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    console.error(`! Ошибка скачивания фото (${url}):`, error.message);
  }
}

function transliterate(text) {
  const rus = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
  const eng = [
    "a",
    "b",
    "v",
    "g",
    "d",
    "e",
    "e",
    "zh",
    "z",
    "i",
    "y",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "r",
    "s",
    "t",
    "u",
    "f",
    "h",
    "ts",
    "ch",
    "sh",
    "sh",
    "",
    "y",
    "",
    "e",
    "yu",
    "ya",
  ];
  return text
    .toLowerCase()
    .split("")
    .map((char) => {
      const index = rus.indexOf(char);
      if (index !== -1) return eng[index];
      if (/[a-z0-9]/.test(char)) return char;
      return "-";
    })
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function parse() {
  const addresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
  const authors = JSON.parse(fs.readFileSync(AUTHORS_FILE, "utf8"));

  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  }

  for (let i = 1; i <= 5; i++) {
    const filePath = path.join(__dirname, `${i}.json`);
    if (!fs.existsSync(filePath)) continue;

    const items = JSON.parse(fs.readFileSync(filePath, "utf8"));
    console.log(`\n--- Обработка ${i}.json (${items.length} постов) ---`);

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      process.stdout.write(`[${i}.json] Пост ${j + 1}/${items.length}... `);

      const text = item.text;
      const imageUrl = item.image;

      // 1. Поиск адреса
      ADDRESS_REGEX.lastIndex = 0;
      ADDRESS_STRICT_REGEX.lastIndex = 0;

      let match = ADDRESS_REGEX.exec(text);
      if (!match) {
        match = ADDRESS_STRICT_REGEX.exec(text);
      }

      if (!match) {
        console.log("Адрес не найден.");
        continue;
      }

      let street = match[1].trim();
      const house = match[2].trim();
      street = street.replace(/^(на|у|ул\.|по адресу:?|в)\s+/i, "").trim();
      const fullAddress = `${street}, ${house}`;

      const exists = addresses.some((a) => {
        const title = a.title.toLowerCase();
        const search = fullAddress.toLowerCase();
        return (
          title === search || title.includes(search) || search.includes(title)
        );
      });

      if (exists) {
        console.log(`Пропуск (уже есть: ${fullAddress}).`);
        continue;
      }

      console.log(`\n>>> НОВЫЙ АДРЕС: ${fullAddress}`);

      // 2. Поиск автора
      let authorId = "author_unknown";
      VK_ID_REGEX.lastIndex = 0;
      let authorMatch = VK_ID_REGEX.exec(text);
      if (authorMatch) {
        const vkType = authorMatch[1];
        const vkId = authorMatch[2];
        const name = authorMatch[3];
        const vkLink = `https://vk.com/${vkType}${vkId}`;

        let author = authors.find((a) => a.link === vkLink);
        if (!author) {
          authorId = `author_${authors.length + 1}`;
          author = { id: authorId, name, link: vkLink };
          authors.push(author);
          console.log(`+ Новый автор: ${name}`);
        } else {
          authorId = author.id;
        }
      } else {
        ARTIST_LABEL_REGEX.lastIndex = 0;
        const labelMatch = ARTIST_LABEL_REGEX.exec(text);
        if (labelMatch) {
          const name = labelMatch[1].trim();
          let author = authors.find(
            (a) => a.name.toLowerCase() === name.toLowerCase(),
          );
          if (!author) {
            authorId = `author_${authors.length + 1}`;
            author = { id: authorId, name, link: "https://vk.com/" };
            authors.push(author);
            console.log(`+ Новый автор: ${name}`);
          } else {
            authorId = author.id;
          }
        }
      }

      // 3. Координаты
      console.log(`Запрос координат для "${fullAddress}"...`);
      const coords = await getCoordinates(fullAddress);
      if (!coords) {
        console.log(`! Координаты не найдены.`);
        continue;
      }

      // 4. Фото
      const filename = `${transliterate(street + "-" + house)}.jpg`;
      const destPath = path.join(PHOTOS_DIR, filename);
      if (imageUrl) {
        console.log(`Скачивание фото...`);
        await downloadImage(imageUrl, destPath);
      }

      // 5. Сохранение
      addresses.push({
        title: fullAddress,
        coordinates: coords,
        image: `/images/photos/${filename}`,
        authorId: authorId,
      });

      fs.writeFileSync(
        ADDRESSES_FILE,
        JSON.stringify(addresses, null, 2),
        "utf8",
      );
      fs.writeFileSync(AUTHORS_FILE, JSON.stringify(authors, null, 2), "utf8");

      console.log(`✓ ГОТОВО: ${fullAddress}`);
    }
  }

  console.log("\nПарсинг завершен.");
}

parse();
