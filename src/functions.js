export function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

export function randomize(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    let temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

export function d3ToCyto(data) {
  let nodes = [];
  let edges = [];

  for (let node of data.nodes) {
    nodes.push({
      data: {
        id: node.id,
        width: node.width,
        size: node.height,
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
