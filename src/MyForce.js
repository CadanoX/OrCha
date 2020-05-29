/**
 * Compute a graph layout for the given data based on defined forces.
 */

import * as d3 from 'd3';

const XSCALE = 1000; // must be the same as XSCALE in MyGraph.js

export default class MyForce {
  constructor(opts = {}) {
    this._opts = {
      callbackTick: () => {},
      callbackEnd: () => {},
      range: [undefined, undefined],
      alphaDecay: 0,
      velocityDecay: 0,
      forceY: 0.001,
      forceYValue: 0,
      forceBody: -0.3,
      forceCollision: 0.003,
      forceStream: 1,
      forceStreamIterations: 20,
      forceStreamDistance: 0,
      forceLink: 0.5,
      forceLinkIterations: 1,
      forceLinkDistance: 0,
      forceTag: 0.2,
      forceTagIterations: 1,
      forceTagDistance: 0,
      ...opts // overwrite default settings with user settings
    };

    this._sim = d3.forceSimulation();
    this._initForces();
    // this._sim.stop();
    // this._sim.alpha(0);
    this._sim.on('tick', () => this._tick());
    if (this._opts.callbackEnd) this._sim.on('end', this._opts.callbackEnd);
  }

  data(d) {
    return d == null ? this._data : (this._setData(d), this);
  }

  set range(range) {
    this._opts.range = range;
    this._sim.force('forceBody').distanceMax(range[1]);
  }
  set alphaDecay(value) {
    this._opts.alphaDecay = value;
    this._sim.alphaDecay(value);
  }
  set velocityDecay(value) {
    this._opts.velocityDecay = value;
    this._sim.velocityDecay(value);
  }
  set forceY(value) {
    this._opts.forceYValue = value;
    this._sim.force('forceY').strength(value);
  }
  set forceYValue(value) {
    this._opts.forceYValue = value;
    this._sim.force('forceY').y(value);
  }
  set forceBody(value) {
    this._opts.forceBody = value;
    this._sim.force('forceBody').strength(d => d.height * this._opts.forceBody);
  }
  set forceCollision(value) {
    this._opts.forceCollision = value;
    this._sim.force('forceCollision').strength(value);
  }
  set streamForce(value) {
    this._opts.forceStream = value;
    this._sim.force('forceStream').strength(value);
  }
  set streamIterations(value) {
    this._opts.forceStreamIterations = value;
    this._sim.force('forceStream').iterations(value);
  }
  set streamDistance(value) {
    this._opts.forceStreamDistance = value * XSCALE;
    this._sim.force('forceStream').distance(this._opts.forceStreamDistance);
  }
  set linkForce(value) {
    this._opts.forceLink = value;
    this._sim.force('forceLink').strength(value);
  }
  set linkIterations(value) {
    this._opts.forceLinkIterations = value;
    this._sim.force('forceLink').iterations(value);
  }
  set linkDistance(value) {
    this._opts.forceLinkDistance = value * XSCALE;
    this._sim.force('forceLink').distance(this._opts.forceLinkDistance);
  }
  set tagForce(value) {
    this._opts.forceTag = value;
    this._sim.force('forceTag').strength(value);
  }
  set tagIterations(value) {
    this._opts.forceTagIterations = value;
    this._sim.force('forceTag').iterations(value);
  }
  set tagDistance(value) {
    this._opts.forceTagDistance = value * XSCALE;
    this._sim.force('forceTag').distance(this._opts.forceTagDistance);
  }

  _initForces() {
    let {
      range,
      alphaDecay,
      velocityDecay,
      forceY,
      forceYValue,
      forceBody,
      forceCollision,
      forceStream,
      forceStreamIterations,
      forceStreamDistance,
      forceTag,
      forceTagIterations,
      forceTagDistance,
      forceLink,
      forceLinkIterations,
      forceLinkDistance
    } = this._opts;

    this._sim.alphaDecay(alphaDecay);
    this._sim.velocityDecay(velocityDecay);
    this._sim.force('forceY', d3.forceY(forceYValue).strength(forceY));

    this._sim.force(
      'forceBody',
      d3
        .forceManyBody()
        .strength(d => d.height * forceBody)
        .distanceMax(range[1])
    );

    this._sim.force(
      'forceCollision',
      d3
        .forceCollide()
        .radius(d => d.height / 2)
        .strength(forceCollision)
    );

    this._sim.force(
      'forceStream',
      d3
        .forceLink()
        .id(d => d.id)
        .strength(forceStream)
        .iterations(forceStreamIterations)
        .distance(forceStreamDistance * XSCALE)
    );

    this._sim.force(
      'forceLink',
      d3
        .forceLink()
        .id(d => d.id)
        .strength(forceLink)
        .iterations(forceLinkIterations)
        .distance(forceLinkDistance * XSCALE)
    );

    this._sim.force(
      'forceTag',
      d3
        .forceLink()
        .id(d => d.id)
        .strength(forceTag)
        .iterations(forceTagIterations)
        .distance(forceTagDistance * XSCALE)
    );

    // this._sim.force(
    //   "forcePort",
    //   d3
    //     .forceLink(
    //       data.links.filter(
    //         (d) => !d.id.includes("tag") && d.id.includes("port")
    //       )
    //     )
    //     .id((d) => d.id)
    //     .strength(1)
    //     .iterations(20)
    //     .distance(0)
    // );
  }

  _setData(data) {
    // Fix node positions in x direction
    data.nodes.forEach(d => {
      d.fx = +d.time * XSCALE;
    });

    this._data = data;

    //set
    this._sim.nodes(this._data.nodes);

    // apply n-body force to stream nodes only
    this._isolate(this._sim.force('forceBody'), node => node.type != 'link');

    this._sim.force('forceStream').links(this._data.streamLinks);
    this._sim.force('forceLink').links(this._data.linkLinks);
    this._sim.force('forceTag').links(this._data.tagLinks);
  }

  _tick() {
    let { range } = this._opts;
    let extraSpace = 0.2;
    this._data.nodes.forEach(function(d) {
      // keep nodes in window bounds
      if (range[0]) {
        const lowerEnd = d.width / 2;
        const upperEnd = range[0] - d.width / 2;
        if (d.x < lowerEnd) d.x = lowerEnd;
        else if (d.x > upperEnd) d.x = upperEnd;
      }
      if (range[1]) {
        const lowerEnd = d.height / 2 + extraSpace;
        const upperEnd = range[1] - d.height / 2 - extraSpace;
        if (d.y < lowerEnd) d.y = lowerEnd;
        else if (d.y > upperEnd) d.y = upperEnd;
      }

      // force nodes back into their parent elements
      // TODO: this is super inefficient. store data in an object with IDs instead
      // remember to move all parents into window before moving children into parents
      if (d.parent) {
        let parent = this._data.nodes.find(p => p.id == d.parent);
        d.y = Math.max(
          parent.y - parent.height / 2 + d.height / 2,
          Math.min(parent.y + parent.height / 2 - d.height / 2, d.y)
        );
      }
    }, this);

    this._opts.callbackTick();
  }

  run(ticks = 0) {
    if (ticks > 0) this._sim.tick(ticks);
    else this._sim.alpha(1).restart();
  }

  // apply forces to only a subset of nodes
  // copied form https://bl.ocks.org/mbostock/b1f0ee970299756bc12d60aedf53c13b
  _isolate(force, filter) {
    const initialize = force.initialize;
    force.initialize = () => {
      initialize.call(force, this._data.nodes.filter(filter));
    };
    return force;
  }
}
