'use strict';

const fs = require('fs');
const path = require('path');

// 워치리스트를 Electron userData 폴더의 JSON 파일에 영속 저장.
let filePath = null;

function init(userDataDir) {
  filePath = path.join(userDataDir, 'watchlist.json');
}

function load() {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) return data;
    return { items: [], settings: data.settings || {} };
  } catch (e) {
    return { items: [], settings: {} };
  }
}

function save(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { init, load, save };
