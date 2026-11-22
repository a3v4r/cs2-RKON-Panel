# Состояние проекта

Обновлено: 2026-11-22. Этот файл читают все сессии, которые работают с панелью и плагинами, и обновляют его в конце работы.

## Где что лежит

| Папка | Ветка | Что там |
|---|---|---|
| `C:\dev\cs2\cs2-RKON-Panel` | `ui-redesign` (запушена, в `main` не влита) | основная копия панели Matchdesk |
| `C:\dev\cs2\cs2-RKON-Panel-plugins` | `plugins` (git worktree от `ui-redesign`, коммит `7713dc5`, не запушена) | вкладка «Настройки → Плагины» |
| `C:\dev\cs2\MatchZy-Patched` | `sync-upstream-0.9.1` (коммит `f24e27d`, в `main` форка не влит) | форк MatchZy, исправлен путь бэкапов раундов |
| `C:\dev\cs2\cs2-WeaponPaints-sqlite` | `screen-menu` (коммит `435320b`, в `main` форка не влит) | форк WeaponPaints на SQLite, экранное меню скинов |
| `C:\cs2server\cs2` | — | установка CS2 для тестов (одна на все серверы панели) |

Правило для параллельной работы: в основных папках репозиториев ветки не переключать. Под новую задачу делать отдельный `git worktree` с новой веткой.

## Панель: что сделано в `ui-redesign`

- Интерфейс в стиле Quatrix, русский и английский языки.
- Разделы:
  - Обзор, Консоль, Чат, Игроки;
  - Карты, Матч и Запуск матча;
  - Серверы, Бэкапы, Пользователи, Настройки.
  - Раздел «Аналитика» удалён.
- **Серверы из панели.** Мастер создания сервера, запуск `cs2.exe` без окна консоли (`src/server/instances.ts`), обновление CS2 через steamcmd.
  - В аргументы запуска входит `-allow_round_backup_files`: без него CS2 не пишет бэкапы раундов.
- **Библиотека команд** (`teams.json`): составы по SteamID попадают в конфиг MatchZy, названия команд — в `mp_teamname_1/2`, теги — в «Игроки».
- **Режим Vanilla** для серверов без MatchZy. Хранится у сервера в поле `mode: 'vanilla'`; если поля нет, сервер работает с MatchZy.
  - Логика в `src/lib/vanilla.ts`, интерфейс в `src/components/server/vanilla-match.tsx`.
  - Правила 5на5 MR12 и 2на2 MR8 отправляются по RCON пачками cvar.
  - Ножевой раунд, после него «Остаться» или «Сменить стороны».
  - Откат раунда через `mp_backup_restore_load_file`.
- **Обзор.** «Форс-старт» (`css_start`), переключатель ножевого раунда (`css_roundknife`, состояние берётся из ответа сервера), средний пинг по графику.

## Плагины (ветка `plugins`)

- Закоммичено: `7713dc5` в ветке `plugins` (worktree `C:\dev\cs2\cs2-RKON-Panel-plugins`, от `ui-redesign` ffd913a). Не запушено и не влито в `ui-redesign`.
- Набор плагинов один на всю установку CS2: Metamod, CounterStrikeSharp, MatchZy, WeaponPaints. Код в `src/server/plugins.ts`, `src/app/api/plugins/route.ts` и `src/components/settings/plugins-settings.tsx`.
- **Зависимости.** MatchZy и WeaponPaints требуют CounterStrikeSharp, а он требует Metamod.
- **Откуда качаются.**
  - Metamod — с alliedmods;
  - CounterStrikeSharp — сборка `with-runtime` из официальных релизов;
  - форки — из GitHub Releases.
- **Выключение не удаляет плагин.**
  - Плагин переносится в `plugins/disabled`.
  - `.vdf` CounterStrikeSharp уходит в `addons/metamod/disabled`.
  - Metamod убирается из `gameinfo.gi`.
  - Удаление с диска — отдельной кнопкой.
- **Обновления** ставятся только по кнопке. Файлы в `cfg/` и `configs/` при этом не перезаписываются, а предыдущий архив хранится для отката.
- Без MatchZy серверы панели переходят в режим Vanilla.
- Пока идёт установка, серверы не запускаются. Перед операцией панель проверяет, что `cs2.exe` не запущен.
- **Что нужно от владельца.**
  - Сделать публичными `a3v4r/MatchZy-Patched` и `a3v4r/cs2-WeaponPaints-sqlite`. Сейчас GitHub отвечает 404, и панель не может скачать форки.
  - Влить `f24e27d` в `main` форка MatchZy: workflow соберёт релиз.
  - Влить ветку `screen-menu` форка WeaponPaints (`435320b`) в `main`: там своё экранное меню скинов (A/D листать, E выбрать, R выход), MenuManagerCS2 больше не нужен. В игре ещё не проверено.
- **WeaponPaints и `FollowCS2ServerGuidelines`.** Скины применяются, только если в `configs/core.json` CounterStrikeSharp стоит `false`. Установщик панели этот флаг пока не меняет: на чистой установке скины молча не работают. На тестовой установке `C:\cs2server\cs2` флаг уже переключён вручную.
- **Префикс в чате** (ветка `plugins`, не закоммичено): «Настройки → Общие → Префикс в чате», по умолчанию `Server`. Панель пишет его в `cfg/MatchZy/config.cfg` (`matchzy_chat_prefix`) и в `WeaponPaints.json` (`ChatPrefix`, новая настройка форка) при сохранении и перед каждым запуском сервера; MatchZy на запущенных серверах меняется сразу по RCON. Брендинг `Esports MIREA` убран из `cfg/MatchZy/config.cfg` форка MatchZy (префикс и `matchzy_hostname_format`), не закоммичено.
- **Сайт для выбора скинов:** `C:\dev\cs2\cs2-skins-web` (порт 80, git init, без коммитов). Отдельное приложение, не раздел Matchdesk: панель хранит RCON-пароли. Только локальная сеть, Node без зависимостей. Вход без ввода: сайт по RCON спрашивает `css_wp_who <ip браузера>`, сессия живёт, пока игрок на сервере за тем же компьютером (`css_wp_ip`). Пишет в sqlite плагина и шлёт `css_wp_reload <steamid>`. `!site` показывает адрес (`"Website": "auto"` — имя компьютера, для имён вида `DESKTOP-XXXXX` — LAN IP). Вход по IP проверен живым игроком 2026-11-22. Команды в `WebReload.cs` форка, не закоммичено, на тестовый сервер выложено.
- **Мелочи.**
  - Версии плагинов записываются в `data/plugins.json`, привязки к папке CS2 нет.
  - Тестовая панель плагинов работала на порту 3011, потому что порт 3001 занят Grafana.

## Как тестировать

- Запуск: `npm run dev` (порт 3000).
- Управление сервером через API:
  - запуск: `POST /api/servers/1/process {"action":"start"}`;
  - команды RCON: `POST /api/servers/1/rcon {"command": "..."}`.
- Лог сервера: `C:\cs2server\cs2\game\csgo\console_server1.log`.
- Тестовый матч с ботами: `bot_quota 4`. Чтобы проверить режим Vanilla, MatchZy на сервере выгружают.
- После теста: остановить сервер и удалить `*_round*.txt` из `game\csgo`.

## Что выяснили про CS2 1.42

- **Бэкапы раундов.** `mp_backup_round_file` принимает только путь относительно `csgo`, абсолютный путь отклоняется (`Rejecting round backup file path`). Файл `backup_roundNN.txt` хранит состояние на начало раунда NN+1.
- **Смена сторон.** `mp_swapteams` меняет местами и игроков, и `mp_teamname_1/2`.
- **Ответы RCON.** Из-за `sv_logecho` в них попадают строки лога вида `L dd/mm/yyyy …`, их нужно отфильтровывать.
- **Молчащие команды.** `css_settings` и `matchzy_knife_enabled_default` по RCON ничего не возвращают. Узнать, включён ли ножевой раунд, можно только переключив его.

## Дальше

1. Влить `plugins` в `ui-redesign`, затем `ui-redesign` в `main` и выпустить релиз.
2. Положить исправленный MatchZy в комплект сервера (`cs2-server-kit`).
