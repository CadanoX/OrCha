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
    this._links = this._svg.append('g').attr('class', 'links');
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
      .range([this._height / 4, this._height]);

    // add stream nodes
    this._nodes
      .selectAll('rect')
      .data(d.nodes)
      .join(
        enter =>
          enter
            // .append('rect')
            // .attr('width', 2.5)
            // .attr('height', d => d.height * 10)
            .append('rect')
            .filter(
              d => !d.name.startsWith('labeltag') && !d.name.startsWith('tag')
            )
            .attr('width', 20)
            .attr('height', d => d.height * 5)
            .attr('x', d => x(d.x) - 10)
            .attr('y', d => y(d.y) - d.height * 2.5)
            .attr('fill', d => d.color)
            .attr('stroke', 'black'),
        update => update.attr('y', d => y(d.y) - d.height * 2.5),
        exit => exit.remove()
      );
    // add label nodes

    this._nodes
      .selectAll('ellipse')
      .data(d.nodes)
      .join(
        enter =>
          enter
            // .append('rect')
            // .attr('width', 2.5)
            // .attr('height', d => d.height * 10)
            .append('ellipse')
            .filter(d => d.name.startsWith('tag'))
            .attr('rx', 10)
            // .attr('ry', d => (d.height * 5 > 10 ? d.height * 5 : 10))
            .attr('ry', 10)
            .attr('cx', d => x(d.x))
            .attr('cy', d => y(d.y))
            .attr('fill', d => (d.color == 'transparent' ? '#AAA' : d.color))
            .attr('stroke', 'black'),
        update => update.attr('cy', d => y(d.y)),
        exit => exit.remove()
      );

    this._links
      .selectAll('line')
      .data(d.links)
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
          update.attr('y1', d => y(d.source.y)).attr('y2', d => y(d.target.y)),
        exit => exit.remove()
      );
  }
}
