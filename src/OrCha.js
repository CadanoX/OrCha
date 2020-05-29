/**
 * We utilize the SplitStreams library as a basis to draw nested streams.
 * Therefore, initial data (streams, links, labels) are transformed to the
 * SplitStreams data format.
 * The nodes of all streams are embedded in a force layout to change their position.
 * If a graphContainer is givem, the linked nodes of the layout are drawn in the div.
 */

import * as d3 from 'd3';
import * as Color from 'color';
import { isNumeric } from './functions.js';
import {
  SplitStream,
  SplitStreamFilter,
  SplitStreamInputData,
  TransformData
} from '../libs/SplitStreams.js';
import MyForce from './MyForce';
import MyGraph from './MyGraph';
import { interpolateOranges } from 'd3-scale-chromatic';
import { runInThisContext } from 'vm';

export default class OrCha {
  constructor(streamContainer, graphContainer, readyFunction) {
    this._streamContainer = streamContainer;
    this._callback = readyFunction;
    this._stream;
    this._rootSize = 200;
    this._streamSize = 1;
    this._fontSize = 7;
    this._mergePositions = []; // stores nodes with times when they merge into other streams

    this._initStream();
    if (graphContainer)
      this._graph = new MyGraph(graphContainer, {
        margin: { top: 40, bottom: 20, left: 20, right: 20 }
        // margin: { top: 0, bottom: 0, left: 0, right: 0 }
      });

    this._stream._svg.attr('font-size', this._fontSize + 'px');
  }

  set streamSize(value) {
    this._streamSize = value;
  }

  data(d) {
    return d == null ? this._streamData : (this._setData(d), this);
  }

  get graphData() {
    return this._graphData;
  }

  updateForce(parameter, value) {
    this._graphLayout[parameter] = value;
    this._graphLayout.run();
  }

  _setData(d) {
    this._inputToStreamData(d);

    // Apply node positions from the previous force layout
    this._applyNodePositionsToStream();

    // Increase the free space between nodes
    this._multiplyRootSize(2);
    // this._setRootSize(this._rootSize);

    // this._drawSpaceHeight = document
    //   .querySelector('svg > .zoom')
    //   .getBBox().height;
    this._drawSpaceHeight = document.querySelector(
      'svg.secstream'
    ).clientHeight;
    this._drawSpaceWidth = document.querySelector('svg.secstream').clientWidth;

    // draw the stream with its new data
    this._stream.data(this._streamData);
    // start a new force calculation
    this._graphData = this._streamDataToGraph(this._streamData);
    this._graphLayout.data(this._graphData);
    // move nodes to the middle of the div
    this._graphLayout.forceYValue = this._stream._maxValue / 2;
    this._graphLayout.range = [0, this._stream._maxValue];
    this._graphLayout.run();

    this._makeFancyTimeline();
  }

  _initStream() {
    this._stream = new SplitStream(this._streamContainer, {
      mirror: true, // show first added streams at the top
      showLabels: true,
      offset: 'zero', // show stacked streams before force layout starts for debug reasons
      transparentRoot: true,
      // yPadding: 1,
      axes: [
        {
          position: 'bottom',
          // ticks: 10,
          tickSize: 'full',
          textPos: [0, 0],
          textSize: '2em',
          textAnchor: 'start'
        }
      ],
      margin: { top: 40, bottom: 20, left: 20, right: 20 },
      filterMode: 'accurate'
    });
    this._stream.filters([{ type: 'art' }]);
    this._stream.proportion = 0.99;
    this._streamData;
    this._graphData;
    this._graphLayout = new MyForce({
      callbackTick: this._onForceUpdate.bind(this),
      callbackEnd: this._onForceEnd.bind(this)
    });
  }

  _makeFancyTimeline() {
    let axes = this._stream._axesContainer;
    let ticks = axes.selectAll('.tick line');
    let tick1 = ticks._groups[0][0];
    let tick2 = ticks._groups[0][1];

    // When there are no streams, do not draw a background
    // TODO: instead always draw a minimmum timelines
    if (!tick1) return;

    let height = tick1.getBBox().height;
    let x1 = tick1.parentNode.transform.baseVal[0].matrix.e;
    let x2 = tick2.parentNode.transform.baseVal[0].matrix.e;
    let width = x2 - x1;

    axes
      .selectAll('.tick:not(:last-child)')
      .insert('rect', ':first-child')
      .attr('width', width)
      .attr('height', height)
      .classed('tickCenter', true)
      .classed('odd', function(d, i) {
        return i % 2 ? false : true;
      });
    axes
      .selectAll('.tick:not(:last-child)')
      .insert('rect', ':nth-child(2)')
      .attr('width', width)
      .attr('height', 25)
      .classed('tickTop', true)
      .classed('odd', (d, i) => (i % 2 ? false : true));

    // this._stream._axesContainer
    //   .selectAll('.tick line')
    //   .nodes()
    //   .forEach(d => {
    //     let tick = d3.select(d);
    //     let test;
    //   });
  }

  // Change the input data (streams, links, labels) to the SplitStreams format
  _inputToStreamData(d) {
    this._streamData = new SplitStreamInputData({
      forceFakeRoot: true, // make empty space work for only 1 stream
      order: null
      // order: {
      //   name: 'minimizeEdgeCrossings',
      //   options: { iterations: 100 }
      // }
    });
    let innerTags = [];
    let streamTags = {}; // find correlated streams for outer tags
    let streamColors = {};

    d.streams.forEach(stream => {
      // TODO: inefficient, use object with id as key
      if (stream.parent) {
        let parent = d.streams.find(d => d.name == stream.parent);
        if (parent && !stream.color)
          stream.color = this.__getDarkerColor(parent.color);
      }
      streamColors[stream.name] = stream.color;
      stream.start = +stream.start;
      stream.end = +stream.end;
    });

    // randomly position tags above or below their corresponding stream
    // WARNING: with the current force layout this can not be guaranteed any longer
    let i = 0;
    for (let tag of d.tags) {
      tag.name = 'tag' + i++;
      if (tag.type == 'on') tag.color = 'transparent';
      else tag.color = this.__getDarkerColor(streamColors[tag.stream]);
      if (!tag.shape) tag.shape = tag.type == 'on' ? 'rect' : 'rect';
      if (tag.type == 'in' || tag.type == 'on') innerTags.push(tag);
      else {
        if (!streamTags[tag.stream])
          streamTags[tag.stream] = { lower: [], upper: [] };
        let side;
        if (tag.type == 'upper' || tag.type == 'lower') side = tag.type;
        else side = Math.random() < 0.5 ? 'lower' : 'upper';
        // side = 'upper';
        streamTags[tag.stream][side].push(tag);
      }
    }

    // draw upper tags before the stream and lower tags after
    for (let stream of d.streams) {
      let streamHasTags = !!streamTags[stream.name];
      // add upper outer tags
      if (streamHasTags)
        for (let tag of streamTags[stream.name].upper) this._addTagNode(tag);
      // add streams
      this._addStream(stream);
      // add lower outer tags
      if (streamHasTags)
        for (let tag of streamTags[stream.name].lower) this._addTagNode(tag);
      // add links from stream to outer tags (or the other way around)
      if (streamHasTags) {
        for (let tag of streamTags[stream.name].upper) this._addTagLink(tag);
        for (let tag of streamTags[stream.name].lower) this._addTagLink(tag);
      }
    }

    // draw inner tags after streams to position them as children
    for (let tag of innerTags) this._addTagNode(tag);
    for (let link of d.links) {
      link.start = +link.start;
      link.end = +link.end;
      this._addLinks(link);
    }
    this._streamData.connectEqualIds();
    this._streamData.finalize();

    // set fakeRoot to window height
  }

  // create a graph node for all nodes in all timesteps
  // create links based on their previous node references
  _streamDataToGraph(data) {
    this._mergePositions = [];
    let graph = {
      nodes: [],
      streamNodes: [],
      labelNodes: [],
      linkNodes: [],
      links: [],
      streamLinks: [], // between stream nodes
      labelLinks: [], // from stream to label
      tagLinks: [], // between label nodes
      linkLinks: [] // connecting anything
    };

    let assignNode = (node, i) => {
      // Streams have the same node ID in every timestep
      // For the graph we need enumerate them by adding the iterator to the ID
      let parent =
        node.parent && node.parent.id != 'fakeRoot'
          ? node.parent.id + '-' + i
          : undefined;

      let graphNode = {
        id: node.id + '-' + i, // add iterator to distinguish nodes of a stream
        name: node.id,
        time: i, // normalize time
        parent, // for nested collision detections
        height: node.size, // for collision detections
        color: node.data ? node.data.color : 'orange',
        y: node.pos, // more likely to keep the original order
        type: node.data.edgeType
      };

      graph.nodes.push(graphNode);
      if (node.id.startsWith('tag')) graph.labelNodes.push(graphNode);
      if (node.data.edgeType == 'link') graph.linkNodes.push(graphNode);
      else graph.streamNodes.push(graphNode);
    };

    let assignLink = (node, i) => {
      if (node.prev) {
        // Distinguish between different types of links
        for (let prev of node.prev) {
          //find locations at which streams merge
          if (prev.id != node.id && node.id)
            this._mergePositions.push({
              node,
              time: i,
              prev
            });

          let link = {
            id: prev.id + '-' + (i - 1) + node.id + '-' + i,
            source: prev.id + '-' + (i - 1),
            target: node.id + '-' + i
          };

          graph.links.push(link);
          // long ditance link
          if (node.data && node.data.edgeType == 'link')
            graph.linkLinks.push(link);
          // labels
          else if (node.data && node.data.edgeType == 'label')
            graph.labelLinks.push(link);
          // tags
          else if (!prev.id.startsWith('tag') && node.id.startsWith('tag'))
            graph.tagLinks.push(link);
          // same stream
          else if (prev.id == node.id) graph.streamLinks.push(link);
          else graph.linkLinks.push(link);
        }
      }
    };

    for (let i in data._timesteps) {
      let t = data._timesteps[i];
      for (let id in t.references) {
        let node = t.references[id];
        if (node.id == 'fakeRoot') continue;

        assignNode(node, i);
        assignLink(node, i);
      }
    }

    // randomize(nodes);
    return graph;
  }

  _addStream(stream) {
    if (stream.start > stream.end) return;

    for (let t = stream.start; t <= stream.end; t++) {
      this._streamData.addNode(
        t,
        stream.name,
        this._getSize(stream, t),
        undefined,
        {
          color: stream.color
        }
      );
      if (stream.parent)
        this._streamData.addParent(t, stream.name, stream.parent);
    }
  }

  _addLinks(link) {
    if (!isNumeric(link.start)) return;
    if (!isNumeric(link.end)) link.end = +link.start + 1;
    if (link.start >= link.end) return;
    // TODO: possibly this is not a unique name
    link.name = link.from + link.to;

    let timestep = this._streamData._timesteps[link.start];
    let streamNode = timestep ? timestep.references[link.from] : undefined;

    if (!streamNode) return;

    let color = streamNode ? streamNode.data.color : 'orange';

    let last = link.from;
    // add inbetween nodes
    if (link.end - link.start > 1) {
      for (let t = +link.start + 1; t < link.end; t++) {
        this._streamData.addNode(t, link.name, undefined, undefined, {
          edgeType: 'link',
          color
        });
      }
      this._streamData.addNext(link.start, link.from, link.name);
      last = link.name;
    }
    // add ending
    if (link.merge == 'true') {
      // stream moves fluently into the other stream
      this._streamData.addNext(link.end - 1, last, link.to);
    } else {
      // stream attaches to the other stream
      let linkEnd = last + 'port';

      this._streamData.addNode(link.end, linkEnd, undefined, undefined, {
        edgeType: 'link',
        color
      });
      this._streamData.addParent(link.end, linkEnd, link.to);
      this._streamData.addNext(link.end - 1, last, linkEnd);
    }
  }

  _addTagNode(tag) {
    if (!tag.text) return;
    tag.text = tag.text.toUpperCase();

    // convert em to px
    if (!tag.size) tag.size = 1;
    let fontSize = tag.size * this._fontSize;

    let magicFontHeightAdjustment = this._rootSize / this._drawSpaceHeight;
    let fontHeight = fontSize * magicFontHeightAdjustment;
    let spacePerTimestep =
      this._drawSpaceWidth / Object.keys(this._stream._data.timesteps).length;
    let charWidth = (fontSize * 0.4) / spacePerTimestep;

    // create a new line of text at each / symbol
    let labels = tag.text.split('/');
    let tagHeight = fontHeight * labels.length;

    // calculate the required number of time nodes for the given label
    let maxChars = Math.max(...labels.map(d => d.length));
    let tagLength = Math.ceil(maxChars * charWidth * 1.3);
    // use an even number of nodes to let them be equally long to the left and right of the link connection
    if (tagLength % 2 != 0) tagLength++;

    // adjust the shape of the tag
    // start with rectangular shape
    let rectSize = Array(tagLength + 1).fill(tagHeight);
    let shapeSize = rectSize;
    if (tag.shape == 'diamond')
      shapeSize = rectSize.map(
        (d, i) => 2 * d * (1 - Math.abs(i - tagLength / 2) / (tagLength / 2))
      );
    else if (tag.shape == 'ellipse')
      shapeSize = rectSize.map(
        (d, i) =>
          d *
          Math.max(
            0.5,
            1.5 *
              Math.cos(
                ((Math.PI / 2) * Math.abs(i - tagLength / 2)) / (tagLength / 2)
              )
          )
      );

    // create connected nodes to include the text
    let labelName = 'label' + tag.name;
    for (let i = 0; i <= tagLength; i++) {
      let t = tag.time - tagLength / 2 + i;
      this._streamData.addNode(t, tag.name, shapeSize[i], undefined, {
        color: tag.color
      });
      if (tag.type == 'in' || tag.type == 'on')
        this._streamData.addParent(t, tag.name, tag.stream);

      // create an inner rectangular shape which is not influenced by links
      this._streamData.addNode(t, labelName, rectSize[i], undefined, {
        labels,
        color: 'transparent',
        fontSize,
        edgeType: 'label'
      });
      this._streamData.addParent(t, labelName, tag.name);
    }
  }

  _addTagLink(tag) {
    this._streamData.addNext(tag.time - 1, tag.stream, tag.name);
    // instead of merge, attach to tags
    // let linkEnd = tag.name + 'port';
    // this._streamData.addNode(tag.time, linkEnd, undefined, undefined, {
    //   // edgeType: 'link'
    // });
    // this._streamData.addParent(tag.time, linkEnd, tag.name);
    // this._streamData.addNext(tag.time - 1, tag.stream, linkEnd);
  }

  // expect stream values to be sorted
  _getSize(stream, t) {
    if (!stream.values) return this._streamSize;

    let keys = Object.keys(stream.values);
    if (keys.length == 0) return this._streamSize;

    let i = 0;
    for (let year of keys) {
      if (+t > +year) i++;
      else break;
    }
    let smaller = +(keys[i - 1] || stream.start);
    let bigger = +(keys[i] || stream.end);
    if (bigger == smaller) return stream.values[t] || this._streamSize;

    let prop = (+t - smaller) / (bigger - smaller);
    let smallerValue = +stream.values[smaller] || this._streamSize;
    let biggerValue = +stream.values[bigger] || this._streamSize;
    return smallerValue + prop * (biggerValue - smallerValue);
  }

  _applyNodePositionsToStream() {
    if (!this._graphData) return;

    // reset the root size
    // for (let t in this._streamData._timesteps)
    //   this._streamData._timesteps[t].tree.dataSize = 0;

    // apply postiions for all nodes
    for (let node of this._graphData.nodes) {
      let nodes = this._streamData._timesteps[node.time];
      if (nodes) {
        let streamNode = nodes.references[node.name];
        if (streamNode) {
          // The graph uses center positions, whereas stream positions are defined by their bottom line
          streamNode.dataPos = node.y - node.height / 2;
          // increase the root size to contain all nodes
          // if (nodes.tree.dataSize < node.y + node.height / 2)
          //   nodes.tree.dataSize = node.y + node.height / 2;
        }
      }
    }

    this._streamData.finalize();
    this._stream.data(this._streamData);
  }

  /* Due to the SVG depth layering, merge links need to be displayed above a stream
   * to display proper shadows, but then they have their ending drawn on top of that
   * stream as well.
   * We aim to hide the drawn ending by applying a clip mask to the stream.
   */
  _hideMergePositions() {
    const x = this._stream._streamData.xScale;
    const y = this._stream._streamData.yScale;
    const dx = x(1) - x(0);
    // get current render position of merge nodes
    for (let merge of this._mergePositions) {
      merge.size = y(merge.node.y1) - y(merge.node.y0);
      merge.pos = y(merge.node.y0);
      merge.x = x(merge.node.x - 0.5);
      let stream = this._stream._svg.select(
        '#stream' + merge.prev.id + 'chart'
      );
      stream.attr('mask', 'url(#mask' + merge.prev.id + ')');
    }
    let defs = this._stream._svg.select('defs');
    // clear previous masks (WARNING: clips are also removed)
    // defs.html('');
    let masksByStream = d3
      .nest()
      .key(d => d.prev.id)
      .entries(this._mergePositions);
    let masks = defs
      .selectAll('mask')
      .data(masksByStream, d => 'mask' + d.key)
      .join(
        enter => {
          let masks = enter.append('mask').attr('id', d => 'mask' + d.key);
          masks
            .append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('fill', 'white');
          return masks;
        },
        update => update,
        exit => exit.remove()
      );
    masks
      .selectAll('rect:not(:first-child)')
      .data(d => d.values, d => d.node.id)
      .join(
        enter => {
          enter
            .append('rect')
            .attr('width', 1.5 * dx)
            .attr('x', d => d.x)
            .attr('fill', 'black');
        },
        update => update,
        exit => exit.remove()
      )
      .attr('y', d => d.pos)
      .attr('height', d => d.size);
  }

  _multiplyRootSize(value) {
    let times = this._streamData._timesteps;
    for (const t of Object.keys(times)) times[t].tree.dataSize *= value;
  }

  _setRootSize(value) {
    let times = this._streamData._timesteps;
    for (const t of Object.keys(times)) times[t].tree.dataSize = value;
  }

  _onForceUpdate() {
    // draw graph with new positions
    if (this._graph) this._graph.data(this._graphData);
    // draw stream with new positions
    this._applyNodePositionsToStream();
    // this._hideMergePositions();
  }

  _onForceEnd() {
    // draw stream with new positions
    // this._applyNodePositionsToStream();
    this._makeFancyTimeline();
    // this._callback();
  }

  __getDarkerColor(color) {
    try {
      return Color(color)
        .darken(0.25)
        .hex();
    } catch (e) {
      return 'orange';
    }
  }
}
