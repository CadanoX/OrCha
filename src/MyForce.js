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
    this._sim.velocityDecay(0.05); // default 0.4
    this._sim.alphaDecay(0.01); // default 0.028
    this._sim.on('tick', () => this._tick());
    if (this._callbackEnd) this._sim.on('end', this._callbackEnd);
  }

  data(d) {
    return d == null ? this._data : (this._setData(d), this);
  }

  _setData(data) {
    // preprocess
    data.nodes.forEach(d => {
      // fix nodes in x direction
      d.fx = +d.time * 100;
      // d.fy = d.pos;
    });
    //set
    this._data = data;
    this._sim.nodes(this._data.nodes);
    this._sim.force(
      'forceY',
      d3.forceY(this._opts.range[1] / 2).strength(0.01)
    );
    this._sim.force(
      'link',
      d3
        .forceLink(data.links)
        .id(d => d.id)
        .strength(d => {
          let sourceTag = d.source.id.split('1')[0];
          if (d.target.id.startsWith(sourceTag)) return 1;
          else return 1;
          return 0;
        })
    );
    this._sim.force('charge', d3.forceManyBody().strength(-5));
    this._sim.force(
      'collide',
      d3
        .forceCollide()
        .radius(d => d.height)
        .strength(0.2) // default 0.7
      // .iterations(100)
    );
  }

  _tick() {
    let { range } = this._opts;
    // force nodes back into their parent elements
    // for (let i = 0; i < this._data.nodes.length; i++) {
    //   let node = this._data.nodes[i];
    // }

    this._data.nodes.forEach(d => {
      // keep nodes in window bounds
      if (range[0]) d.x = Math.max(0, Math.min(range[0] - d.width, d.x));
      if (range[1]) d.y = Math.max(0, Math.min(range[1] - d.height, d.y));
    });

    this._opts.callbackTick();
  }

  run(ticks = 0) {
    // if (ticks > 0) this._sim.tick(ticks);
    // else this._sim.restart();
  }
}
