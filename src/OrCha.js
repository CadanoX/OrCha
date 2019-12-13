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
import MyGraph from './Graph';
import { interpolateOranges } from 'd3-scale-chromatic';

export default class OrCha {
  constructor(streamContainer, graphContainer, readyFunction) {
    this._callback = readyFunction;
    this._stream = new SplitStream(streamContainer, {
      mirror: true,
      showLabels: true,
      offset: 'zero',
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

    // stores nodes with times when they merge into other streams
    this._mergePositions = [];

    if (graphContainer) this._graph = new MyGraph(graphContainer);

    this._streamSize = 1;
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
    // convert CSV to SplitStream data format
    this._inputToStream(d);
    // apply the positioning from the previous force layout
    this._applyNodePositionsToStream();
    // increase the free space between nodes
    this._multiplyRootSize(2);
    // draw the stream with its new data
    this._stream.data(this._streamData);
    // start a new force calculation
    this._graphData = this._streamDataToGraph(this._streamData);
    this._graphLayout.data(this._graphData);
    // move nodes to the middle of the div
    this._graphLayout.forceYValue = this._stream._maxValue / 2;
    this._graphLayout.range = [undefined, this._stream._maxValue];
    this._graphLayout.run();

    this._makeFancyTimeline();
  }

  _makeFancyTimeline() {
    let axes = this._stream._axesContainer;
    let ticks = axes.selectAll('.tick line');
    let tick1 = ticks._groups[0][0];
    let tick2 = ticks._groups[0][1];
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

  _inputToStream(d) {
    this._streamData = new SplitStreamInputData({
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
        if (parent) stream.color = this.__getDarkerColor(parent.color);
      }
      streamColors[stream.name] = stream.color;
    });

    // randomly position tags above or below their corresponding stream
    let i = 0;
    for (let tag of d.tags) {
      tag.name = 'tag' + i++;
      if (tag.type == 'on') tag.color = 'transparent';
      else tag.color = this.__getDarkerColor(streamColors[tag.stream]);
      if (!tag.shape) tag.shape = tag.type == 'on' ? 'rect' : 'rect';
      if (tag.type == 'inner' || tag.type == 'on') innerTags.push(tag);
      else {
        if (!streamTags[tag.stream])
          streamTags[tag.stream] = { lower: [], upper: [] };
        let side;
        if (tag.type == 'upper' || tag.type == 'lower') side = tag.type;
        else side = Math.random() < 0.5 ? 'lower' : 'upper';
        // let side = 'lower';
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

    for (let link of d.links) this._addLinks(link);

    this._streamData.connectEqualIds();
    this._streamData.finalize();

    // set fakeRoot to window height
  }

  // create a graph node for all nodes in all timesteps
  // create links based on their previous node references
  _streamDataToGraph(data) {
    this._mergePositions = [];
    let nodes = [];
    let links = [];
    for (let i in data._timesteps) {
      let t = data._timesteps[i];
      for (let id in t.references) {
        let node = t.references[id];
        if (node.id == 'fakeRoot') continue;
        let parent =
          node.parent && node.parent.id != 'fakeRoot'
            ? node.parent.id + i
            : undefined;

        nodes.push({
          id: node.id + i,
          name: node.id,
          time: i,
          pos: node.pos,
          parent,
          depth: node.depth,
          height: node.size,
          // height: 50,
          width: (node.id + i).split('').length * 10,
          color: node.data ? node.data.color : 'orange',
          x: (i - 1890) * 20,
          y: node.pos
        });

        if (node.prev) {
          for (let prev of node.prev) {
            //find locations at which streams merge
            if (prev.id != node.id && node.id)
              this._mergePositions.push({
                node: node,
                time: i,
                prev: prev
              });

            let type;
            // long ditance link
            if (node.data && node.data.edgeType == 'link') type = 'link';
            // labels
            else if (node.data && node.data.edgeType == 'label') type = 'label';
            // tags
            else if (!prev.id.startsWith('tag') && node.id.startsWith('tag'))
              type = 'tag';
            // same stream
            else if (prev.id == node.id) type = 'stream';
            else type = 'link';
            links.push({
              id: prev.id + (i - 1) + node.id + i,
              source: prev.id + (i - 1),
              target: node.id + i,
              type
            });
          }
        }
      }
    }
    // randomize(nodes);
    return { nodes, links };
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

    let last = link.from;
    // add inbetween nodes
    if (link.end - link.start > 1) {
      for (let t = +link.start + 1; t < link.end; t++) {
        this._streamData.addNode(t, link.name, undefined, undefined, {
          edgeType: 'link'
        });
      }
      this._streamData.addNext(link.start, link.from, link.name);
      last = link.name;
    }
    // add ending
    if (link.type == 'merge') {
      // stream moves fluently into the other stream
      this._streamData.addNext(link.end - 1, last, link.to);
    } else {
      // stream attaches to the other stream
      let linkEnd = link.name + 'port';
      this._streamData.addNode(link.end, linkEnd, undefined, undefined, {
        edgeType: 'link'
      });
      this._streamData.addParent(link.end, linkEnd, link.to);
      this._streamData.addNext(link.end - 1, last, linkEnd);
    }
  }

  _addTagNode(tag) {
    if (!tag.text) return;
    if (!tag.size) tag.size = 13; // font Size
    let magicFontSizeAdjustment = 0.25;
    let magicFontWidthAdjustment = 25;
    tag.text = tag.text.toUpperCase();
    let labels = tag.text.split('/');
    let longestLabelChars = Math.max(...labels.map(d => d.length));
    let tagLength = Math.ceil(
      (longestLabelChars * tag.size) / magicFontWidthAdjustment
    );
    // always use an even number of nodes for tags
    if (tagLength % 2 != 0) tagLength++;
    let tagHeight = tag.size * labels.length * magicFontSizeAdjustment;

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
      if (tag.type == 'inner' || tag.type == 'on')
        this._streamData.addParent(t, tag.name, tag.stream);
      // create an inner rectangular shape which is not influenced by links
      this._streamData.addNode(t, labelName, rectSize[i], undefined, {
        labels,
        color: 'transparent',
        fontSize: tag.size,
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

  _onForceUpdate() {
    // draw graph with new positions
    if (this._graph) this._graph.data(this._graphData);
    // draw stream with new positions
    this._applyNodePositionsToStream();
    // this._hideMergePositions();
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

  _hideMergePositions() {
    const x = this._stream._streamData.xScale;
    const dx = x(1) - x(0);
    const y = this._stream._streamData.yScale;
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
    for (let t in times) times[t].tree.dataSize *= value;
  }

  _onForceEnd() {
    this._makeFancyTimeline();
    this._callback();
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
