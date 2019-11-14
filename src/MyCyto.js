import cytoscape from 'cytoscape';
import cytoDagre from 'cytoscape-dagre';
import klay from 'cytoscape-klay';
import ELK from 'elkjs';
import dagre from 'dagre';
cytoscape.use(cytoDagre);
cytoscape.use(klay);

export default class MyCyto {
  constructor(container) {
    this._layoutName = 'myForce';
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
            label: 'data(id)',
            // width: 'label',
            height: 'data(size)',
            shape: 'rectangle'
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
    } else if (this._layoutName == 'myForce') this.updateGraph(data);
  }

  updateGraph(data) {
    this._graph.json(data);
    this._graph.layout(this._layout).run();
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
    let d3data = this.__cytoToD3(data);
    this._myForce.data(d3data);
    this._myForce.run();
  }
}
