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
      offset: 'zero',
      transparentRoot: true,
      yPadding: 1,
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
      margin: { top: 40, bottom: 20, left: 20, right: 20 }
    });
    this._stream.proportion = 1;
    this._streamData;
    this._graphData;
    this._graphLayout = new MyForce({
      callbackTick: this._onForceUpdate.bind(this),
      callbackEnd: this._onForceEnd.bind(this),
      range: [undefined, graphContainer.clientHeight]
    });
    this._graph = new MyGraph(graphContainer);

    this._streamSize = 10;
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
    this._inputToStream(d);
    this._stream.data(this._streamData);
    this._graphData = this._streamDataToGraph(this._streamData);
    this._graphLayout.data(this._graphData);
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

    d.streams.forEach(stream => (streamColors[stream.name] = stream.color));

    // randomly position tags above or below their corresponding stream
    let i = 0;
    for (let tag of d.tags) {
      tag.name = 'tag' + i++;
      tag.color = this.__getDarkerColor(streamColors[tag.stream]);
      if (tag.type == 'inner') innerTags.push(tag);
      else {
        if (!streamTags[tag.stream])
          streamTags[tag.stream] = { lower: [], upper: [] };
        let side;
        if (tag.type == 'upper' || tag.type == 'lower') side = tag.type;
        else side = Math.random() < 0.5 ? 'lower' : 'upper';

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
  }

  _streamDataToGraph(data) {
    let y = this._stream._streamData._yScale;
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
        // dagre does not support clusters, so we need to
        // let movePortsInRank (node.id.endsWith('port'))

        // const r = {
        //   id: node.id + i,
        //   name: node.id,
        //   time: i,
        //   pos: node.pos,
        //   parent,
        //   depth: node.depth,
        //   height: node.size,
        //   // height: 50,
        //   width: (node.id + i).split('').length * 10,
        //   color: node.data ? node.data.color : 'orange',
        //   x: (i - 1890) * 20,
        //   y: node.pos
        // };

        // Object.defineProperty(r, 'height', {
        //   get: d => {
        //     return node.height;
        //   },
        //   set: d => {
        //     node.height = d;
        //   }
        // });

        // nodes.push(r);
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

        // this is the alternative to using hierarchies
        // if (parent && parent != 'fakeRoot' + i)
        //   links.push({
        //     data: {
        //       id: parent + node.id + i,
        //       source: parent,
        //       target: node.id + i
        //     }
        //   });
        if (node.prev) {
          for (let prev of node.prev) {
            links.push({
              id: prev.id + (i - 1) + node.id + i,
              source: prev.id + (i - 1),
              target: node.id + i
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
      this._streamData.addNode(t, stream.name, this._getSize(stream, t), null, {
        color: stream.color
      });
    }
    if (stream.parentStart) {
      this._streamData.addNext(stream.start, stream.parentStart, stream.name);
    }
    if (stream.parentEnd) {
      this._streamData.addNext(stream.end, stream.name, stream.parentEnd);
    }
  }

  _addLinks(link) {
    if (!isNumeric(link.start)) return;
    if (!isNumeric(link.end)) link.end = link.start;
    if (link.start > link.end) return;
    link.name = link.from + link.to;
    // stream moves fluently into the other stream
    if (link.type == 'merge') {
      this._streamData.addNext(link.end, link.from, link.to);
    } else {
      // stream attaches to the other stream
      let linkEnd = link.name + 'port';
      this._streamData.addNode(+link.end + 1, linkEnd);
      this._streamData.addParent(+link.end + 1, linkEnd, link.to);
      this._streamData.addNext(link.end, link.from, linkEnd);
    }
    // if (link.end - link.start == 0) {
    // } else {
    //   for (let t = +link.start + 1; t <= link.end; t++) {
    //     this._format.addNode(t, link.name);
    //   }
    //   this._format.addNext(link.start, link.from, link.name);
    //   this._format.addNext(link.end, link.name, linkEnd);
    // }
  }

  _addTagNode(tag) {
    let tagLengthHalf = 2;
    for (let t = tag.time - tagLengthHalf; t < +tag.time + tagLengthHalf; t++) {
      this._streamData.addNode(t, tag.name, 1, null, {
        label: tag.text,
        color: tag.color
      });
      if (tag.type == 'inner')
        this._streamData.addParent(t, tag.name, tag.stream);
    }
  }

  _addTagLink(tag) {
    this._streamData.addNext(tag.time - 1, tag.stream, tag.name);
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
    this._graph.data(this._graphData);
    for (let node of this._graphData.nodes) {
      this._streamData._timesteps[node.time].references[node.name].dataPos =
        node.y;
      if (this._streamData._timesteps[node.time].tree.dataSize < node.y)
        this._streamData._timesteps[node.time].tree.dataSize = node.y;
    }
    this._streamData.finalize();
    this._stream.data(this._streamData);
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
