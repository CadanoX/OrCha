/* DATA FORMAT
{
  streams: [
    'a': {
      start: 1920,
      end: 1980
    },
    'b': {
      start: 1915,
      end: 1945
      values: [
        { }
      ]
    }
  ]
}

CSV ALTERNATIVE
name,start,end,values
a,1920,1980,
b,1915,1945,1920:2/1940:3
*/

import { SplitStreamInputData } from '../libs/SplitStreams.js';
import Papa from 'papaparse';

function transform(csv) {
  let format = new SplitStreamInputData();

  let data;
  try {
    data = Papa.parse(csv, { header: true }).data;
  } catch (e) {
    alert(e);
    return false;
  }

  for (let stream of data) {
    if (stream.start > stream.end) continue;
    for (let t = stream.start; t <= stream.end; t++)
      format.addNode(t, stream.name);
  }

  format.buildTimeConnections();
  format.finalize();
  return format;
}

export default transform;
