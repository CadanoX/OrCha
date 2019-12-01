import '../css/style.css';

import * as d3 from 'd3';
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
var popupTag;
var popupStream;
var currentTag = {};
var currentDrag = {};
var dragTimeStart;
var linkInQueue;
let dragStartCoords = [0, 0];

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
    undefined,
    // document.querySelector('#d3graph'),
    onGraphReady
  );
  // cyto = new myCyto(document.querySelector('#graph'), onGraphUpdated);
  setupEditors();
  setupPopups();
  setupOptions();
});

function setupPopups() {
  // add tags and streams on keypress enter
  popupTag = document.querySelector('#popupTag');
  popupTag.querySelector('input').addEventListener('keyup', e => {
    if (e.keyCode === 13)
      popupTag.querySelector('button[type="submit"]').click();
  });
  popupStream = document.querySelector('#popupStream');
  popupStream.querySelector('input').addEventListener('keyup', e => {
    if (e.keyCode === 13)
      popupStream.querySelector('button[type="submit"]').click();
  });
}

function setupOptions() {
  let options = document.querySelectorAll('#options > div');
  for (let option of options) {
    option.querySelector('input').oninput = () => forceParameterChanged(option);
    option.querySelector('input').onchange = () => {
      let text = option.querySelector('.value');
      text.innerText = option.querySelector('input').value;
    };
  }
}

function forceParameterChanged(option) {
  let valueText = option.querySelector('.value');
  let value = option.querySelector('input').value;
  valueText.innerText = value;
  orcha.updateForce(option.dataset.name, value);
}

function onGraphReady(data) {}

function getYear(x) {
  return Math.round(orcha._stream._streamData.xScale.invert(x));
}

function activateInteractions() {
  let tooltips = orcha._stream._tooltipContainer;
  let streamCon = orcha._stream._pathContainer;

  tooltips.selectAll('*').remove();
  // add line to show current time
  let el = tooltips.append('g').attr('id', 'orientationLine');
  let el2 = tooltips.append('g').attr('id', 'orientationLine2');

  el.append('line')
    .attr('y1', orcha._stream._streamData.yScale(0))
    .attr('y2', orcha._stream._streamData.yScale(1));
  el.append('text').attr('y', orcha._stream._streamData.yScale(0));

  el2
    .append('line')
    .attr('y1', orcha._stream._streamData.yScale(0))
    .attr('y2', orcha._stream._streamData.yScale(1));
  el2.append('text').attr('y', orcha._stream._streamData.yScale(0));

  orcha._stream._zoomContainer.on('mousemove', function() {
    updateLine('orientationLine', d3.mouse(this));
  });

  let streams = streamCon
    .selectAll('path.stream')
    .filter(d => d.id != 'fakeRoot');
  // click on streams for tags
  streams.on('click', function(d) {
    let coords = d3.mouse(this);
    currentTag.time = getYear(coords[0]);
    currentTag.stream = d.id;
    showPopupTag();
  });

  orcha._stream._zoomContainer.call(
    d3
      .drag()
      .on('start', onStreamDragStarted)
      .on('drag', onStreamDragged)
      .on('end', onStreamDragEnded)
  );
}

function updateLine(id, coords) {
  let line = d3.select('#' + id);
  let diffX = coords[0] > dragStartCoords[0] ? -2 : 2;
  line.attr('transform', d => 'translate(' + (coords[0] + diffX) + ',0)');
  line.select('text').text(getYear(coords[0]));
}

function addInteractionLine(coords) {
  orcha._stream._zoomContainer
    .append('line')
    .classed('interactionLine', true)
    .attr('x1', coords[0] - 2)
    .attr('y1', coords[1] - 2)
    .attr('x2', coords[0] - 2)
    .attr('y2', coords[1] - 2);
}
function updateInteractionLine(coords) {
  let line = d3.select('.interactionLine');
  if (coords[0] < dragStartCoords[0]) {
    line.attr('x1', dragStartCoords[0] + 2);
    line.attr('x2', coords[0] + 2);
  } else {
    line.attr('x1', dragStartCoords[0] - 2);
    line.attr('x2', coords[0] - 2);
  }

  if (coords[1] < dragStartCoords[1] + 2) {
    line.attr('y1', dragStartCoords[1] + 2);
    line.attr('y2', coords[1] + 2);
  } else {
    line.attr('y1', dragStartCoords[1] - 2);
    line.attr('y2', coords[1] - 2);
  }
}

function onStreamDragStarted() {
  dragTimeStart = Date.now();
  let coords = d3.mouse(this);
  dragStartCoords = coords;
  currentDrag.startTime = getYear(coords[0]);
  let stream = d3.event.sourceEvent.path[0];
  // remove "stream" and "chart from the ID"
  currentDrag.startName = stream.classList.contains('stream')
    ? stream.id.slice(6, -5)
    : undefined;
  if (currentDrag.startName == 'fakeRoot') currentDrag.startName = undefined;

  addInteractionLine(coords);
  updateLine('orientationLine2', coords);
  d3.select('#orientationLine2').style('visibility', 'visible');
}

function onStreamDragged(d) {
  let coords = d3.mouse(this);
  updateInteractionLine(coords);
  updateLine('orientationLine2', coords);
}

function onStreamDragEnded() {
  let dragTime = Date.now() - dragTimeStart;
  d3.select('.interactionLine').remove();
  d3.select('#orientationLine2').style('visibility', 'hidden');
  // if drag is too fast, it is a click
  if (dragTime < 300) {
    currentDrag = {};
    return;
  }

  let coords = d3.mouse(this);
  currentDrag.endTime = getYear(coords[0]);
  let stream = d3.event.sourceEvent.path[0];
  // remove "stream" and "chart from the ID"
  currentDrag.endName = stream.classList.contains('stream')
    ? stream.id.slice(6, -5)
    : undefined;
  if (currentDrag.endName == 'fakeRoot') currentDrag.endName = undefined;

  handleDrag(currentDrag);
}

function handleDrag(drag) {
  // swap time to always go from lower to higher
  if (drag.endTime < drag.startTime) {
    [drag.endTime, drag.startTime] = [drag.startTime, drag.endTime];
    [drag.endName, drag.startName] = [drag.startName, drag.endName];
  }
  // create new stream
  if (!drag.startName && !drag.endName) showPopupStream();
  // create a new stream linked to an existing stream
  else if (!drag.startName) {
    drag.endTime -= 1;
    linkInQueue = {
      missing: 'startName',
      startTime: drag.endTime,
      endName: drag.endName
    };
    showPopupStream();
  } else if (!drag.endName) {
    linkInQueue = {
      missing: 'endName',
      startTime: drag.startTime,
      startName: drag.startName
    };
    drag.startTime += 1;
    showPopupStream();
  }
  // create nested stream
  else if (drag.startName == drag.endName) {
    drag.parent = drag.startName;
    showPopupStream();
  }
  // create link between 2 existing streams
  else addLink(drag);
}

function showPopupTag() {
  popupTag.style.visibility = 'visible';
  popupTag.querySelector('input').focus();
}
window.onTagNameCancel = () => {
  popupTag.style.visibility = 'hidden';
  popupTag.querySelector('input').value = '';
  currentTag = {};
};
window.onTagNameOk = () => {
  currentTag.text = popupTag.querySelector('input').value;
  // remove commata because we use a CSV
  currentTag.text = currentTag.text.replace(/,/g, ';');
  addTag(currentTag);
  popupTag.style.visibility = 'hidden';
  popupTag.querySelector('input').value = '';
  currentTag = {};
};

function showPopupStream() {
  popupStream.style.visibility = 'visible';
  popupStream.querySelector('input').focus();
}
window.onStreamNameCancel = () => {
  popupStream.style.visibility = 'hidden';
  popupStream.querySelector('input').value = '';
  currentDrag = {};
  linkInQueue = undefined;
};
window.onStreamNameOk = () => {
  currentDrag.name = popupStream.querySelector('input').value;
  addStream(currentDrag);
  if (linkInQueue) {
    linkInQueue[linkInQueue.missing] = currentDrag.name;
    addLink(linkInQueue, true);
    linkInQueue = undefined;
  }
  popupStream.style.visibility = 'hidden';
  popupStream.querySelector('input').value = '';
  currentDrag = {};
};

function addTag(tag) {
  let e = editors['tags'];
  let col = e.session.getLength();
  e.moveCursorTo(col + 1, 0);
  e.insert(`\n${tag.stream},${tag.time},${tag.text}`);
}

function addStream(stream) {
  let e = editors['streams'];
  let col = e.session.getLength();
  e.moveCursorTo(col + 1, 0);
  // insert new stream
  if (!stream.parent) {
    e.insert(`\n${stream.name},${stream.startTime},${stream.endTime},orange`);
  } else {
    // insert nested stream
    e.insert(
      `\n${stream.name},${stream.startTime},${stream.endTime},orange,,${stream.parent}`
    );
  }
}
function addLink(link, merge = false) {
  let e = editors['links'];
  let col = e.session.getLength();
  if (link.startTime == link.endTime) link.endTime = '';
  e.moveCursorTo(col + 1, 0);
  if (!link.endTime)
    e.insert(`\n${link.startName},${link.startTime},${link.endName},,`);
  else
    e.insert(
      `\n${link.startName},${link.startTime},${link.endName},${link.endTime}`
    );
  if (merge) e.insert('merge');
}

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
    activateInteractions();
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
