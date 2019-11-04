import '../css/style.css';
import * as d3 from 'd3';
import ace from 'ace-builds';
import 'ace-builds/webpack-resolver';
import {
  SplitStream,
  SplitStreamFilter,
  SplitStreamInputData,
  TransformData
} from '../libs/SplitStreams.js';
import transform from './transformData';

var editor;
var stream;

document.addEventListener('DOMContentLoaded', async function(event) {
  stream = new SplitStream(document.querySelector('#stream'), {
    mirror: true,
    yPadding: 1
  });
  setupEditor();
});

function setupEditor() {
  editor = ace.edit('editor');
  editor.setTheme('ace/theme/monokai');
  editor.session.setMode('ace/mode/javascript');
  editor.on('change', onInputChanged);
  // init
  setStreamData(editor.getValue());
}

function onInputChanged() {
  let data = editor.getValue();
  setStreamData(data);
}

function setStreamData(data) {
  let dataTransformed = transform(data);
  if (dataTransformed) {
    stream.data(dataTransformed);
  }
}
