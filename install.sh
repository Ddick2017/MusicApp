#!/bin/sh
# Установка плеера Music: ставит компоненты и добавляет ярлык с иконкой в меню программ
cd "$(dirname "$0")" || exit 1
APP="$PWD"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите его командой:"
  echo "  sudo apt install nodejs npm"
  exit 1
fi
V=$(node -v | sed 's/^v//; s/\..*//')
if [ "$V" -lt 18 ]; then
  echo "Нужен Node.js версии 18 или новее (сейчас $(node -v))."
  echo "Установите свежую версию: https://nodejs.org или через nvm."
  exit 1
fi
echo "Устанавливаю компоненты (нужен интернет, это может занять несколько минут)..."
npm install --no-audit --no-fund || { echo "Ошибка установки. Проверьте интернет и повторите."; exit 1; }
cat > start.sh <<EOF
#!/bin/sh
cd "$APP" || exit 1
exec ./node_modules/.bin/electron . --no-sandbox >> "$APP/log.txt" 2>&1
EOF
chmod +x start.sh
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/musicapp.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Music
Comment=Музыкальный плеер с текстами песен
Exec="$APP/start.sh"
Icon=$APP/build/icon.png
Terminal=false
Categories=AudioVideo;Audio;Player;
EOF
echo
echo "Готово! Найдите «Music» в меню программ (иногда нужно подождать пару секунд)."
echo "Или запустите вручную: $APP/start.sh"
