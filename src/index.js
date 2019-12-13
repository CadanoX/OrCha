import '../css/style.css';

import * as d3 from 'd3';
import Papa from 'papaparse';
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
let lastCursorCoords = [0, 0];

let sizeSliderDrag = {};
let sizeSliderHeight = 15;
let sizeSliderWidth = 30;

const editorHeader = {
  streams: 'name,start,end,color,values',
  links: 'from,start,to,end,merge',
  tags: 'stream,time,text,type,size,shape'
};
const example = {
  streams: `UptownGalleries,1954,1973,blue
Downtown,1972,1995,purple,
Literature,1896,2000,lightblue,1896/20-1900/20-1904/12-2000/10
LostGen,1921,1938,orange
Jackton,1956,1959,orange
Cassavetes,1953,1978,purple
JohnReed,1912,1915,blue,1912/2-1915/2
Vaudeville,1898,1933,#D77,1998/8-1933/4
OffBway,1955,1967,orange
Theater,1898,2000,#D77,1998/8-1910/8-1922/16-1935/8-1958/16-1970/10
Dance,1899,2000,#A88,1899/6-1908/2-1933/2-1935/4-2000/4
Film,1942,2000,purple
Radical,1899,1953,#07E,1899/10-1915/5-1953/2
VisualArt,1898,1964,#C46,1898/10-1910/10-1918/20-1928/20-1933/8-1940/10-1952/26-1958/26-1964/15
NewYorkSchool,1943,1957,orange,1943/1-1949/8-1952/18-1954/16,VisualArt
Burroughs,1971,1973,orange
CircleSquare,1951,1954,orange,,Theater
TheAnthology,1971,1973,orange
ElectArts,1972,1974,orange
Performance,1970,2000,orange
Regionalists,1921,1930,#C46
Music,1905,2000,#999,1905/8-1910/8-1911/4-1987/4-1988/8-2000/12
HotStyleJazz,1912,1987,#BBB,1911/4
TinPanAlley,1907,2000,purple,1950/1-1965/10
Weavers,1944,1961,purple
FolkRevival,1955,1961,orange,,Weavers
FolkRevival2,1962,1988,orange,1961/3-1965/5-1967/10-1968/8,TinPanAlley
ClassicRock,1974,1978,orange
HipHop,1976,1988,orange
MainstreamJazz,1974,1993,orange`,
  links: `Vaudeville,1933,Theater,,merge
Radical,1903,Literature,1907
Literature,1919,tag5,1923
tag2,1914,tag3,,merge
Literature,1910,JohnReed,1912
Cassavetes,1978,Downtown,,merge
JohnReed,1912,tag6
JohnReed,1914,tag7
tag7,1913,tag8
Radical,1906,JohnReed,1913
Theater,1985,Literature,1989
Literature,1920,LostGen,1921,merge
Literature,1955,Jackton,,merge
Literature,1970,Burroughs,,merge
Film,1987,Downtown,1992
Film,1970,TheAnthology,,merge
Film,1971,ElectArts,,merge
CircleSquare,1954,OffBway,,merge
OffBway,1966,UptownGalleries,1969
Theater,1969,Performance,,merge
Music,1911,HotStyleJazz,,merge
HotStyleJazz,1987,Music,,merge
TinPanAlley,1907,Music
Weavers,1961,TinPanAlley,,merge
FolkRevival,1961,FolkRevival2,1962,merge
TinPanAlley,1973,ClassicRock,,merge
ClassicRock,1975,HipHop,,merge
HotStyleJazz,1973,MainstreamJazz,,merge
Regionalists,1930,VisualArt,1931`,
  tags: `Literature,1899,(The Jewish)/Forward,upper
Literature,1907,Mother/Earth,upper,30
Literature,1913,The/Glebe,upper
Literature,1915,Other,upper
Literature,1949,San Remo,lower
Theater,1924,Cherry/Lane/Theater,inner
Literature,1912,The/Masses,inner
Radical,1914,Paterson/Mill Strike/Pageant
Radical,1914,The Masses/Croud,inner
VisualArt,1925,Hello my friend/I am a test label,on
VisualArt,1960,hello;/ my test;/and other/testfdsf/fsf things,on,20`
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

function setupEditors() {
  for (let name of ['streams', 'links', 'tags']) {
    editors[name] = document.querySelector('#editor-' + name);
    let storedData = retreiveData(name);
    editors[name].oninput = () => onDataChanged(name);
    addToEditor(
      name,
      storedData && storedData != '' ? storedData : example[name]
    );
  }
}

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
  let oLine = tooltips.append('g').attr('id', 'orientationLine');
  oLine
    .append('line')
    .attr('y1', orcha._stream._streamData.yScale(0))
    .attr('y2', orcha._stream._streamData.yScale(1));
  oLine.append('text').attr('y', orcha._stream._streamData.yScale(0));

  // add second line for drag operations
  let oLine2 = tooltips.append('g').attr('id', 'orientationLine2');
  oLine2
    .append('line')
    .attr('y1', orcha._stream._streamData.yScale(0))
    .attr('y2', orcha._stream._streamData.yScale(1));
  oLine2.append('text').attr('y', orcha._stream._streamData.yScale(0));

  orcha._stream._zoomContainer.on('mousemove', function() {
    updateLine('orientationLine', d3.mouse(this));
  });

  let streams = streamCon
    .selectAll('path.stream')
    .filter(d => d.id != 'fakeRoot');

  // click on streams to create tags
  streams.on('click', function(d) {
    let coords = d3.mouse(this);
    currentTag.time = getYear(coords[0]);
    currentTag.stream = d.id;
    showPopupTag();
  });

  // add size slider
  let sizeSlider = tooltips
    .append('g')
    .attr('id', 'sizeSlider')
    .call(
      d3
        .drag()
        .on('start', onSizeSliderDragStarted)
        .on('drag', onSizeSliderDragged)
        .on('end', onSizeSliderDragEnded)
    );
  sizeSlider
    .append('rect')
    .attr('fill', '#222')
    .attr('width', sizeSliderWidth)
    .attr('height', sizeSliderHeight)
    .attr('rx', 5)
    .attr('ry', 5);

  sizeSlider
    .append('text')
    .attr('x', sizeSliderWidth / 2)
    .attr('y', 2);

  streams.on('mouseenter', function(d) {
    if (sizeSliderDrag.active) return;
    showSizeSlider();
  });

  // streams.on('mouseout', function(d) {
  //   if (sizeSliderDrag.active) return;
  //   hideSizeSlider();
  // });

  streams.on('mousemove', function(d) {
    if (sizeSliderDrag.active) return;
    let coords = d3.mouse(this);
    moveSizeSlider(coords[0], d.id);
  });

  // drag anywhere to create streams and links
  orcha._stream._zoomContainer.call(
    d3
      .drag()
      .on('start', onStreamDragStarted)
      .on('drag', onStreamDragged)
      .on('end', onStreamDragEnded)
  );
}

function showSizeSlider() {
  let sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  sizeSlider.attr('visibility', 'visible');
}

function hideSizeSlider() {
  let sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  sizeSlider.attr('visibility', 'hidden');
}

function moveSizeSlider(x, streamId) {
  let sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  let year = getYear(x);
  let stream = orcha._stream.data().timesteps[year].references[streamId];
  x -= sizeSliderWidth / 2;
  let y = orcha._stream._streamData.yScale(stream.y0) - sizeSliderHeight;
  sizeSlider.attr('transform', 'translate(' + x + ',' + y + ')');

  sizeSliderDrag.year = year;
  sizeSliderDrag.stream = streamId;
  sizeSliderDrag.x = x;
  sizeSliderDrag.y = y;
  sizeSliderDrag.size = stream.size;
  sizeSliderDrag.yStart = stream.y1;
  setSizeSliderValue(sizeSliderDrag.size);
}

function setSizeSliderValue(value) {
  let sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  sizeSlider.select('text').html('&#x2191;' + Math.round(value));
}

function updateLine(id, coords) {
  let line = d3.select('#' + id);
  let diffX = coords[0] > lastCursorCoords[0] ? -2 : 2;
  line.attr('transform', d => 'translate(' + (coords[0] + diffX) + ',0)');
  line.select('text').text(getYear(coords[0]));
  lastCursorCoords = coords;
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

function onSizeSliderDragStarted() {
  sizeSliderDrag.active = true;
  let coords = d3.mouse(this);
}
function onSizeSliderDragged() {
  let yScale = orcha._stream._streamData.yScale.invert;
  sizeSliderDrag.size =
    Math.abs(yScale(d3.event.y) - sizeSliderDrag.yStart) *
    orcha._stream._maxValue;
  setSizeSliderValue(sizeSliderDrag.size);
  let sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  let y = d3.event.y - sizeSliderHeight;
  sizeSlider.attr('transform', 'translate(' + sizeSliderDrag.x + ',' + y + ')');
}
function onSizeSliderDragEnded() {
  sizeSliderDrag.active = false;
  hideSizeSlider();
  handleSizeSliderDrag();
}

function handleSizeSliderDrag() {
  // check if the target is a stream
  let target = sizeSliderDrag.stream;
  let streams = data['streams'];
  let stream = streams.find(d => d.name == target);
  if (stream) {
    if (!stream.values) stream.values = {};
    stream.values[sizeSliderDrag.year] = Math.round(sizeSliderDrag.size);
    let valueString = unparseSizeValues(stream.values);

    writeDataToEditor(valueString, 'streams', target, 4);
  }
  // handle tag
  else if (target.includes('tag'));
}

function onStreamDragStarted() {
  if (sizeSliderDrag.active) return;
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
  addToEditor('tags', `\n${tag.stream},${tag.time},${tag.text}`);
}

function addStream(stream) {
  // insert new stream
  if (!stream.parent)
    addToEditor(
      'streams',
      `\n${stream.name},${stream.startTime},${stream.endTime},orange`
    );
  // insert nested stream
  else
    addToEditor(
      'streams',
      `\n${stream.name},${stream.startTime},${stream.endTime},orange,,${stream.parent}`
    );
}
function addLink(link, merge = false) {
  if (!link.endTime)
    addToEditor(
      'links',
      `\n${link.startName},${link.startTime},${link.endName},,`
    );
  else
    addToEditor(
      'links',
      `\n${link.startName},${link.startTime},${link.endName},${link.endTime}`
    );
  if (merge) addToEditor('links', 'merge');
}

function addToEditor(type, text) {
  let e = editors[type];
  e.value += text;
  e.scrollTop = e.scrollHeight;
  onDataChanged(type);
}

function onDataChanged(type) {
  let content = editors[type].value;
  let input = editorHeader[type] + '\n' + content;
  let parsed = parseCSV(input);
  for (let line of parsed) line.values = parseSizeValues(line.values);
  if (parsed) {
    data[type] = parsed;
    storeData(type, content);
    orcha.data(data);
    activateInteractions();
    // cyto.data(orcha.graphData());
    // console.log(graphToDot(graphData));
  }
}

function writeDataToEditor(text, type, row, col) {
  // if row is not a number, it is a streamId
  if (!isNumeric(row)) row = data[type].findIndex(d => d.name == row);

  let csv = editors[type].value;
  let lines = csv.split('\n');
  let content = lines[row].split(',');
  content[col] = text;
  lines[row] = content.join();
  csv = lines.join('\n');

  editors[type].value = csv;
  storeData(type, csv);
  orcha.data(data);
  activateInteractions();
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

// expects a string in the form YEAR/VALUE-YEAR/VALUE...
// outputs an object with years as keys and values as values
function parseSizeValues(data) {
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

// expects an object with years as keys and values as values
// outputs a string in the form YEAR/VALUE-YEAR/VALUE...
function unparseSizeValues(data) {
  let string = '';
  for (let year in data) {
    string += year + '/' + data[year] + '-';
  }
  // remove last '-'
  return string.slice(0, -1);
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
