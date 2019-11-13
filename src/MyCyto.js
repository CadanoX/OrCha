import cytoscape from 'cytoscape';
import cytoDagre from 'cytoscape-dagre';
import klay from 'cytoscape-klay';
import ELK from 'elkjs';
import dagre from 'dagre';
import * as d3 from 'd3';
cytoscape.use(cytoDagre);
cytoscape.use(klay);

export default class MyCyto {
  constructor(container, callback) {
    this._callback = callback;
    this._layoutName = 'dagre';
    this._graphNodes;
    this._elk = new ELK({
      algorithms: ['mrtree', 'dot', 'layered']
    });

    switch (this._layoutName) {
      case 'cytoDagre':
        this._layout = {
          name: 'dagre',
          rankDir: 'LR'
        };
        break;
      case 'klay':
        this._layout = {
          name: 'klay',
          nodeDimensionsIncludeLabels: true,
          klay: {
            // nodeLayering: 'INTERACTIVE',
            layoutHierarchy: true,
            nodePlacement: 'LINEAR_SEGMENTS', //'LINEAR_SEGMENTS',
            thoroughness: 50
          }
        };
        break;
      case 'elk': // fall through
      case 'dagre':
      case 'myForce':
        this._layout = { name: 'preset' };
        break;
      default:
        this._layout = { name: 'mrtree' };
        break;
    }

    this._graph = cytoscape({
      container,
      style: [
        {
          selector: 'node',
          style: {
            backgroundColor: 'data(color)', //'rgb(221, 119, 119)',
            label: 'data(id)'
            // width: 'label',
            // height: 'data(size)'
          }
        },
        // compunt nodes
        {
          selector: ':parent',
          css: {
            'background-color': '#555',
            'background-opacity': '0.5'
          }
        },
        {
          selector: 'edge',
          style: {
            width: 3,
            'line-color': '#ccc',
            'target-arrow-color': '#ccc',
            'target-arrow-shape': 'triangle'
          }
        },
        {
          selector: 'label',
          style: {
            color: '#DDD'
          }
        }
      ],
      layout: this._layout
    });
  }

  data(data) {
    if (this._layoutName == 'elk') this._runElk(data);
    else if (this._layoutName == 'dagre') {
      data = this._runDagre(data);
      this.updateGraph(data);
    } else if (this._layoutName == 'myForce') this._runMyForce(data);
  }

  updateGraph(data) {
    this._graph.json(data);
    this._graph.layout(this._layout).run();
    this._callback(data);
  }

  _runElk(data) {
    let elkData = this.__cytoToElk(data);
    this._elk
      .layout(elkData, {
        layoutOptions: {}
      })
      .then(graph => this.updateGraph(this.__elkToCyto(graph)))
      .catch(console.error);
  }

  __cytoToElk(data) {
    return {
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'mrtree' },
      children: data.elements.nodes.map(
        d =>
          (d = {
            ...d.data,
            ...d.position
          })
      ),
      edges: data.elements.edges.map(d => d.data)
    };
  }

  __elkToCyto(data) {
    return {
      elements: {
        nodes: data.children.map(
          d =>
            (d = {
              data: {
                id: d.id,
                width: d.width,
                height: d.height,
                color: d.color
              },
              position: {
                x: d.x,
                y: d.y
              }
            })
        ),
        edges: data.edges.map(
          d =>
            (d = {
              data: { ...d }
            })
        )
      }
    };
  }

  _runDagre(data) {
    let dagreData = this.__cytoToDagre(data);
    dagre.layout(dagreData);
    return this.__dagreToCyto(dagreData);
  }

  __cytoToDagre(data) {
    let graph = new dagre.graphlib.Graph({
      compound: true
    });
    graph.setGraph({
      rankDir: 'LR',
      ranker: 'none'
    });
    graph.setDefaultEdgeLabel(function() {
      return {};
    });

    let ports = {};
    for (let node of data.elements.nodes) {
      if (!node.data.parent)
        // Workaround for ports
        graph.setNode(node.data.id, { ...node.data });
      else if (node.data.id.includes('port')) ports[node.data.id] = node.data;
    }
    // for (let node of data.elements.nodes) {
    //   if (node.data.parent) {
    //     graph.setNode('cluster' + node.data.parent);
    //     graph.setParent(node.data.id, 'cluster' + node.data.parent);
    //     graph.setParent(node.data.parent, 'cluster' + node.data.parent);
    //   }
    // }
    for (let edge of data.elements.edges) {
      if (ports[edge.data.target])
        graph.setEdge(edge.data.source, ports[edge.data.target].parent);
      else graph.setEdge(edge.data.source, edge.data.target);
    }

    return graph;
  }

  __dagreToCyto(graph) {
    let nodes = [];
    let edges = [];

    for (let id of graph.nodes()) {
      let node = graph.node(id);
      nodes.push({
        data: {
          id: node.id,
          width: node.width,
          height: node.height,
          color: node.color
        },
        position: { x: node.x, y: node.y }
      });
    }

    for (let edge of graph.edges()) {
      edges.push({
        data: {
          id: edge.v + edge.w,
          source: edge.v,
          target: edge.w
        }
      });
    }

    return { elements: { nodes, edges } };
  }

  _runMyForce(data) {
    data = this.__cytoToD3(data);
    // fix nodes in x direction
    data.nodes.forEach(d => {
      d.fx = +d.rank * 100;
    });
    let sim = d3.forceSimulation();
    sim.velocityDecay(0.01); // default 0.4
    sim.alphaDecay(0.05); // default 0.028
    sim.nodes(data.nodes);
    // keep inside window
    sim.force('y', d3.forceY(5000 / 2).strength(0.05));
    //apply link force
    sim.force(
      'link',
      d3
        .forceLink(data.links)
        .id(d => d.id)
        .strength(d => {
          let sourceTag = d.source.id.split('1')[0];
          if (d.target.id.startsWith(sourceTag)) return 1;
          else return 1;
        })
    );
    // sim.force('charge', d3.forceManyBody().strength(-5));
    sim.force('collide', d3.forceCollide().radius(d => 20));

    // force nodes back into their parent elements
    sim.on('tick', () => {
      // for (let i = 0; i < data.nodes.length; i++) {
      //   let node = data.nodes[i];
      // }

      // for (let i = 0; i < data.links.length; i++) {
      //   let link = data.links[i];
      //   link.x1 = link.source.x;
      //   link.x2 = link.target.x;
      // }
      this.updateGraph(this.__d3ToCyto(data));
    });
    sim.on('end', () => this.updateGraph(this.__d3ToCyto(data)));
  }

  __cytoToD3(data) {
    let nodes = data.elements.nodes.map(d => d.data);
    let links = data.elements.edges.map(d => d.data);
    return { nodes, links };
  }

  __d3ToCyto(data) {
    let nodes = [];
    let edges = [];

    for (let node of data.nodes) {
      nodes.push({
        data: {
          id: node.id,
          width: node.width,
          height: node.height,
          color: node.color,
          name: node.name,
          time: node.time
        },
        position: { x: node.x, y: node.y }
      });
    }

    for (let link of data.links) {
      edges.push({
        data: {
          id: link.source.id + link.target.id,
          source: link.source.id,
          target: link.target.id
        }
      });
    }
    return { elements: { nodes, edges } };
  }
}
