import '../css/style.css';

import Papa from 'papaparse';
import ace from 'ace-builds';
import 'ace-builds/webpack-resolver';
// import myCyto from './MyCyto';
import OrCha from './OrCha';
import { isNumeric, randomize, d3ToCyto } from './functions.js';

var editors = {};
var orcha;
// var cyto;
var data = {
  streams: [],
  links: [],
  tags: []
};

const example = {
  streams: `name,start,end,color,values
Literature,1896,2000,lightblue,{1896:20,1903:12}
Vaudeville,1898,1933,#D77,
Theater,1898,2000,#D77
Radical,1899,1953,#07E`,
  links: `from,start,to,end,merge
Vaudeville,1933,Theater
Radical,1903,Literature,1907
Literature,1919,Theater,`,
  tags: `stream,time,text,type,format,size
Literature,1907,Mother Earth,outer
Theater,1924,Cherry Lane Theater,inner`
};

document.addEventListener('DOMContentLoaded', async function(event) {
  orcha = new OrCha(
    document.querySelector('#chart'),
    document.querySelector('#d3graph'),
    onGraphUpdated
  );
  // cyto = new myCyto(document.querySelector('#graph'), onGraphUpdated);
  setupEditors();
});

function onGraphUpdated(data) {}

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

function onDataChanged(type) {
  let content = editors[type].getValue();
  let parsed = parseCSV(content);
  for (let line of parsed) line.values = parseValues(line.values);
  if (parsed) {
    storeData(type, content);
    data[type] = parsed;
    orcha.data(data);
    // cyto.data(orcha.graphData());
    // console.log(graphToDot(graphData));
  }
}

function parseCSV(data) {
  try {
    return Papa.parse(data, {
      header: true,
      skipEmptyLines: true
    }).data;
  } catch (e) {
    return false;
  }
}

function parseValues(data) {
  if (!data) return undefined;
  let newData = {};
  let entries = data.split('-');
  for (let entryString of entries) {
    let entry = entryString.split('/');
    let time = entry[0];
    let value = entry[1];
    if (!isNumeric(time) || !isNumeric(value)) continue;
    newData[time] = value;
  }
  if (Object.keys(newData).length === 0) return undefined;
  return newData;
}

function storeData(name, data) {
  localStorage[name] = data;
}

function retreiveData(name) {
  return localStorage[name];
}

function streamToDot(data) {
  let string = 'digraph G {\n';
  for (let i in data._timesteps) {
    let t = data._timesteps[i];

    // group nodes of timestep in subgraphs to limit them in x-direction
    /*string += 'subgraph {rank=same;';
    for (let id in t.references) {
      if (id == 'fakeRoot') continue;
      string += id + i + ';';
    }
    string += '}\n';*/
    string += '{node [rank=' + i + '];';
    for (let id in t.references) {
      if (id == 'fakeRoot') continue;
      string += id + i + ' ';
    }
    string += '}\n';

    // add node properties and edges
    for (let id in t.references) {
      let node = t.references[id];
      if (node.id == 'fakeRoot') continue;
      let parent = node.parent ? node.parent.id + i : undefined;
      //       string += `${node.id + i} [width=${node.size}]
      // `;
      // this is the alternative to using hierarchies
      //       if (parent && parent != 'fakeRoot' + i)
      //         string += `${parent + (i - 1)}->${node.id + i}
      // `;
      if (node.prev) {
        for (let prev of node.prev) {
          string += `${prev.id + (i - 1)}->${node.id + i}
`;
        }
      }
    }
  }
  return string + '}';
}

function graphToDot(data) {
  let string = 'digraph G {\n';
  for (let edge of data.elements.edges) {
    string += edge.data.source + '->' + edge.data.target + '\n';
  }
  return string + '}';
}
