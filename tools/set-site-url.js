/*
  Запускается автоматически при публикации (см. .github/workflows/deploy.yml).
  Подставляет адрес сайта вместо __SITE_URL__ в превью ссылок, sitemap.xml и robots.txt.
  Адрес берётся из SITE_URL в config.js, а если он пустой — из адреса GitHub Pages.
  Использование: node tools/set-site-url.js <папка-сайта> <запасной-адрес>
*/
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || '_site';
const fallback = process.argv[3] || '';
const config = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
const match = config.match(/SITE_URL:\s*'([^']*)'/);
const url = ((match && match[1].trim()) || fallback.trim()).replace(/\/+$/, '');

if (!/^https?:\/\//.test(url)) {
  console.error('Не удалось определить адрес сайта: впиши SITE_URL в config.js');
  process.exit(1);
}

let changed = 0;
(function walk(folder) {
  for (const name of fs.readdirSync(folder)) {
    const file = path.join(folder, name);
    if (fs.statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.(html|xml|txt)$/.test(name)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('__SITE_URL__')) continue;
    fs.writeFileSync(file, text.split('__SITE_URL__').join(url));
    changed++;
  }
})(dir);

console.log('Адрес сайта: ' + url + ' (обновлено файлов: ' + changed + ')');
