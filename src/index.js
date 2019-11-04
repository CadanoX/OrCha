import '../css/style.css';

import Papa from 'papaparse';
import ace from 'ace-builds';
import 'ace-builds/webpack-resolver';
import OrCha from './OrCha';

var editors = {};
var orcha;
var data = {
  streams: [],
  links: [],
  tags: []
};

const example = {
  streams: `name,start,end,color,parentStart,parentEnd
Literature,1,10,lightblue
Vaudeville,1,6,#D77,
Theater,1,10,#D77`,
  links: `from,start,to,end,color
Vaudeville,6,Theater,6,blue`,
  tags: `stream,time,text,type,format,size
Literature,1907,Mother Earth,outer
Theater,1924,Cherry Lane Theater,inner`
};

document.addEventListener('DOMContentLoaded', async function(event) {
  orcha = new OrCha(document.querySelector('#chart'));
  setupEditors();
});

function setupEditors() {
  for (let name of ['streams', 'links', 'tags']) {
    let div = document.querySelector('#editor-' + name);
    let storedData = retreiveData(name);
    div.innerHTML = storedData && storedData != '' ? storedData : example[name];

    editors[name] = ace.edit('editor-' + name);
    editors[name].setTheme('ace/theme/monokai');
    editors[name].session.setMode('ace/mode/javascript');
    editors[name].on('change', () => onDataChanged(name));
    onDataChanged(name);
  }

  // init
}

function onDataChanged(name) {
  let content = editors[name].getValue();
  let parsed = parseCSV(content);
  if (parsed) {
    storeData(name, content);
    data[name] = parsed;
    orcha.data(data);
  }
}

function parseCSV(data) {
  try {
    return Papa.parse(data, { header: true }).data;
  } catch (e) {
    alert(e);
    return false;
  }
}

function storeData(name, data) {
  localStorage[name] = data;
}

function retreiveData(name) {
  return localStorage[name];
}
