

# Orcha

Recreate Art by Ward Shelley

# Instructions
npm install

If you get Error: Can't resolve 'webworker-threads'
Go to ./node_modules/elkjs/lib/main.js and comment out
```
// require.resolve('webworker-threads');
// workerThreadsExist = true;
// var _require = require('webworker-threads'),
//     Worker = _require.Worker;
```

# License

Distributed under the MIT License. See `LICENSE` for more information.

# Contact

Fabian Bolte - fabian.bolte@web.de