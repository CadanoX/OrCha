import * as d3 from 'd3';
import {
  SplitStream,
  SplitStreamFilter,
  SplitStreamInputData,
  TransformData
} from '../libs/SplitStreams.js';

export default class OrCha {
  constructor(container) {
    this._stream = new SplitStream(container, {
      mirror: true,
      yPadding: 1,
      offset: 'zero'
    });
    this._stream.proportion = 1;
  }

  data(d) {
    return d == null ? this._data : (this._setData(d), this);
  }

  _setData(d) {
    let format = new SplitStreamInputData();

    for (let stream of d.streams) {
      if (stream.start > stream.end) continue;
      for (let t = stream.start; t <= stream.end; t++) {
        format.addNode(t, stream.name, null, null, { color: stream.color });
      }
      if (stream.parentStart) {
        format.addNext(stream.start, stream.parentStart, stream.name);
      }
      if (stream.parentEnd) {
        format.addNext(stream.end, stream.name, stream.parentEnd);
      }
    }

    for (let link of d.links) {
      if (!link.end || link.end == '') link.end = link.start;
      if (link.start > link.end) continue;
      link.name = link.from + '-' + link.to;
      if (link.end - link.start == 0)
        format.addNext(link.start, link.from, link.to);
      else {
        for (let t = +link.start + 1; t <= link.end; t++) {
          format.addNode(t, link.name);
        }
        format.addNext(link.start, link.from, link.name);
        format.addNext(link.end, link.name, link.to);
      }
    }

    let i = 0;
    for (let tag of d.tags) {
      tag.name = 'tag' + i;
      format.addNode(tag.time, tag.name, null, null, { label: tag.text });
      if (tag.type == 'inner') format.addParent(tag.time, tag.name, tag.stream);
      else if (tag.type == 'outer')
        format.addNext(tag.time - 1, tag.stream, tag.name);
      i++;
    }

    format.connectEqualIds();
    format.finalize();
    this._stream.data(format);
  }
}
