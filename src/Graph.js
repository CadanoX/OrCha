export default class Graph {
  constructor(container) {
    this._data = {
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered' },
      children: [
        { id: 'n1', width: 30, height: 30 },
        { id: 'n2', width: 30, height: 30 },
        { id: 'n3', width: 30, height: 30 }
      ],
      edges: [
        { id: 'e1', sources: ['n1'], targets: ['n2'] },
        { id: 'e2', sources: ['n1'], targets: ['n3'] }
      ]
    };

    this._graph = new ELK({
      // workerUrl: '../node_modules/elkjs/lib/elk-worker.min.js'
    });

    this._graph
      .layout(this._data, {
        layoutOptions: {}
      })
      .then(graph => console.log(graph))
      .catch(console.error);
  }
}
