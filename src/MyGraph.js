/**
 * Draw a node-link diagram of provided data into the input container.
 */
import * as d3 from 'd3';

const XSCALE = 1000; // must be the same as the fx parameter in MyForce.js
const NODEWIDTH = 0.65 * XSCALE;

export default class MyGraph {
  constructor(container, opts = {}) {
    this._opts = {
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      ...opts // overwrite default settings with user settings
    };
    this._width = container.clientWidth;
    this._height = container.clientHeight;
    this._svg = d3
      .select(container)
      .append('svg')
      .attr('width', this._width)
      .attr('height', this._height)
      .call(
        d3.zoom().on('zoom', () => {
          this._pathContainer.attr('transform', d3.event.transform);
        })
      );

    this._pathContainer = this._svg.append('g').classed('pathContainer', true);
    this._links = this._pathContainer.append('g').attr('class', 'links');
    this._nodes = this._pathContainer.append('g').attr('class', 'nodes');
    this._domainX = [Infinity, 0];
    this._domainY = [0, 0];
  }

  data(d) {
    return d == null ? this._data : (this._setData(d), this);
  }

  options(opts) {
    Object.assign(this._opts, opts);
  }

  // Find min and max values in the data
  _setDomain(data) {
    this._domainX = [Infinity, 0]; // find min and max time for the x axis
    this._domainY = [0, 0]; // always use 0 as yMin

    data.nodes.forEach(d => {
      this._domainX[0] = Math.min(this._domainX[0], d.x - XSCALE / 2);
      this._domainX[1] = Math.max(this._domainX[1], d.x + XSCALE / 2);
      this._domainY[1] = Math.max(this._domainY[1], d.y + d.height / 2);
    });
  }

  _setData(d) {
    let { margin } = this._opts;
    this._setDomain(d);

    let x = d3
      .scaleLinear()
      .domain(this._domainX)
      .range([margin.left, this._width - margin.right]);

    let y = d3
      .scaleLinear()
      .domain(this._domainY)
      .range([margin.bottom, this._height - margin.top]);

    // add stream nodes
    this._nodes
      .selectAll('rect')
      .data(d.streamNodes, d => d.id)
      .join(
        enter =>
          enter
            .append('rect')
            .attr('width', x(NODEWIDTH) - x(0))
            .attr('height', d => y(d.height) - y(0))
            .attr('x', d => x(d.x - NODEWIDTH / 2))
            .attr('y', d => y(d.y - d.height / 2))
            .attr('fill', d => d.color)
            .attr('stroke', 'black'),
        update =>
          update
            .attr('width', x(NODEWIDTH) - x(0))
            .attr('height', d => y(d.height) - y(0))
            .attr('x', d => x(d.x - NODEWIDTH / 2))
            .attr('y', d => y(d.y - d.height / 2))
            .attr('fill', d => d.color),
        exit => exit.remove()
      );

    // add label nodes
    this._nodes
      .selectAll('ellipse')
      .data(d.labelNodes, d => d.id)
      .join(
        enter =>
          enter
            .append('ellipse')
            .attr('rx', d => y(d.height / 2) - y(0))
            .attr('ry', d => y(d.height / 2) - y(0))
            .attr('cx', d => x(d.x))
            .attr('cy', d => y(d.y))
            .attr('fill', d => (d.color == 'transparent' ? '#AAA' : d.color))
            .attr('stroke', 'black'),
        update =>
          update
            .attr('rx', d => y(d.height / 2) - y(0))
            .attr('ry', d => y(d.height / 2) - y(0))
            .attr('cx', d => x(d.x))
            .attr('cy', d => y(d.y))
            .attr('fill', d => (d.color == 'transparent' ? '#AAA' : d.color)),
        exit => exit.remove()
      );

    this._links
      .selectAll('line')
      .data(d.links, d => d.target.id + d.source.id)
      .join(
        enter =>
          enter
            .append('line')
            .attr('stroke-width', d => 3)
            .attr('stroke', d =>
              d.source.color == 'transparent' ? '#AAA' : d.source.color
            )
            .attr('x1', d => x(d.source.x))
            .attr('y1', d => y(d.source.y))
            .attr('x2', d => x(d.target.x))
            .attr('y2', d => y(d.target.y)),
        update =>
          update
            .attr('stroke', d =>
              d.source.color == 'transparent' ? '#AAA' : d.source.color
            )
            .attr('x1', d => x(d.source.x))
            .attr('y1', d => y(d.source.y))
            .attr('x2', d => x(d.target.x))
            .attr('y2', d => y(d.target.y)),
        exit => exit.remove()
      );
  }
}
