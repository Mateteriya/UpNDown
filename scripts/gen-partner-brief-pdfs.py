#!/usr/bin/env python3
"""Generate RU + EN friend-facing project notes for Up&Down."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs"
FONT_REG = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"


class BriefPDF(FPDF):
    def __init__(self, lang: str):
        super().__init__(format="A4")
        self.lang = lang
        self.set_auto_page_break(auto=True, margin=16)
        self.add_font("Body", "", FONT_REG)
        self.add_font("Body", "B", FONT_BOLD)
        self.set_margins(18, 14, 18)

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Body", "", 8)
        self.set_text_color(120, 120, 120)
        title = "Up&Down — project note" if self.lang == "en" else "Up&Down — заметка о проекте"
        self.cell(0, 5, title, align="L")
        self.cell(0, 5, str(self.page_no()), align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(210, 210, 210)
        self.line(18, self.get_y(), 192, self.get_y())
        self.ln(4)
        self.set_text_color(25, 25, 25)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Body", "", 7)
        self.set_text_color(140, 140, 140)
        note = (
            "October 2026 · up2down.online / up2down.ru"
            if self.lang == "en"
            else "октябрь 2026 · up2down.online / up2down.ru"
        )
        self.cell(0, 4, note, align="C")

    def h1(self, text: str) -> None:
        self.set_font("Body", "B", 15)
        self.multi_cell(0, 7, text)
        self.ln(1)

    def h2(self, text: str) -> None:
        self.ln(2)
        self.set_font("Body", "B", 11)
        self.set_text_color(40, 70, 110)
        self.multi_cell(0, 5.8, text)
        self.ln(0.8)
        self.set_text_color(25, 25, 25)

    def p(self, text: str) -> None:
        self.set_font("Body", "", 9.2)
        self.multi_cell(0, 4.7, text)
        self.ln(1)

    def bullet(self, text: str) -> None:
        self.set_font("Body", "", 9.2)
        self.cell(4.5, 4.7, chr(8226))
        self.multi_cell(0, 4.7, text)
        self.ln(0.25)

    def meta(self, text: str) -> None:
        self.set_font("Body", "", 8.5)
        self.set_text_color(100, 100, 100)
        self.multi_cell(0, 4.3, text)
        self.set_text_color(25, 25, 25)
        self.ln(2)

    def row(self, left: str, right: str, col1: float = 50) -> None:
        usable = self.w - self.l_margin - self.r_margin
        col2 = usable - col1
        y0 = self.get_y()
        if y0 > 270:
            self.add_page()
            y0 = self.get_y()
        self.set_font("Body", "B", 8.8)
        self.multi_cell(col1, 4.5, left)
        y1 = self.get_y()
        self.set_xy(self.l_margin + col1, y0)
        self.set_font("Body", "", 8.8)
        self.multi_cell(col2, 4.5, right)
        self.set_y(max(y1, self.get_y()) + 0.6)


def build_en(pdf: BriefPDF) -> None:
    pdf.add_page()
    pdf.h1("Up&Down — project note")
    pdf.meta(
        "October 2026 · started from scratch February 2026 · solo · "
        "up2down.online · up2down.ru"
    )

    pdf.h2("1. What it is")
    pdf.p(
        "A skill card game: you bid the exact number of tricks you will take. "
        "36-card deck, 3 or 4 players. Quick mode and a longer full cycle with "
        "up/down deals, no-trump, and blind bidding (bid before you see cards)."
    )
    pdf.p(
        "Genre family: Oh Hell! / Up and Down the River / exact-bidding trick-taking — "
        "closer to Preferans or Bridge in spirit (read the table, plan) than to Durak "
        "or casual solitaire."
    )

    pdf.h2("2. What’s already built")
    pdf.row("Play", "Offline vs AI (novice / amateur / expert); classic + extended cycle; 3p and 4p")
    pdf.row("Online", "Rooms, chat, public hall (flag); WS v2 path + Supabase Realtime fallback")
    pdf.row("Identity", "Profile (name, avatar, profileId), OAuth (incl. RU providers), ELO, cloud + local archive")
    pdf.row("Skill layer", "Bid accuracy, play-style labels, milestones / frames, personal stats in account")
    pdf.row("Party mode", "PC host + QR + LAN APK (“basement” Wi-Fi party without the public internet)")
    pdf.row("Product polish", "Sound v1, RU/EN, rules in-app, donate, dual deploy (.online + .ru)")
    pdf.row("In progress", "Production-hardening of public WebSocket (auth, hand privacy, server-side finish/Elo)")
    pdf.row("Not ready", "Premium UI, IAP/store apps, CC tournament UI, phone-as-host (WebRTC scaffold only)")

    pdf.h2("3. Tech overview")
    pdf.p(
        "Client: React 18, TypeScript, Vite, PWA. Mobile shell: Capacitor 8 (Android; "
        "party APK exists, Play Store not started). Desktop game = browser/PWA; "
        "Tauri is only considered for a host utility, not the main game exe."
    )
    pdf.p(
        "Backend split: Supabase = Auth, profiles, match archive, ELO. Custom Node "
        "WebSocket server v2 = authoritative table during play (client sends commands, "
        "server runs the engine, broadcasts state). On the intended prod path the client "
        "should not be allowed to invent scores or peek other hands."
    )
    pdf.p(
        "Local data: IndexedDB archive, local rating by profileId. Feature flags switch "
        "transports and unfinished layers (CC, hall, premium stubs). Tests: Vitest on "
        "rules/engine pieces. Rough size: ~310 client TS/TSX files, ~40 server TS, "
        "~65 internal docs, ~300 commits since February."
    )
    pdf.p(
        "Layout discipline is unusual for indie: explicit mobile vs desktop breakpoints, "
        "tablet table calibrated to a reference size with proportional scale — so PC "
        "polish doesn’t quietly break phones."
    )

    pdf.add_page()
    pdf.h2("4. What makes it distinctive")
    pdf.bullet("Author full cycle — not only up/down, but no-trump and blind deals as first-class modes.")
    pdf.bullet("Two worlds at once: cloud online and true offline LAN party (QR guests, optional APK).")
    pdf.bullet("Dual skill axis: ELO (ladder) plus bid accuracy / style (how you play, not only if you won).")
    pdf.bullet("Server-authoritative design goal for rated multiplayer (honesty before monetization).")
    pdf.bullet("RU accessibility: separate .ru mirror + OAuth paths that work without VPN in practice.")
    pdf.bullet("Legal layering kept conscious: soft premium / virtual CC first; real-money arena deferred.")

    pdf.h2("5. Comparisons (honest)")
    pdf.row("Oh Hell! / Trickster Cards", "Same exact-bid family; Up&Down adds author bonus deals, RU-first UX, LAN host.", 58)
    pdf.row("Preferans apps (RU)", "Also serious trick-taking; different rules, heavier culture; Up&Down is easier entry, different skill loop.", 58)
    pdf.row("Bridge Base Online", "Huge social/online scale; different game and complexity. Up&Down is shorter learning + party formats.", 58)
    pdf.row("Jackbox-style party apps", "Share QR / phones as controllers — similar social move, but here the payload is a real skill game.", 58)
    pdf.row("Mass Durak / solitaire apps", "Bigger TAM, shallower retention thesis. Up&Down bets on loyalty of “thinking cards” players.", 58)
    pdf.p(
        "Niche is smaller than mass card apps, but direct clones of this rules + online + "
        "LAN-party combo are rare. That’s the bet."
    )

    pdf.h2("6. Potential (as I see it)")
    pdf.bullet("Retention via skill: people who like exact bidding usually come back to beat their accuracy/ELO.")
    pdf.bullet("Social loop: friends online + real-table parties (clubs, trips, evenings) without needing casino framing.")
    pdf.bullet("Soft revenue path: premium history/analytics, cosmetics, later IAP — without jumping straight into gambling licences.")
    pdf.bullet("EN already partially ready (i18n); after RU core stability, international reach is plausible.")
    pdf.bullet("Risks: niche TAM, solo bandwidth, unfinished public-WS trust, monetization still stub.")

    pdf.h2("7. Timeline guess (same pace)")
    pdf.row("Honest public online", "roughly Q1 2027")
    pdf.row("Soft premium you can charge for", "around spring 2027 (Q2)")
    pdf.row("Store Android + CC tournaments", "2H 2027")
    pdf.row("Phone host + iOS + tutorial", "more like 2028 if still solo")
    pdf.p(
        "Depends what “production” means. Playable beta is already here; "
        "trusted multiplayer and paid soft launch are the next real gates."
    )

    pdf.h2("8. Why I’m sharing this")
    pdf.p(
        "You’re good at reading projects. I’d like an honest take: what’s solid, "
        "what’s naive, what you’d watch closely. No expectation that you join or "
        "build anything — a sharp skim is already valuable."
    )
    pdf.p("Thanks for reading.")


def build_ru(pdf: BriefPDF) -> None:
    pdf.add_page()
    pdf.h1("Up&Down — заметка о проекте")
    pdf.meta(
        "октябрь 2026 · старт с нуля февраль 2026 · соло · "
        "up2down.online · up2down.ru"
    )

    pdf.h2("1. Что это")
    pdf.p(
        "Карточная игра на взятки с точным заказом: нужно угадать, сколько взяток "
        "возьмёшь. Колода 36 карт, 3 или 4 игрока. Быстрый режим и длинный полный цикл: "
        "вверх/вниз, бескозырка, «тёмная» (заказ до просмотра карт)."
    )
    pdf.p(
        "Семейство жанра: Oh Hell! / Up and Down the River / exact bidding — "
        "по духу ближе к преферансу или бриджу (читать стол, планировать), "
        "чем к дураку или казуальному пасьянсу."
    )

    pdf.h2("2. Что уже сделано")
    pdf.row("Игра", "Офлайн vs ИИ (новичок / любитель / эксперт); классика + расширенный цикл; 3 и 4 игрока")
    pdf.row("Онлайн", "Комнаты, чат, публичный зал (флаг); путь WS v2 + запасной Supabase Realtime")
    pdf.row("Профиль", "Имя, аватар, profileId, OAuth (в т.ч. РФ), ELO, локальный + облачный архив")
    pdf.row("Skill", "Точность заказа, стиль игры, цели/рамки, персональная статистика в ЛК")
    pdf.row("Вечеринка", "ПК-хост + QR + LAN APK («подвал» по Wi-Fi без публичного интернета)")
    pdf.row("Полировка", "Звук v1, RU/EN, правила в приложении, донат, двойной деплой (.online + .ru)")
    pdf.row("В работе", "Прод-hardening публичного WebSocket (auth, приватность рук, конец партии/Elo с сервера)")
    pdf.row("Не готово", "UI премиума, IAP/сторы, турниры CC, хост с телефона (WebRTC — только задел)")

    pdf.h2("3. Технический обзор")
    pdf.p(
        "Клиент: React 18, TypeScript, Vite, PWA. Мобильная оболочка: Capacitor 8 "
        "(Android; вечериночный APK есть, Play Store не стартовали). ПК-игра = браузер/PWA; "
        "Tauri рассматривался скорее для утилиты хоста, не как основной exe игры."
    )
    pdf.p(
        "Бэкенд разделён: Supabase = Auth, профили, архив матчей, ELO. Свой Node "
        "WebSocket-сервер v2 = авторитетный стол во время партии (клиент шлёт команды, "
        "сервер крутит движок, рассылает state). На целевом прод-пути клиент не должен "
        "рисовать себе очки и подсматривать чужие карты."
    )
    pdf.p(
        "Локально: архив в IndexedDB, рейтинг по profileId. Фичефлаги переключают "
        "транспорт и неготовые слои (CC, зал, заглушки премиума). Тесты: Vitest на "
        "правилах/движке. Объём порядка: ~310 клиентских TS/TSX, ~40 серверных TS, "
        "~65 внутренних доков, ~300 коммитов с февраля."
    )
    pdf.p(
        "Вёрстка стола для indie необычно дисциплинирована: отдельные контракты "
        "mobile/desktop, планшет калибруется от эталонного размера с пропорциональным "
        "scale — чтобы ПК-полировка не ломала телефоны."
    )

    pdf.add_page()
    pdf.h2("4. Особенности")
    pdf.bullet("Авторский полный цикл — не только вверх/вниз, но бескозырка и тёмная как полноценные режимы.")
    pdf.bullet("Два мира сразу: облачный онлайн и настоящая LAN-вечеринка (гости по QR, опционально APK).")
    pdf.bullet("Двойная ось скилла: ELO (лестница) + точность заказа / стиль (как играешь, не только победил ли).")
    pdf.bullet("Цель по мультиплееру — server-authoritative (честность стола раньше монетизации).")
    pdf.bullet("Доступность из РФ: отдельное зеркало .ru + OAuth-пути, которые на практике ходят без VPN.")
    pdf.bullet("Юридические слои держатся осознанно: сначала soft/премиум и виртуальные CC; real-money — далеко.")

    pdf.h2("5. С чем сравнить (честно)")
    pdf.row("Oh Hell! / Trickster Cards", "То же семейство exact-bid; у Up&Down — свои бонусные раздачи, RU-first UX, LAN-хост.", 58)
    pdf.row("Преферанс-приложения (RU)", "Тоже «серьёзные» взятки; другие правила и культура входа. У Up&Down короче вход, другой skill-loop.", 58)
    pdf.row("Bridge Base Online", "Огромный онлайн/социум; другая игра и сложность. У Up&Down короче обучение + party-форматы.", 58)
    pdf.row("Jackbox и party-apps", "QR / телефоны гостей — похожий социальный ход, но здесь внутри настоящая skill-игра.", 58)
    pdf.row("Массовый дурак / пасьянсы", "Больше рынок, слабее тезис удержания. Up&Down ставит на лояльность «думающих» карточных.", 58)
    pdf.p(
        "Ниша меньше, чем у массовых карточных приложений, но прямых клонов именно этой "
        "связки правил + онлайн + LAN-вечеринка мало. На этом и ставка."
    )

    pdf.h2("6. Потенциал (как я это вижу)")
    pdf.bullet("Удержание через скилл: кому зашёл точный заказ, обычно возвращаются бить точность/ELO.")
    pdf.bullet("Социальный контур: друзья онлайн + живые вечера/клубы/поездки без казино-обёртки.")
    pdf.bullet("Soft-доход: премиум по истории/аналитике, косметика, позже IAP — без прыжка сразу в gambling-лицензии.")
    pdf.bullet("EN уже частично готов (i18n); после стабилизации RU-ядра международный заход реалистичен.")
    pdf.bullet("Риски: узкий TAM, соло-пропускная способность, незакрытый trust публичного WS, монетизация ещё stub.")

    pdf.h2("7. Оценка сроков (тот же темп)")
    pdf.row("Честный публичный онлайн", "примерно Q1 2027")
    pdf.row("Soft-премиум, за который можно просить деньги", "около весны 2027 (Q2)")
    pdf.row("Android в сторе + турниры CC", "2H 2027")
    pdf.row("Хост с телефона + iOS + обучение", "скорее 2028, если всё ещё соло")
    pdf.p(
        "Зависит, что считать «продом». Играбельная бета уже есть; "
        "доверенный мультиплеер и soft-запуск оплаты — следующие настоящие ворота."
    )

    pdf.h2("8. Зачем делюсь")
    pdf.p(
        "Ты хорошо читаешь проекты. Хочется честного взгляда: что крепко, что наивно, "
        "за чем бы ты следил. Без ожидания, что ты подключишься или что-то построишь — "
        "острый просмотр уже ценен."
    )
    pdf.p("Спасибо, что читаешь.")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    en = BriefPDF("en")
    build_en(en)
    en_path = OUT_DIR / "UpNDown-friend-note-EN-2026-10.pdf"
    en.output(str(en_path))

    ru = BriefPDF("ru")
    build_ru(ru)
    ru_path = OUT_DIR / "UpNDown-zametka-druzyu-RU-2026-10.pdf"
    ru.output(str(ru_path))

    print(f"Wrote {en_path}")
    print(f"Wrote {ru_path}")


if __name__ == "__main__":
    main()
