import * as d3 from 'd3';

export default class MyGraph {
  constructor(container) {
    this._width = container.clientWidth;
    this._height = container.clientHeight;
    this._svg = d3
      .select(container)
      .append('svg')
      .attr('width', this._width)
      .attr('height', this._height)
      .call(
        d3
          .zoom()
          .scaleExtent([0.5, 4])
          .on('zoom', () => {
            this._nodes.attr('transform', d3.event.transform);
          })
      );
    this._nodes = this._svg.append('g').attr('class', 'nodes');
    this._domainX = [Infinity, 0];
    this._domainY = [Infinity, 0];
  }

  data(d) {
    return d == null ? this._data : (this._setData(d), this);
  }

  _setData(d) {
    d.nodes.forEach(d => {
      this._domainX[0] = Math.min(this._domainX[0], d.x);
      this._domainX[1] = Math.max(this._domainX[1], d.x);
      this._domainY[0] = Math.min(this._domainY[0], d.y);
      this._domainY[1] = Math.max(this._domainY[1], d.y + d.height);
    });

    let x = d3
      .scaleLinear()
      .domain(this._domainX)
      .range([0, this._width]);

    let y = d3
      .scaleLinear()
      .domain(this._domainY)
      .range([0, this._height]);

    this._nodes
      .selectAll('rect')
      .data(d.nodes)
      .join(
        enter =>
          enter
            .append('rect')
            .attr('width', 2.5)
            .attr('height', d => d.height * 10)
            .attr('x', d => x(d.x))
            .attr('y', d => y(d.y))
            .attr('fill', d => d.color),
        update => update.attr('y', d => y(d.y)),
        exit => exit.remove()
      );
  }
}
