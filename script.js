const STORAGE_KEY = "inventory_app_db_v2";

// ВСТАВЬТЕ СЮДА ССЫЛКУ НА ВАШУ БАЗУ ИЗ FIREBASE (без слеша в конце)
const FIREBASE_DB_URL =
  "https://inventory-feola-default-rtdb.europe-west1.firebasedatabase.app";
const ITEMS_ENDPOINT = `${FIREBASE_DB_URL}/items.json`;

// Единый объект базы данных (ключ -> объект позиции)
let appDatabase = {
  items: {},
};

// Элементы DOM
const form = document.getElementById("dataForm");
const nameInput = document.getElementById("itemName");
const qtyInput = document.getElementById("itemQty");
const itemsList = document.getElementById("itemsList");

// Вспомогательная функция: превращает название в безопасный ключ для базы
function createSafeKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.#$/[\]]/g, "_");
}

// 1. Загрузка локального кэша
function loadLocalCache() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (rawData) {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed.items === "object" && parsed.items !== null) {
        appDatabase = parsed;
      }
    }
  } catch (error) {
    console.error("Ошибка чтения localStorage:", error);
  }
}

// 2. Сохранение в localStorage
function saveLocalCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appDatabase));
  } catch (error) {
    console.error("Ошибка сохранения в localStorage:", error);
  }
}

// 3. Точечная отправка изменений в Firebase (PATCH не затирает чужие записи)
async function syncItemToCloud(key, itemData) {
  try {
    await fetch(ITEMS_ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: itemData }), // Если itemData === null, Firebase удалит ключ
    });
  } catch (error) {
    console.error("Ошибка синхронизации с облаком:", error);
  }
}

// 4. Подписка на изменения в реальном времени
function subscribeToRealtimeUpdates() {
  const eventSource = new EventSource(ITEMS_ENDPOINT);

  // Первичная загрузка или полная перезапись ветки
  eventSource.addEventListener("put", (event) => {
    try {
      const payload = JSON.parse(event.data);
      appDatabase.items = payload.data || {};
      saveLocalCache();
      renderList();
    } catch (err) {
      console.error("Ошибка обработки события put:", err);
    }
  });

  // Точечное обновление от других телефонов
  eventSource.addEventListener("patch", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.data) {
        Object.entries(payload.data).forEach(([key, value]) => {
          if (value === null) {
            delete appDatabase.items[key];
          } else {
            appDatabase.items[key] = value;
          }
        });
        saveLocalCache();
        renderList();
      }
    } catch (err) {
      console.error("Ошибка обработки события patch:", err);
    }
  });

  eventSource.onerror = () => {
    console.warn("Потеряно соединение с базой. Попытка переподключения...");
  };
}

// 5. Отрисовка списка с сортировкой по алфавиту
function renderList() {
  itemsList.innerHTML = "";

  // Получаем массив записей и сортируем по алфавиту (с учетом кириллицы и цифр)
  const sortedEntries = Object.entries(appDatabase.items).sort(
    ([, a], [, b]) => {
      return a.name.localeCompare(b.name, "ru", {
        numeric: true,
        sensitivity: "base",
      });
    },
  );

  sortedEntries.forEach(([key, item]) => {
    const li = document.createElement("li");

    const infoDiv = document.createElement("div");
    infoDiv.className = "item-info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "item-name";
    nameSpan.textContent = item.name;

    const qtySpan = document.createElement("span");
    qtySpan.className = "item-qty";
    qtySpan.textContent = `Количество: ${item.quantity}`;

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(qtySpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Удалить";
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => removeItem(key));

    li.appendChild(infoDiv);
    li.appendChild(deleteBtn);
    itemsList.appendChild(li);
  });
}

// 6. Добавление или суммирование позиции
function addItem(name, quantity) {
  const normalizedName = name.trim();
  const numericQty = Number(quantity);

  if (!normalizedName || isNaN(numericQty) || numericQty <= 0) return;

  const key = createSafeKey(normalizedName);
  const existingItem = appDatabase.items[key];

  const updatedItem = {
    name: existingItem ? existingItem.name : normalizedName,
    quantity: (existingItem ? existingItem.quantity : 0) + numericQty,
    updatedAt: Date.now(),
  };

  appDatabase.items[key] = updatedItem;

  saveLocalCache();
  renderList();
  syncItemToCloud(key, updatedItem);
}

// 7. Удаление позиции
function removeItem(key) {
  delete appDatabase.items[key];
  saveLocalCache();
  renderList();
  syncItemToCloud(key, null);
}

// Обработка отправки формы
form.addEventListener("submit", (event) => {
  event.preventDefault();

  addItem(nameInput.value, qtyInput.value);

  nameInput.value = "";
  qtyInput.value = "";
  nameInput.focus();
});

// Переход по Enter из первого поля во второе
nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    qtyInput.focus();
  }
});

// Старт приложения
loadLocalCache();
renderList();
subscribeToRealtimeUpdates();
