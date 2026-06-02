# Up&Down Program Portal

Enterprise-дашборд: концепция, roadmap (~90 шагов), чеклисты, документы, неон-KPI.

## Публичный адрес (после деплоя)

**https://mateteriya.github.io/UpNDown/#/**

| Раздел | Ссылка |
|--------|--------|
| Дашборд | https://mateteriya.github.io/UpNDown/#/ |
| Roadmap | https://mateteriya.github.io/UpNDown/#/roadmap |
| Приложение | https://mateteriya.github.io/UpNDown/#/app |
| Ресурсы | https://mateteriya.github.io/UpNDown/#/resources |

Деплой: push в `main` → GitHub Actions **Deploy Program Portal**.  
В настройках репозитория: **Settings → Pages → Build and deployment → Source: GitHub Actions** (один раз).

## Локальная разработка

```bash
npm run handbook:dev
```

→ http://localhost:5199/UpNDown/#/

Первый раз: `cd docs-site && npm install`

## Разделы

| Вкладка | Содержание |
|---------|------------|
| **Дашборд** | KPI, направления, кварталы, вехи |
| **Ресурсы** | Документы .md в портале |
| **Roadmap** | Чеклисты |
| **Приложение** | WS / IAP / CC |

Прогресс: `localStorage` · экспорт JSON в шапке.
