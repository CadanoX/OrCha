import * as d3 from 'd3';

export default class MyForce {
  constructor(opts = {}) {
    this._opts = {
      callbackTick: () => {},
      callbackEnd: () => {},
      range: [undefined, undefined],

      ...opts // overwrite default settings with user settings
    };

    this._sim = d3.forceSimulation();
    // this._sim.stop();
    // this._sim.alpha(0);
    this._sim.velocityDecay(0.1); // default 0.4
    this._sim.alphaDecay(1); // default 0.028
    this._sim.on('tick', () => this._tick());
    if (this._opts.callbackEnd) this._sim.on('end', this._opts.callbackEnd);
  }

  data(d) {
    return d == null ? this._data : (this._setData(d), this);
  }

  set velocityDecay(value) {
    this._sim.velocityDecay(value);
  }
  set alphaDecay(value) {
    this._sim.alphaDecay(value);
  }
  set forceYValue(value) {
    this._sim.force('forceY').y(value);
  }
  set forceY(value) {
    this._sim.force('forceY').strength(value);
  }
  set forceLink(value) {
    this._sim.force('forceLink').strength(value);
  }
  set linkIterations(value) {
    this._sim.force('forceLink').iterations(value);
  }
  set linkDistance(value) {
    this._sim.force('forceLink').distance(value);
  }
  set forceBody(value) {
    this._sim.force('forceBody').strength(value);
  }
  set forceCollision(value) {
    this._sim.force('forceCollision').strength(value);
  }
  set forceCrossing(value) {
    this._sim.force('forceCrossing').strength(value);
  }
  set forceCrossingMinDistance(value) {
    this._sim.force('forceCrossing').distanceMin(value);
  }
  set forceCrossingMaxDistance(value) {
    this._sim.force('forceCrossing').distanceMax(value);
  }

  _setData(data) {
    // preprocess
    data.nodes.forEach(d => {
      // fix nodes in x direction
      d.fx = +d.time;
      // d.fy = d.pos;
    });
    //set
    this._data = data;
    this._sim.nodes(this._data.nodes);
    this._sim.force(
      'forceY',
      d3.forceY(this._opts.range[1] / 2).strength(0.02)
    );
    this._sim.force(
      'forceLink',
      d3
        .forceLink(data.links)
        .id(d => d.id)
        .strength(d => {
          let sourceTag = d.source.id.split('1')[0];
          if (d.target.id.startsWith(sourceTag)) return 1;
          else return 1;
        })
        .distance(0)
        .iterations(20)
    );
    this._sim.force('forceBody', d3.forceManyBody().strength(-0.1));
    this._sim.force('forceCrossing', d3.forceManyBody().strength(0));
    this._sim.force(
      'forceCollision',
      d3
        .forceCollide()
        .radius(d => d.height)
        .strength(0) // default 0.7
    );
  }

  _tick() {
    let { range } = this._opts;

    this._data.nodes.forEach(function(d) {
      // keep nodes in window bounds
      if (range[0]) d.x = Math.max(0, Math.min(range[0] - d.width, d.x));
      if (range[1]) d.y = Math.max(0, Math.min(range[1] - d.height, d.y));

      // force nodes back into their parent elements
      // TODO: this is super inefficient. store data in an object with IDs instead
      // remember to move all parents into window before moving children into parents
      if (d.parent) {
        let parent = this._data.nodes.find(p => p.id == d.parent);
        d.y = Math.max(
          parent.y,
          Math.min(parent.y + parent.height - d.height, d.y)
        );
      }
    }, this);

    this._opts.callbackTick();
  }

  run(ticks = 0) {
    if (ticks > 0) this._sim.tick(ticks);
    else this._sim.alpha(1).restart();
  }
}
