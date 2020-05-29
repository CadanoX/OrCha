import '../css/style.css';
import * as d3 from 'd3';
import Papa from 'papaparse';
// import myCyto from './MyCyto';
import OrCha from './OrCha';
import { isNumeric, randomize, d3ToCyto, saveSvg } from './functions.js';

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

// Specify the CSV data format for displayed text editors
const editorHeader = {
  streams: 'name,start,end,color,values,parent',
  links: 'from,start,to,end,merge',
  tags: 'stream,time,text,type,size,shape'
};
// Initialize editor content with an example
const example = {
  streams: `Literature,1896,2000,#bed2dd,1896/17-1900/17-1901/16-1903/13-1904/11-1910/11-1912/12-1916/11-1917/10-2000/10
TinPanAlley,1907,2000,purple,1907/2-1950/2-1961/7-1965/15-1973/8
UptownGalleries,1954,1972,#6cabd6,1954/4-1971/4-1972/2`,
  links: `Literature,1912,TinPanAlley,1916
UptownGalleries,1972,TinPanAlley,1980`,
  tags: `TinPanAlley,1965,label on stream,on,1.5
Literature,1945,outside label,,2
Literature,1981,inside label,in`
};

document.addEventListener('DOMContentLoaded', async function(event) {
  orcha = new OrCha(
    document.querySelector('#chart'),
    document.querySelector('#d3graph'),
    onGraphReady
  );

  // Download result image
  document.querySelector('#saveSvg').onclick = onSaveButtonClicked;
  // cyto = new myCyto(document.querySelector('#graph'), onGraphUpdated);
  setupEditors();
  setupPopups();
  setupOptions();
});

/* Editors enable text input to adjust the rendered data.
 * On every character change, the editors' content is parsed and rendered.
 * We display editors for streams, links, and tags, each following their own format.
 */
function setupEditors() {
  // Initialize all editors
  for (let name of ['streams', 'links', 'tags']) {
    editors[name] = document.querySelector('#editor-' + name);
    editors[name].oninput = () => onDataChanged(name);

    // Load data from the local storage to the editor
    const storedData = retreiveData(name);
    // If local storage is empty, load an example instead
    const data = storedData && storedData != '' ? storedData : example[name];
    addToEditor(name, data);
  }
}

/* In contrast to using the text editor, the user can interaction with the visualization
 * to create streams and tags. We display a popup to enter text rendered for tags and stream names.
 */
function setupPopups() {
  popupTag = document.querySelector('#popupTag');
  // Submit when Enter key is pressed
  popupTag.querySelector('input').addEventListener('keyup', e => {
    if (e.keyCode === 13)
      popupTag.querySelector('button[type="submit"]').click();
  });
  popupStream = document.querySelector('#popupStream');
  // Submit when Enter key is pressed
  popupStream.querySelector('input').addEventListener('keyup', e => {
    if (e.keyCode === 13)
      popupStream.querySelector('button[type="submit"]').click();
  });
}

// React on changes of parameter settings for the force layout
function setupOptions() {
  const options = document.querySelectorAll('#options > div');
  for (let option of options) {
    const slider = option.querySelector('input');
    if (slider) {
      // Initiate the force layout with the selected parameters
      forceParameterChanged(option);
      // Display new value
      slider.onchange = () => {
        const text = option.querySelector('.value');
        text.innerText = slider.value;
      };
      // Recalculate force layout
      slider.oninput = () => forceParameterChanged(option);
    }
  }
}

// Rerun the force layout when parameters are changed
function forceParameterChanged(option) {
  const valueText = option.querySelector('.value');
  const value = option.querySelector('input').value;
  valueText.innerText = value;
  orcha.updateForce(option.dataset.name, value);
}

function onGraphReady(data) {}

// Project position in rendered view to the underlying data
function getYear(x) {
  return Math.round(orcha._stream._streamData.xScale.invert(x));
}

/* The user can create data by interacting with the visualization.
 * A mouseover adds an orientation line and displays the year of the mouse position.
 * When clicking on a stream, a tag is created
 * A slider is shown on the current stream to change its size via drag & drop
 * Drag & drop from nowhere to nowhere to create a stream
 * Drag & drop from a stream to a stream to create a link
 * Drag & drop from a stream to nowhere to create a stream and connect via a link
 * The interactions need to be added every single time the visualization updates,
 * because new streams or labels might have been added.
 */
function activateInteractions() {
  const tooltips = orcha._stream._tooltipContainer;
  const streams = orcha._stream._pathContainer
    .selectAll('path.stream')
    .filter(d => d.id != 'fakeRoot');

  // Clear visual clues to overwrite them
  tooltips.selectAll('*').remove();

  // Orientation lines show the current year for the cursor position
  addOrientationLines();

  // Click on stream to create tags
  streams.on('click', function(d) {
    const coords = d3.mouse(this);
    currentTag.time = getYear(coords[0]);
    currentTag.stream = d.id;
    showPopupTag();
  });

  // On mouseover show a box to drag & drop the stream size at that position
  addSizeSlider();
  streams.on('mouseenter', function(d) {
    if (sizeSliderDrag.active) return;
    showSizeSlider();
  });
  // streams.on('mouseout', function(d) {
  //   if (sizeSliderDrag.active) return;
  //   hideSizeSlider();
  // });

  // Change position of slider on mousemove
  streams.on('mousemove', function(d) {
    if (sizeSliderDrag.active) return;
    let coords = d3.mouse(this);
    moveSizeSlider(coords[0], d.id);
  });

  // Drag anywhere to create streams and links
  orcha._stream._zoomContainer.call(
    d3
      .drag()
      .on('start', onStreamDragStarted)
      .on('drag', onStreamDragged)
      .on('end', onStreamDragEnded)
  );
}

function addOrientationLines() {
  const tooltips = orcha._stream._tooltipContainer;
  const yScaleTop = orcha._stream._streamData.yScale(0);
  const yScaleBottom = orcha._stream._streamData.yScale(1);

  // Add line to show the current time
  // This line will stay in place when starting a drag & drop operation
  const oLine = tooltips.append('g').attr('id', 'orientationLine');
  oLine
    .append('line')
    .attr('y1', yScaleTop)
    .attr('y2', yScaleBottom);
  oLine.append('text').attr('y', yScaleTop);

  // Add a line at the current mouse position during a drag & drop operation
  const oLine2 = tooltips.append('g').attr('id', 'orientationLine2');
  oLine2
    .append('line')
    .attr('y1', yScaleTop)
    .attr('y2', yScaleBottom);
  oLine2.append('text').attr('y', yScaleTop);

  // Move line when mouse moves
  orcha._stream._zoomContainer.on('mousemove', function() {
    updateOrientationLine('orientationLine', d3.mouse(this));
  });
}

function addSizeSlider() {
  const tooltips = orcha._stream._tooltipContainer;
  const sizeSlider = tooltips
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
}

function showSizeSlider() {
  const sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  sizeSlider.attr('visibility', 'visible');
}

function hideSizeSlider() {
  const sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  sizeSlider.attr('visibility', 'hidden');
}

function moveSizeSlider(x, streamId) {
  const sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  const year = getYear(x);
  const stream = orcha._stream.data().timesteps[year].references[streamId];
  if (!stream) return;

  // Align the slider center with the current mouse position
  x -= sizeSliderWidth / 2;
  // Display the slider right outside the top border of the stream
  const y = orcha._stream._streamData.yScale(stream.y0) - sizeSliderHeight;
  sizeSlider.attr('transform', 'translate(' + x + ',' + y + ')');

  // Store the attributes for when the slider is dropped
  sizeSliderDrag.year = year;
  sizeSliderDrag.stream = streamId;
  sizeSliderDrag.x = x;
  sizeSliderDrag.y = y;
  sizeSliderDrag.size = stream.size;
  sizeSliderDrag.yStart = stream.y1;
  setSizeSliderValue(sizeSliderDrag.size);
}

// Display the current size of the stream
function setSizeSliderValue(value) {
  let sizeSlider = orcha._stream._tooltipContainer.select('#sizeSlider');
  sizeSlider.select('text').html('&#x2191;' + Math.round(value));
}

function updateOrientationLine(id, coords) {
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

// Define interaction to change stream sizes
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
  else currentDrag.color = stream.getAttribute('fill');

  addInteractionLine(coords);
  updateOrientationLine('orientationLine2', coords);
  d3.select('#orientationLine2').style('visibility', 'visible');
}

function onStreamDragged(d) {
  let coords = d3.mouse(this);
  updateInteractionLine(coords);
  updateOrientationLine('orientationLine2', coords);
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
  if (!stream.color) stream.color = 'orange';
  addToEditor(
    'streams',
    `\n${stream.name},${stream.startTime},${stream.endTime},${stream.color}`
  );
  if (stream.parent) addToEditor(`,${stream.parent}`);
}

function addLink(link, merge = false) {
  addToEditor(
    'links',
    `\n${link.startName},${link.startTime},${link.endName},`
  );

  if (link.endTime) addToEditor('links', link.endTime);
  else addToEditor('links', ',');
  if (merge) addToEditor('links', 'true');
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

function onSaveButtonClicked() {
  saveSvg(document.querySelector('svg.secstream'), 'orcha');
}
